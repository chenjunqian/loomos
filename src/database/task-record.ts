import { TaskRecord, AgentStatus, AgentHistoryEntry, MessageRole } from '../agent/types'
import { getDatabaseProvider, prisma, TASK_STATUS } from './task-queue'

export async function initializeFTS(): Promise<void> {
    const provider = getDatabaseProvider()

    try {
        if (provider === 'sqlite') {
            await prisma.$executeRaw`
                CREATE VIRTUAL TABLE IF NOT EXISTS task_history_fts USING fts5(
                    content,
                    task_record_id UNINDEXED,
                    role UNINDEXED
                )
            `
            await prisma.$executeRaw`
                CREATE TRIGGER IF NOT EXISTS task_history_ai AFTER INSERT ON TaskHistory BEGIN
                    INSERT INTO task_history_fts(content, task_record_id, role)
                    VALUES (NEW.content, NEW."taskRecordId", NEW.role);
                END
            `
            await prisma.$executeRaw`
                CREATE TRIGGER IF NOT EXISTS task_history_ad AFTER DELETE ON TaskHistory BEGIN
                    INSERT INTO task_history_fts(task_history_fts, content, task_record_id, role)
                    VALUES ('delete', OLD.content, OLD."taskRecordId", OLD.role);
                END
            `
            await prisma.$executeRaw`
                CREATE TRIGGER IF NOT EXISTS task_history_au AFTER UPDATE ON TaskHistory BEGIN
                    INSERT INTO task_history_fts(task_history_fts, content, task_record_id, role)
                    VALUES ('delete', OLD.content, OLD."taskRecordId", OLD.role);
                    INSERT INTO task_history_fts(content, task_record_id, role)
                    VALUES (NEW.content, NEW."taskRecordId", NEW.role);
                END
            `
        } else if (provider === 'postgresql') {
            await prisma.$executeRaw`
                ALTER TABLE "TaskHistory" ADD COLUMN IF NOT EXISTS content_fts tsvector
                GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED
            `
            await prisma.$executeRaw`
                CREATE INDEX IF NOT EXISTS "idx_task_history_fts" 
                ON "TaskHistory" USING GIN (content_fts)
            `
            await prisma.$executeRaw`
                CREATE OR REPLACE FUNCTION task_history_fts_update()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.content_fts := to_tsvector('english', NEW.content);
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            `
            const triggerExists = await prisma.$queryRaw<{ exists: boolean }[]>`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.triggers 
                    WHERE trigger_name = 'task_history_fts_trigger'
                ) as exists
            `
            if (!triggerExists[0]?.exists) {
                await prisma.$executeRaw`
                    CREATE TRIGGER task_history_fts_trigger
                    BEFORE INSERT OR UPDATE ON "TaskHistory"
                    FOR EACH ROW
                    EXECUTE FUNCTION task_history_fts_update()
                `
            }
        }
    } catch (error) {
        console.error('[FTS] Failed to initialize FTS tables:', error)
    }
}

initializeFTS()

export interface CreateTaskRecordInput {
    id?: string
    userId: string
    taskContent: string
    role: string
    status?: AgentStatus
}

export interface UpdateTaskRecordInput {
    status?: AgentStatus
    response?: string
    requiresConfirmation?: boolean
}

export async function getTaskRecord(
    userId: string,
    taskId: string
): Promise<TaskRecord | null> {
    const record = await prisma.taskRecord.findUnique({
        where: { id: taskId, userId },
        include: {
            history: {
                orderBy: { createdAt: 'asc' },
            },
        },
    })

    if (!record) return null

    const history: AgentHistoryEntry[] = []
    for (const entry of record.history) {
        history.push({
            role: entry.role as AgentHistoryEntry['role'],
            content: entry.content,
            iteration: entry.iteration ?? undefined,
            timestamp: entry.createdAt.getTime(),
            tool_call_id: entry.toolCallId ?? undefined,
            tool_calls: entry.toolCalls ? JSON.parse(entry.toolCalls) : undefined,
        })
    }

    return {
        id: record.id,
        userId: record.userId,
        status: record.status as AgentStatus,
        history,
        requiresConfirmation: record.requiresConfirmation,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    }
}

export async function saveTaskRecord(input: CreateTaskRecordInput): Promise<TaskRecord> {
    const taskRecord = await prisma.taskRecord.upsert({
        where: { id: input.id ?? '' },
        update: {
            status: input.status ?? TASK_STATUS.PENDING,
        },
        create: {
            id: input.id ?? crypto.randomUUID(),
            userId: input.userId,
            status: input.status ?? TASK_STATUS.PENDING,
            requiresConfirmation: false,
        },
    })

    if (taskRecord && input.taskContent) {
        await prisma.taskHistory.create({
            data: {
                taskRecordId: taskRecord.id,
                role: input.role,
                content: input.taskContent,
                iteration: null,
            },
        })
    }

    return {
        id: taskRecord.id,
        userId: taskRecord.userId,
        status: taskRecord.status as AgentStatus,
        history: [],
        requiresConfirmation: taskRecord.requiresConfirmation,
        createdAt: taskRecord.createdAt,
        updatedAt: taskRecord.updatedAt,
    }
}

