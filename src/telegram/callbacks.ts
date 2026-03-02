import { Context } from 'grammy'
import { confirmTask, getTask } from '../agent/gateway'
import { getOrCreateSession, clearActiveTask, isAwaitingConfirmation } from './session'
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
        
        const taskInfo = await getTask(taskId, session.userId)
        
        if (!taskInfo) {
            await ctx.editMessageText('Task not found.')
            return
        }

        if (!(await isAwaitingConfirmation(chatId))) {
            await ctx.editMessageText('This confirmation is no longer valid.')
            return
        }

        await ctx.editMessageText('Approved. Processing...')
        
        await confirmTask(session.userId, taskId, true)

        logger.info('TelegramBot', `User ${chatId} approved task ${taskId}`)    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('TelegramBot', `Failed to approve task: ${errorMessage}`)
        await ctx.editMessageText(`Failed to approve: ${errorMessage}`)
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
        
        const taskInfo = await getTask(taskId, session.userId)
        
        if (!taskInfo) {
            await ctx.editMessageText('Task not found.')
            return
        }

        if (!(await isAwaitingConfirmation(chatId))) {
            await ctx.editMessageText('This confirmation is no longer valid.')
            return
        }

        await ctx.editMessageText('Rejected. Task cancelled.')
        
        await confirmTask(session.userId, taskId, false)
        
        await clearActiveTask(chatId)
        
        logger.info('TelegramBot', `User ${chatId} rejected task ${taskId}`)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('TelegramBot', `Failed to reject task: ${errorMessage}`)
        await ctx.editMessageText(`Failed to reject: ${errorMessage}`)
        await clearActiveTask(chatId)
    }
}
