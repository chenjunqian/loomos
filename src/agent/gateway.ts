import {
    getTaskRecord,
    saveTaskRecord,
    getTaskHistory as getTaskHistoryFromDb,
    updateTaskRecord,
} from '../database/task-record'
import { createTaskForQueue, completeTask, prisma, TASK_STATUS } from '../database/task-queue'
import { AgentStatus, MessageRole, AgentHistoryEntry } from './types'

export interface CreateTaskOptions {
    taskId?: string
    priority?: number
    maxIterations?: number
    thinkingMode?: 'auto' | 'enabled' | 'disabled'
    apiKey?: string
    baseUrl?: string
    model?: string
    activeSkills?: string[]
}

export interface TaskFilters {
    status?: AgentStatus
    role?: MessageRole
    fromDate?: Date
    toDate?: Date
    limit?: number
    offset?: number
}

export interface TaskInfo {
    taskId: string
    userId: string
    status: AgentStatus
    requiresConfirmation: boolean
    history: AgentHistoryEntry[]
    createdAt: Date
    updatedAt: Date
}

export interface CreateTaskResult {
    taskId: string
    userId: string
    status: string
    message: string
}

export async function createTask(
    userId: string,
    task: string,
    options?: CreateTaskOptions
): Promise<CreateTaskResult> {
    const taskId = options?.taskId || crypto.randomUUID()

    await saveTaskRecord({
        id: taskId,
        userId,
        taskContent: task,
        role: MessageRole.User,
        status: AgentStatus.Idle,
    })

    await createTaskForQueue({
        userId,
        taskRecordId: taskId,
        priority: options?.priority ?? 0,
    })

    return {
        taskId,
        userId,
        status: 'queued',
        message: 'Task has been queued for processing',
    }
}

export async function getTask(
    taskId: string,
    userId: string
): Promise<TaskInfo | null> {
    const record = await getTaskRecord(userId, taskId)

    if (!record) {
        return null
    }

    return {
        taskId: record.id,
        userId: record.userId,
        status: record.status,
        requiresConfirmation: record.requiresConfirmation,
        history: record.history,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    }
}

export async function getTasksByUser(
    userId: string,
    filters?: TaskFilters
): Promise<TaskInfo[]> {
    const where: Record<string, unknown> = { userId }

    if (filters?.status) {
        where.status = filters.status
    }

    const taskRecords = await prisma.taskRecord.findMany({
        where,
        include: {
            history: {
                orderBy: { createdAt: 'asc' },
                ...(filters?.role && { where: { role: filters.role } }),
            },
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
    })

    return taskRecords.map((record) => ({
        taskId: record.id,
        userId: record.userId,
        status: record.status as AgentStatus,
        requiresConfirmation: record.requiresConfirmation,
        history: record.history.map((entry) => ({
            role: entry.role as AgentHistoryEntry['role'],
            content: entry.content,
            iteration: entry.iteration ?? undefined,
            timestamp: entry.createdAt.getTime(),
            tool_call_id: entry.toolCallId ?? undefined,
            tool_calls: entry.toolCalls ? JSON.parse(entry.toolCalls) : undefined,
        })),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    }))
}

export async function getTaskHistory(
    taskId: string,
    userId: string,
    role?: MessageRole
): Promise<AgentHistoryEntry[]> {
    return getTaskHistoryFromDb(userId, taskId, role)
}

export async function confirmTask(
    userId: string,
    taskId: string,
    approved: boolean,
    alternativeInput?: string
): Promise<CreateTaskResult> {
    const existingRecord = await getTaskRecord(userId, taskId)

    if (!existingRecord) {
        throw new Error('Task record not found')
    }

    if (approved === false) {
        const previousQueue = await prisma.taskQueue.findFirst({
            where: {
                userId,
                taskRecordId: taskId,
                status: TASK_STATUS.PROCESSING,
            },
            orderBy: { createdAt: 'desc' },
        })

        if (previousQueue) {
            await completeTask(previousQueue.id, false, 'Rejected by user')
        }
    }

    const taskContent = alternativeInput || ''

    await saveTaskRecord({
        id: taskId,
        userId,
        taskContent,
        role: MessageRole.User,
        status: AgentStatus.Idle,
    })

    await createTaskForQueue({
        userId,
        taskRecordId: taskId,
        priority: 1,
    })

    return {
        taskId,
        userId,
        status: TASK_STATUS.PENDING,
        message: 'Confirmation has been queued for processing',
    }
}

export async function stopTask(
    userId: string,
    taskId: string
): Promise<void> {
    const existingRecord = await getTaskRecord(userId, taskId)

    if (!existingRecord) {
        throw new Error('Task record not found')
    }

    const processingQueue = await prisma.taskQueue.findFirst({
        where: {
            userId,
            taskRecordId: taskId,
            status: TASK_STATUS.PROCESSING,
        },
        orderBy: { createdAt: 'desc' },
    })

    if (processingQueue) {
        await completeTask(processingQueue.id, false, 'Stopped by user')
    }

    await updateTaskRecord(taskId, {
        status: AgentStatus.Error,
    })
}
