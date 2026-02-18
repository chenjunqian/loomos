import { PrismaClient } from '@prisma/client'
import type { ScheduledJob } from '@prisma/client'
import cronParser from 'cron-parser'

export type { ScheduledJob }

const prisma = new PrismaClient()

export interface CreateScheduledJobInput {
    userId: string
    name: string
    task: string
    cronExpression?: string
    runAt?: Date
    timezone?: string
    maxRetries?: number
}

export interface UpdateScheduledJobInput {
    name?: string
    task?: string
    cronExpression?: string | null
    runAt?: Date | null
    timezone?: string
    maxRetries?: number
    enabled?: boolean
}

export interface ListScheduledJobsOptions {
    enabled?: boolean
    includeDisabled?: boolean
}

function calculateNextRun(
    cronExpression: string | undefined,
    runAt: Date | undefined,
    timezone: string
): Date {
    if (runAt) {
        return runAt
    }

    if (cronExpression) {
        try {
            const interval = cronParser.parseExpression(cronExpression, {
                tz: timezone,
            })
            return interval.next().toDate()
        } catch (error) {
            throw new Error(`Invalid cron expression: ${cronExpression}`)
        }
    }

    throw new Error('Either cronExpression or runAt must be provided')
}

export async function createScheduledJob(input: CreateScheduledJobInput): Promise<ScheduledJob> {
    const { userId, name, task, cronExpression, runAt, timezone = 'UTC', maxRetries = 3 } = input

    if (!cronExpression && !runAt) {
        throw new Error('Either cronExpression or runAt must be provided')
    }

    if (cronExpression && runAt) {
        throw new Error('Cannot specify both cronExpression and runAt')
    }

    const nextRunAt = calculateNextRun(cronExpression, runAt, timezone)

    return await prisma.scheduledJob.create({
        data: {
            userId,
            name,
            task,
            cronExpression: cronExpression || null,
            runAt: runAt || null,
            timezone,
            nextRunAt,
            maxRetries,
            enabled: true,
        },
    })
}

export async function getScheduledJob(id: string, userId: string): Promise<ScheduledJob | null> {
    return await prisma.scheduledJob.findFirst({
        where: {
            id,
            userId,
        },
    })
}

export async function listScheduledJobs(
    userId: string,
    options: ListScheduledJobsOptions = {}
): Promise<ScheduledJob[]> {
    const { enabled, includeDisabled = false } = options

    return await prisma.scheduledJob.findMany({
        where: {
            userId,
            ...(includeDisabled ? {} : { enabled: enabled ?? true }),
        },
        orderBy: {
            nextRunAt: 'asc',
        },
    })
}

export async function updateScheduledJob(
    id: string,
    userId: string,
    data: UpdateScheduledJobInput
): Promise<ScheduledJob> {
    const existing = await getScheduledJob(id, userId)
    if (!existing) {
        throw new Error('Scheduled job not found')
    }

    const updateData: Partial<ScheduledJob> = { ...data }

    if (data.cronExpression !== undefined || data.runAt !== undefined || data.timezone) {
        const cronExpr = data.cronExpression ?? existing.cronExpression ?? undefined
        const runAtTime = data.runAt ?? existing.runAt ?? undefined
        const tz = data.timezone ?? existing.timezone

        updateData.nextRunAt = calculateNextRun(cronExpr ?? undefined, runAtTime ?? undefined, tz)
    }

    return await prisma.scheduledJob.update({
        where: { id },
        data: updateData,
    })
}

export async function deleteScheduledJob(id: string, userId: string): Promise<void> {
    const result = await prisma.scheduledJob.deleteMany({
        where: {
            id,
            userId,
        },
    })

    if (result.count === 0) {
        throw new Error('Scheduled job not found')
    }
}

export async function getDueJobs(): Promise<ScheduledJob[]> {
    const now = new Date()

    return await prisma.scheduledJob.findMany({
        where: {
            enabled: true,
            nextRunAt: { lte: now },
        },
        orderBy: {
            nextRunAt: 'asc',
        },
    })
}

export async function updateJobAfterExecution(
    id: string,
    success: boolean,
    error?: string
): Promise<ScheduledJob> {
    const job = await prisma.scheduledJob.findUnique({ where: { id } })
    if (!job) {
        throw new Error('Scheduled job not found')
    }

    const isOneTime = !job.cronExpression

    if (isOneTime) {
        return await prisma.scheduledJob.update({
            where: { id },
            data: {
                lastRunAt: new Date(),
                lastStatus: success ? 'success' : 'failed',
                lastError: error ?? null,
                enabled: false,
            },
        })
    }

    if (success) {
        const nextRunAt = calculateNextRun(job.cronExpression!, undefined, job.timezone)
        return await prisma.scheduledJob.update({
            where: { id },
            data: {
                lastRunAt: new Date(),
                lastStatus: 'success',
                lastError: null,
                retryCount: 0,
                nextRunAt,
                enabled: true,
            },
        })
    }

    const newRetryCount = job.retryCount + 1
    if (newRetryCount >= job.maxRetries) {
        return await prisma.scheduledJob.update({
            where: { id },
            data: {
                lastRunAt: new Date(),
                lastStatus: 'failed',
                lastError: error ?? null,
                retryCount: newRetryCount,
                enabled: false,
            },
        })
    }

    const retryAt = new Date(Date.now() + 5 * 60 * 1000)
    return await prisma.scheduledJob.update({
        where: { id },
        data: {
            lastRunAt: new Date(),
            lastStatus: 'failed',
            lastError: error ?? null,
            retryCount: newRetryCount,
            nextRunAt: retryAt,
        },
    })
}

export async function triggerScheduledJob(id: string, userId: string): Promise<ScheduledJob> {
    const job = await getScheduledJob(id, userId)
    if (!job) {
        throw new Error('Scheduled job not found')
    }

    return await prisma.scheduledJob.update({
        where: { id },
        data: {
            nextRunAt: new Date(),
        },
    })
}

export { prisma }
