import { randomUUID } from 'node:crypto'
import {
    claimTask,
    completeTask,
    recoverStaleTasks,
} from '../database/task-queue'
import { getTaskRecord, updateTaskRecord, saveTaskHistory } from '../database/task-record'
import { createAgent } from '../agent'
import { AgentInput, AgentStatus } from '../agent/types'
import { TaskQueue } from '@prisma/client'

const provider = process.env.DATABASE_PROVIDER || 'sqlite'
const isSQLite = provider === 'sqlite'
const defaultConcurrency = isSQLite ? 3 : 20
const defaultPollIntervalMs = isSQLite ? 2000 : 1000

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms))

const processTask = async (
    task: TaskQueue,
    callbacks: {
        onTaskComplete: (task: TaskQueue, success: boolean, error?: string) => void
        onTaskError: (task: TaskQueue, error: Error) => void
    }
): Promise<void> => {
    try {
        const existingRecord = await getTaskRecord(task.userId, task.taskRecordId)
        const historyList = existingRecord?.history || []
        const latestHistory = historyList[historyList.length - 1]
        if (!latestHistory) {
            throw new Error('No history found for task')
        }
        const input: AgentInput = {
            task: latestHistory.content,
            userId: task.userId,
            taskId: task.taskRecordId,
            taskHistory: historyList,
            maxIterations: 20,
            thinkingMode: 'auto',
        }

        const onProgress = async (entry: Parameters<typeof saveTaskHistory>[1]): Promise<void> => {
            await saveTaskHistory(task.taskRecordId, entry)
        }

        const agent = createAgent(input, onProgress)
        const result = await agent.run(input)

        await updateTaskRecord(task.taskRecordId, {
            status: result.status,
            requiresConfirmation: result.requiresConfirmation,
        })

        await completeTask(task.id, true)
        callbacks.onTaskComplete(task, true)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        await updateTaskRecord(task.id, {
            status: AgentStatus.Error,
        })

        await completeTask(task.id, false, errorMessage)
        callbacks.onTaskComplete(task, false, errorMessage)
        callbacks.onTaskError(task, error as Error)
        console.error(`[WorkerPool] Task ${task.id} failed:`, errorMessage)
    }
}

const runWorker = (
    workerName: string,
    workerId: string,
    state: {
        running: boolean
        workers: Map<string, boolean>
    },
    options: {
        concurrency: number
        pollIntervalMs: number
        staleThresholdMs: number
        onTaskStart: (task: TaskQueue) => void
        onTaskComplete: (task: TaskQueue, success: boolean, error?: string) => void
        onTaskError: (task: TaskQueue, error: Error) => void
    }
): (() => Promise<void>) => {
    let backoffMs = 1000

    const workerLoop = async (): Promise<void> => {
        while (state.running) {
            try {
                const task = await claimTask(workerId)

                if (!task) {
                    await sleep(options.pollIntervalMs)
                    continue
                }

                backoffMs = 1000
                state.workers.set(workerName, true)
                options.onTaskStart(task)

                await processTask(task, {
                    onTaskComplete: options.onTaskComplete,
                    onTaskError: options.onTaskError,
                })

                state.workers.set(workerName, false)
            } catch (error) {
                if (isSQLite && (error as Error)?.message?.includes('timed out')) {
                    backoffMs = Math.min(backoffMs * 2, 30000)
                    await sleep(backoffMs)
                } else {
                    await sleep(backoffMs)
                }
            }
        }
    }

    return workerLoop
}

export interface WorkerPool {
    start: () => Promise<void>
    stop: () => Promise<void>
    isRunning: () => boolean
    getActiveWorkers: () => number
}

export interface WorkerPoolOptions {
    concurrency?: number
    pollIntervalMs?: number
    staleThresholdMs?: number
    onTaskStart?: (task: TaskQueue) => void
    onTaskComplete?: (task: TaskQueue, success: boolean, error?: string) => void
    onTaskError?: (task: TaskQueue, error: Error) => void
}

export const createWorkerPool = (options: WorkerPoolOptions = {}): WorkerPool => {
    const workerId = randomUUID()
    const state = {
        running: false,
        workers: new Map<string, boolean>(),
        pollIntervalId: null as ReturnType<typeof setInterval> | null,
        workerLoops: [] as (() => Promise<void>)[],
    }

    const effectiveOptions = {
        concurrency: options.concurrency ?? defaultConcurrency,
        pollIntervalMs: options.pollIntervalMs ?? defaultPollIntervalMs,
        staleThresholdMs: options.staleThresholdMs ?? 5 * 60 * 1000,
        onTaskStart: options.onTaskStart ?? (() => { }),
        onTaskComplete: options.onTaskComplete ?? (() => { }),
        onTaskError: options.onTaskError ?? (() => { }),
    }

    const start = async (): Promise<void> => {
        if (state.running) return

        state.running = true
        console.log(`[WorkerPool] Starting with ${effectiveOptions.concurrency} workers (provider: ${provider})`)

        await recoverStaleTasks(effectiveOptions.staleThresholdMs)

        for (let i = 0; i < effectiveOptions.concurrency; i++) {
            const workerName = `worker-${i}`
            state.workers.set(workerName, false)
            const workerLoop = runWorker(workerName, workerId, state, effectiveOptions)
            state.workerLoops.push(workerLoop)
            workerLoop()
        }

        state.pollIntervalId = setInterval(async () => {
            if (!state.running) return
            await recoverStaleTasks(effectiveOptions.staleThresholdMs)
        }, effectiveOptions.staleThresholdMs / 2)
    }

    const stop = async (): Promise<void> => {
        state.running = false

        if (state.pollIntervalId) {
            clearInterval(state.pollIntervalId)
            state.pollIntervalId = null
        }

        await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
                let allIdle = true
                for (const busy of Array.from(state.workers.values())) {
                    if (busy) {
                        allIdle = false
                        break
                    }
                }
                if (allIdle) {
                    clearInterval(checkInterval)
                    resolve()
                }
            }, 100)
        })

        console.log('[WorkerPool] Stopped')
    }

    const isRunning = (): boolean => state.running

    const getActiveWorkers = (): number => {
        let active = 0
        for (const busy of Array.from(state.workers.values())) {
            if (busy) active++
        }
        return active
    }

    return {
        start,
        stop,
        isRunning,
        getActiveWorkers,
    }
}

export const workerPool = createWorkerPool()
