import { TaskRecord, AgentStatus, AgentHistoryEntry } from '../agent/types'
import { prisma } from './task-queue'

export interface CreateTaskRecordInput {
    id?: string
    userId: string
    task: string
    context?: Record<string, unknown>
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
            contexts: true,
            history: true,
        },
    })

    if (!record) return null

    const context: Record<string, unknown> = {}
    for (const ctx of record.contexts) {
        try {
            context[ctx.key] = JSON.parse(ctx.value)
        } catch {
            context[ctx.key] = ctx.value
        }
    }

    const history: AgentHistoryEntry[] = record.history
        .sort((a, b) => a.iteration - b.iteration)
        .map((h) => ({
            iteration: h.iteration,
            reasoning: h.reasoning,
            action: h.action,
            result: h.result,
            uncertaintyDetected: h.uncertaintyDetected,
            timestamp: h.timestamp,
        }))

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

    if (input.context) {
        await prisma.taskContext.deleteMany({
            where: { taskRecordId: taskRecord.id },
        })

        const contextEntries = Object.entries(input.context).map(([key, value]) => ({
            taskRecordId: taskRecord.id,
            key,
            value: JSON.stringify(value),
        }))

        if (contextEntries.length > 0) {
            await prisma.taskContext.createMany({
                data: contextEntries,
            })
        }
    }

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
                iteration: h.iteration,
                reasoning: h.reasoning,
                action: h.action,
                result: h.result,
                uncertaintyDetected: h.uncertaintyDetected,
                timestamp: h.timestamp,
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
            contexts: true,
            history: true,
        },
        orderBy: { createdAt: 'asc' },
    })

    return records.map((record) => {
        const context: Record<string, unknown> = {}
        for (const ctx of record.contexts) {
            try {
                context[ctx.key] = JSON.parse(ctx.value)
            } catch {
                context[ctx.key] = ctx.value
            }
        }

        const history: AgentHistoryEntry[] = record.history
            .sort((a, b) => a.iteration - b.iteration)
            .map((h) => ({
                iteration: h.iteration,
                reasoning: h.reasoning,
                action: h.action,
                result: h.result,
                uncertaintyDetected: h.uncertaintyDetected,
                timestamp: h.timestamp,
            }))

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
