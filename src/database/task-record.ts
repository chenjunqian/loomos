import { TaskRecord, AgentStatus, AgentHistoryEntry } from '../agent/types'
import { prisma } from './task-queue'

export interface CreateTaskRecordInput {
    id?: string
    userId: string
    task: string
    role: string
    status?: AgentStatus
}

export interface UpdateTaskRecordInput {
    status?: AgentStatus
    response?: string
    history?: AgentHistoryEntry[]
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
        })
    }

    return {
        id: record.id,
        userId: record.userId,
        task: record.task,
        status: record.status as AgentStatus,
        response: record.response ?? undefined,
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
            task: input.task,
            status: input.status ?? 'pending',
        },
        create: {
            id: input.id ?? crypto.randomUUID(),
            userId: input.userId,
            task: input.task,
            status: input.status ?? 'pending',
            requiresConfirmation: false,
        },
    })

    return {
        id: taskRecord.id,
        userId: taskRecord.userId,
        task: taskRecord.task,
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
    if (updates.response !== undefined) {
        data.response = updates.response
    }
    if (updates.requiresConfirmation !== undefined) {
        data.requiresConfirmation = updates.requiresConfirmation
    }

    await prisma.taskRecord.update({
        where: { id: taskId },
        data,
    })

    if (updates.history !== undefined) {
        await prisma.taskHistory.deleteMany({
            where: { taskRecordId: taskId },
        })

        if (updates.history.length > 0) {
            const historyEntries = updates.history.map((h) => ({
                taskRecordId: taskId,
                role: h.role,
                content: h.content,
                iteration: h.iteration ?? null,
            }))

            await prisma.taskHistory.createMany({
                data: historyEntries,
            })
        }
    }
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
            })
        }

        return {
            id: record.id,
            userId: record.userId,
            task: record.task,
            status: record.status as AgentStatus,
            response: record.response ?? undefined,
            history,
            requiresConfirmation: record.requiresConfirmation,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        }
    })
}