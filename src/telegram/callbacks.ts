import { Context } from 'grammy'
import { confirmTask, getTask } from '../agent/gateway'
import { getOrCreateSession, clearActiveTask, isAwaitingConfirmation, setActiveTask, setLastMessageId } from './session'
import { logger } from '../utils/logger'

export const CALLBACK_APPROVE = 'approve'
export const CALLBACK_REJECT = 'reject'

export function parseCallbackData(data: string): { action: string; taskId: string } | null {
    const parts = data.split(':')
    if (parts.length !== 2) {
        return null
    }
    return {
        action: parts[0]!,
        taskId: parts[1]!,
    }
}

export function createCallbackData(action: string, taskId: string): string {
    return `${action}:${taskId}`
}

export async function handleApproveCallback(ctx: Context, taskId: string): Promise<void> {
    const chatId = ctx.chat?.id
    if (!chatId) {
        return
    }

    const session = await getOrCreateSession(chatId, ctx.from?.username)
    
    try {
        await ctx.answerCallbackQuery()
        
        const originalText = ctx.callbackQuery?.message?.text
        const formatMessage = (status: string) => 
            originalText ? `${originalText.slice(0, 4000)}\n\n${status}` : status

        const taskInfo = await getTask(taskId, session.userId)
        
        if (!taskInfo) {
            await ctx.editMessageText(formatMessage('⚠️ Task not found.'))
            return
        }

        if (!(await isAwaitingConfirmation(chatId))) {
            await ctx.editMessageText(formatMessage('⚠️ This confirmation is no longer valid.'))
            return
        }

        await ctx.editMessageText(formatMessage('✅ Approved. Processing...'))
        
        await confirmTask(session.userId, taskId, true)
        await setActiveTask(chatId, taskId, ctx.from?.username)
        
        const newMessage = await ctx.api.sendMessage(chatId, 'Processing...')
        await setLastMessageId(chatId, newMessage.message_id)

        logger.info('TelegramBot', `User ${chatId} approved task ${taskId}`)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const originalText = ctx.callbackQuery?.message?.text
        logger.error('TelegramBot', `Failed to approve task: ${errorMessage}`)
        await ctx.editMessageText(originalText ? `${originalText.slice(0, 4000)}\n\n❌ Failed to approve: ${errorMessage}` : `Failed to approve: ${errorMessage}`)
        await clearActiveTask(chatId)
    }
}

export async function handleRejectCallback(ctx: Context, taskId: string): Promise<void> {
    const chatId = ctx.chat?.id
    if (!chatId) {
        return
    }

    const session = await getOrCreateSession(chatId, ctx.from?.username)
    
    try {
        await ctx.answerCallbackQuery()
        
        const originalText = ctx.callbackQuery?.message?.text
        const formatMessage = (status: string) => 
            originalText ? `${originalText.slice(0, 4000)}\n\n${status}` : status

        const taskInfo = await getTask(taskId, session.userId)
        
        if (!taskInfo) {
            await ctx.editMessageText(formatMessage('⚠️ Task not found.'))
            return
        }

        if (!(await isAwaitingConfirmation(chatId))) {
            await ctx.editMessageText(formatMessage('⚠️ This confirmation is no longer valid.'))
            return
        }

        await ctx.editMessageText(formatMessage('❌ Rejected. Task cancelled.'))
        
        await confirmTask(session.userId, taskId, false)
        
        logger.info('TelegramBot', `User ${chatId} rejected task ${taskId}`)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const originalText = ctx.callbackQuery?.message?.text
        logger.error('TelegramBot', `Failed to reject task: ${errorMessage}`)
        await ctx.editMessageText(originalText ? `${originalText.slice(0, 4000)}\n\n❌ Failed to reject: ${errorMessage}` : `Failed to reject: ${errorMessage}`)
        await clearActiveTask(chatId)
    }
}
