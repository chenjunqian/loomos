import { Bot } from 'grammy'
import { createTelegramBot, sendAssistantResponse, sendConfirmationRequest } from './bot'
import { TelegramBotConfig } from './types'
import { getTask } from '../agent/gateway'
import { 
    clearActiveTask,
} from './session'
import { AgentStatus, MessageRole, AgentHistoryEntry } from '../agent/types'
import { TaskQueue } from '@prisma/client'
import { logger } from '../utils/logger'
import { WorkerPool, ProgressCallback, CompleteCallback } from '../queue/worker-pool'
import { prisma } from '../database/task-queue'
import { getTaskRecord } from '../database/task-record'

let bot: Bot | null = null

export function getTelegramBotConfig(): TelegramBotConfig {
    const token = process.env.TELEGRAM_BOT_TOKEN || ''
    const enabled = process.env.TELEGRAM_ENABLED === 'true' && token.length > 0
    
    return {
        token,
        enabled,
    }
}

export function startTelegramBot(workerPool: WorkerPool): Bot | null {
    const config = getTelegramBotConfig()
    
    if (!config.enabled) {
        logger.info('TelegramBot', 'Telegram bot is disabled or no token provided')
        return null
    }
    
    bot = createTelegramBot(config)
    
    const handleProgress: ProgressCallback = (task: TaskQueue, entry) => {
        handleProgressUpdate(task, entry)
    }
    
    const handleComplete: CompleteCallback = (task: TaskQueue, success: boolean, error?: string) => {
        handleTaskComplete(task, success, error)
    }
    
    workerPool.registerProgressCallback(handleProgress)
    workerPool.registerCompleteCallback(handleComplete)
    
    bot.start({
        onStart: async () => {
            try {
                await bot?.api.setMyCommands([
                    { command: 'start', description: 'Show welcome message' },
                    { command: 'status', description: 'Check current task status' },
                    { command: 'cancel', description: 'Cancel current task' },
                    { command: 'new', description: 'Start a new conversation' }
                ])
                logger.info('TelegramBot', 'Telegram bot commands registered')
            } catch (error) {
                logger.error('TelegramBot', `Failed to register commands: ${error}`)
            }
            logger.info('TelegramBot', 'Telegram bot started successfully')
        },
    })
    
    return bot
}

async function handleProgressUpdate(
    task: TaskQueue, 
    entry: AgentHistoryEntry
): Promise<void> {
    if (!bot) return
    
    // Resolve chatId from userId (unified ID) via UserAccount
    const account = await prisma.userAccount.findFirst({
        where: {
            userId: task.userId,
            provider: 'telegram'
        }
    })

    if (!account) return
    const chatId = parseInt(account.providerId)
    if (isNaN(chatId)) return
    
    // Instead of getSession which might skip completed tasks, get the specific task record
    const taskRecord = await getTaskRecord(task.userId, task.taskRecordId)
    if (!taskRecord) return
    
    let lastMessageId: number | undefined = undefined
    if (taskRecord.metadata) {
        try {
            const meta = JSON.parse(taskRecord.metadata)
            if (meta.telegramLastMessageId) {
                lastMessageId = parseInt(meta.telegramLastMessageId)
            }
        } catch (e) {}
    }
    
    if (entry.role === MessageRole.Assistant && entry.content) {
        await sendAssistantResponse(bot, chatId, entry.content, lastMessageId)
    }
}

async function handleTaskComplete(
    task: TaskQueue, 
    _success: boolean, 
    error?: string
): Promise<void> {
    if (!bot) return
    
    const account = await prisma.userAccount.findFirst({
        where: {
            userId: task.userId,
            provider: 'telegram'
        }
    })

    if (!account) return
    const chatId = parseInt(account.providerId)
    if (isNaN(chatId)) return

    const taskInfo = await getTask(task.taskRecordId, task.userId)
    if (!taskInfo) return

    if (taskInfo.status === AgentStatus.AwaitingConfirmation) {
        const lastAssistantEntry = taskInfo.history
            .filter(h => h.role === MessageRole.Assistant)
            .pop()
        
        const confirmationMessage = lastAssistantEntry?.content || 
            'The agent needs your confirmation to proceed.'
        
        await sendConfirmationRequest(bot, chatId, task.taskRecordId, confirmationMessage)
        return
    }
    
    if (taskInfo.status === AgentStatus.Completed) {
        const lastAssistantEntry = taskInfo.history
            .filter(h => h.role === MessageRole.Assistant)
            .pop()
        
        // Only send completion if we haven't already sent this text via progress
        if (!lastAssistantEntry?.content) {
            await bot.api.sendMessage(chatId, 'Task completed successfully.')
        }
        await clearActiveTask(chatId)
    } else if (taskInfo.status === AgentStatus.Error) {
        const errorMsg = error || 'Task failed.'
        await bot.api.sendMessage(chatId, errorMsg)
        await clearActiveTask(chatId)
    }
}

export function getBot(): Bot | null {
    return bot
}

export async function stopTelegramBot(): Promise<void> {
    if (bot) {
        await bot.stop()
        bot = null
        logger.info('TelegramBot', 'Telegram bot stopped')
    }
}

export { 
    createTelegramBot, 
    sendAssistantResponse, 
    sendConfirmationRequest 
}
export * from './types'
export * from './session'
export * from './callbacks'