export async function updateTaskRecord(
    taskId: string,
    updates: UpdateTaskRecordInput
): Promise<void> {
    const data: Record<string, unknown> = {}

    if (updates.status !== undefined) {
        data.status = updates.status
    }
    if (updates.requiresConfirmation !== undefined) {
        data.requiresConfirmation = updates.requiresConfirmation
    }

    await prisma.taskRecord.update({
        where: { id: taskId },
        data,
    })
}

export async function saveTaskHistory(
    taskRecordId: string,
    entry: AgentHistoryEntry
): Promise<void> {
    await prisma.taskHistory.create({
        data: {
            taskRecordId,
            role: entry.role,
            content: entry.content,
            iteration: entry.iteration ?? null,
            toolCallId: entry.tool_call_id ?? null,
            toolCalls: entry.tool_calls ? JSON.stringify(entry.tool_calls) : null,
            createdAt: new Date(entry.timestamp),
        },
    })
}

export async function getTaskHistory(
    userId: string,
    taskId: string,
    role?: MessageRole
): Promise<AgentHistoryEntry[]> {
    const where: Record<string, unknown> = {
        taskRecord: {
            userId,
            id: taskId,
        },
    }
    if (role) where.role = role

    const history = await prisma.taskHistory.findMany({
        where,
        orderBy: { createdAt: 'asc' },
    })

    return history.map((entry) => ({
        role: entry.role as MessageRole,
        content: entry.content,
        iteration: entry.iteration ?? undefined,
        timestamp: entry.createdAt.getTime(),
        tool_call_id: entry.toolCallId ?? undefined,
        tool_calls: entry.toolCalls ? JSON.parse(entry.toolCalls) : undefined,
    }))
}

export interface HistorySearchResult {
    taskRecordId: string
    role: string
    content: string
    timestamp: number
}

export async function searchTaskHistory(
    userId: string,
    query: string,
    limit: number = 5
): Promise<HistorySearchResult[]> {
    const provider = getDatabaseProvider()

    let results: HistorySearchResult[]

    if (provider === 'sqlite') {
        const escapedQuery = query.replace(/"/g, '""')

        results = await prisma.$queryRaw<HistorySearchResult[]>`
            SELECT 
                h.task_record_id as "taskRecordId",
                h.role,
                h.content,
                h.created_at as "timestamp"
            FROM task_history h
            INNER JOIN task_record t ON h.task_record_id = t.id
            WHERE t.user_id = ${userId}
                AND h.role IN ('user', 'assistant')
                AND h.id IN (
                    SELECT id FROM task_history 
                    WHERE task_record_id = h.task_record_id 
                    AND rowid = (
                        SELECT rowid FROM task_history_fts 
                        WHERE task_history_fts MATCH ${`"${escapedQuery}"`}
                        AND task_record_id = h.task_record_id
                        LIMIT 1
                    )
                )
            ORDER BY h.created_at DESC
            LIMIT ${limit}
        `
    } else {
        results = await prisma.$queryRaw<HistorySearchResult[]>`
            SELECT 
                h."taskRecordId",
                h.role,
                h.content,
                EXTRACT(EPOCH FROM h."createdAt") * 1000 as "timestamp"
            FROM "TaskHistory" h
            INNER JOIN "TaskRecord" t ON h."taskRecordId" = t.id
            WHERE t."userId" = ${userId}
                AND h.role IN ('user', 'assistant')
                AND h.content_fts @@ plainto_tsquery('english', ${query})
            ORDER BY ts_rank(h.content_fts, plainto_tsquery('english', ${query})) DESC
            LIMIT ${limit}
        `
    }

    return results.map((r) => ({
        taskRecordId: r.taskRecordId,
        role: r.role,
        content: r.content,
        timestamp: new Date(r.timestamp).getTime(),
    }))
}

export async function getPendingConfirmations(
    userId: string
): Promise<TaskRecord[]> {
    const records = await prisma.taskRecord.findMany({
        where: {
            userId,
            requiresConfirmation: true,
            status: 'awaiting_confirmation',
        },
        include: {
            history: {
                orderBy: { createdAt: 'asc' },
            },
        },
        orderBy: { createdAt: 'asc' },
    })

    return records.map((record) => {
        const history: AgentHistoryEntry[] = []

        for (const entry of record.history) {
            history.push({
                role: entry.role as AgentHistoryEntry['role'],
                content: entry.content,
                iteration: entry.iteration ?? undefined,
                timestamp: entry.createdAt.getTime(),
                tool_call_id: entry.toolCallId ?? 'no_tool_call',
            })
        }

        return {
            id: record.id,
            userId: record.userId,
            status: record.status as AgentStatus,
            history,
            requiresConfirmation: record.requiresConfirmation,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        }
    })
}