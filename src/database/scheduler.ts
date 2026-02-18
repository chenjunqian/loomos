import { getDueJobs, updateJobAfterExecution, type ScheduledJob } from './scheduled-job'
import { saveTaskRecord } from './task-record'
import { createTaskForQueue, getDatabaseProvider } from './task-queue'
import { logger } from '../utils/logger'
import { AgentStatus } from '../agent/types'

const provider = getDatabaseProvider()
const isSQLite = provider === 'sqlite'
const pollIntervalMs = isSQLite ? 60000 : 30000

interface SchedulerState {
    running: boolean
    intervalId: ReturnType<typeof setInterval> | null
}

const state: SchedulerState = {
    running: false,
    intervalId: null,
}

async function processScheduledJob(job: ScheduledJob): Promise<void> {
    logger.info('Scheduler', `Processing scheduled job: ${job.name} (${job.id})`)

    try {
        const taskRecord = await saveTaskRecord({
            userId: job.userId,
            taskContent: job.task,
            role: 'user',
            status: AgentStatus.Idle,
        })

        await createTaskForQueue({
            userId: job.userId,
            taskRecordId: taskRecord.id,
            priority: 0,
        })

        logger.info('Scheduler', `Enqueued task ${taskRecord.id} for scheduled job ${job.id}`)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Scheduler', `Failed to enqueue scheduled job ${job.id}: ${errorMessage}`)

        await updateJobAfterExecution(job.id, false, errorMessage)
    }
}

async function checkAndProcessJobs(): Promise<void> {
    if (!state.running) return

    try {
        const dueJobs = await getDueJobs()

        if (dueJobs.length > 0) {
            logger.debug('Scheduler', `Found ${dueJobs.length} due job(s)`)
        }

        for (const job of dueJobs) {
            await processScheduledJob(job)
        }
    } catch (error) {
        logger.error('Scheduler', `Error checking scheduled jobs: ${error}`)
    }
}

export async function startScheduler(): Promise<void> {
    if (state.running) return

    state.running = true
    logger.info('Scheduler', `Starting scheduler (poll interval: ${pollIntervalMs}ms, provider: ${provider})`)

    await checkAndProcessJobs()

    state.intervalId = setInterval(checkAndProcessJobs, pollIntervalMs)
}

export async function stopScheduler(): Promise<void> {
    if (!state.running) return

    state.running = false

    if (state.intervalId) {
        clearInterval(state.intervalId)
        state.intervalId = null
    }

    logger.info('Scheduler', 'Stopped scheduler')
}

export function isSchedulerRunning(): boolean {
    return state.running
}

export async function markJobCompleted(jobId: string, success: boolean, error?: string): Promise<void> {
    await updateJobAfterExecution(jobId, success, error)
}
