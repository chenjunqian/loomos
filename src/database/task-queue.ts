import { PrismaClient, TaskQueue } from '@prisma/client'

const prisma = new PrismaClient()

export const TASK_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS]

export interface CreateTaskInput {
    userId: string
    taskRecordId: string
    priority?: number
    maxAttempts?: number
}

export interface TaskWithStatus extends TaskQueue {
    status: TaskStatus
}

export async function createTask(input: CreateTaskInput): Promise<TaskQueue> {
    return await prisma.taskQueue.create({
        data: {
            userId: input.userId,
            taskRecordId: input.taskRecordId,
            priority: input.priority ?? 0,
            maxAttempts: input.maxAttempts ?? 3,
            status: TASK_STATUS.PENDING,
        },
    })
}

export async function claimTask(workerId: string): Promise<TaskQueue | null> {
    const provider = process.env.DATABASE_PROVIDER || 'sqlite'

    if (provider === 'postgresql') {
        return await claimTaskPostgreSQL(workerId)
    }
    return await claimTaskSQLite(workerId)
}

async function claimTaskSQLite(workerId: string): Promise<TaskQueue | null> {
    return await prisma.$transaction(async (tx) => {
        const task = await tx.taskQueue.findFirst({
            where: {
                status: TASK_STATUS.PENDING,
            },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'asc' },
            ],
            take: 1,
        })

        if (!task) return null

        const updated = await tx.taskQueue.update({
            where: { id: task.id },
            data: {
                status: TASK_STATUS.PROCESSING,
                workerId,
                startedAt: new Date(),
                attempts: { increment: 1 },
            },
        })

        return updated
    })
}

async function claimTaskPostgreSQL(workerId: string): Promise<TaskQueue | null> {
    const result = await prisma.$queryRaw`
    UPDATE "TaskQueue"
    SET 
      status = 'processing',
      "workerId" = ${workerId},
      "startedAt" = NOW(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "TaskQueue"
      WHERE status = 'pending'
      ORDER BY priority DESC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `

    const tasks = result as TaskQueue[]
    return tasks[0] || null
}

export async function completeTask(
    taskId: string,
    success: boolean,
    error?: string
): Promise<void> {
    await prisma.taskQueue.update({
        where: { id: taskId },
        data: {
            status: success ? TASK_STATUS.COMPLETED : TASK_STATUS.FAILED,
            completedAt: new Date(),
            error: error ?? null,
        },
    })
}

export async function getTaskById(taskId: string): Promise<TaskQueue | null> {
    return await prisma.taskQueue.findUnique({
        where: { id: taskId },
    })
}

export async function getPendingTasks(): Promise<TaskQueue[]> {
    return await prisma.taskQueue.findMany({
        where: { status: TASK_STATUS.PENDING },
        orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' },
        ],
    })
}

export async function getProcessingTasks(): Promise<TaskQueue[]> {
    return await prisma.taskQueue.findMany({
        where: { status: TASK_STATUS.PROCESSING },
    })
}

export async function recoverStaleTasks(
    staleThresholdMs: number = 5 * 60 * 1000
): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleThresholdMs)

    const result = await prisma.taskQueue.updateMany({
        where: {
            status: TASK_STATUS.PROCESSING,
            startedAt: { lt: staleThreshold },
        },
        data: {
            status: TASK_STATUS.PENDING,
            workerId: null,
            startedAt: null,
        },
    })

    return result.count
}

export async function getTaskStats(): Promise<{
    pending: number
    processing: number
    completed: number
    failed: number
}> {
    const [pending, processing, completed, failed] = await Promise.all([
        prisma.taskQueue.count({ where: { status: TASK_STATUS.PENDING } }),
        prisma.taskQueue.count({ where: { status: TASK_STATUS.PROCESSING } }),
        prisma.taskQueue.count({ where: { status: TASK_STATUS.COMPLETED } }),
        prisma.taskQueue.count({ where: { status: TASK_STATUS.FAILED } }),
    ])

    return { pending, processing, completed, failed }
}

export { prisma }
