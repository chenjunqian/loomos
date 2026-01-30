import { TaskRecord, AgentStatus, AgentHistoryEntry, MessageRole } from '../agent/types'
import { prisma, TASK_STATUS } from './task-queue'

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