import { Bot } from 'grammy'
import { createTelegramBot, sendAssistantResponse, sendConfirmationRequest } from './bot'
import { TelegramBotConfig } from './types'
import { getTask } from '../agent/gateway'
import { 
    getSession, 
    clearActiveTask,
} from './session'
import { AgentStatus, MessageRole, AgentHistoryEntry } from '../agent/types'
import { TaskQueue } from '@prisma/client'
import { logger } from '../utils/logger'
import { WorkerPool, ProgressCallback } from '../queue/worker-pool'

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
    
    workerPool.registerProgressCallback(handleProgress)
    
    bot.start({
        onStart: () => {
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
    
    const chatId = extractChatIdFromUserId(task.userId)
    if (!chatId) return
    
    const session = getSession(chatId)
    if (!session || session.taskId !== task.taskRecordId) return
    
    if (entry.role === MessageRole.Assistant && entry.content) {
        await sendAssistantResponse(bot, chatId, entry.content, session.lastMessageId || undefined)
    }
    
    // Check if task is completed after this progress update
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
        
        if (lastAssistantEntry?.content) {
            await sendAssistantResponse(bot, chatId, lastAssistantEntry.content)
        } else {
            await bot.api.sendMessage(chatId, 'Task completed successfully.')
        }
        clearActiveTask(chatId)
    } else if (taskInfo.status === AgentStatus.Error) {
        await bot.api.sendMessage(chatId, 'Task failed.')
        clearActiveTask(chatId)
    }
}

function extractChatIdFromUserId(userId: string): number | null {
    const prefix = 'telegram_'
    if (!userId.startsWith(prefix)) {
        return null
    }
    const chatIdStr = userId.slice(prefix.length)
    const chatId = parseInt(chatIdStr, 10)
    if (isNaN(chatId)) {
        return null
    }
    return chatId
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
