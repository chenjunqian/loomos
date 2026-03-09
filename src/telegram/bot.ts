import { Bot, Context, InlineKeyboard, InputFile } from 'grammy'
import { existsSync, createReadStream } from 'fs'
import { createTask, getTask } from '../agent/gateway'
import {
    getOrCreateSession,
    setLastMessageId,
    clearActiveTask,
    hasActiveTask,
} from './session'
import {
    parseCallbackData,
    handleApproveCallback,
    handleRejectCallback,
    CALLBACK_APPROVE,
    CALLBACK_REJECT,
    createCallbackData,
} from './callbacks'
import { TelegramBotConfig, TelegramSession } from './types'
import { logger } from '../utils/logger'

const MAX_MESSAGE_LENGTH = 4096

function truncateMessage(text: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
    if (text.length <= maxLength) {
        return text
    }
    return text.slice(0, maxLength - 3) + '...'
}

export function createTelegramBot(config: TelegramBotConfig): Bot {
    const bot = new Bot(config.token)

    bot.command('start', async (ctx: Context) => {
        const chatId = ctx.chat?.id
        if (!chatId) return

        await getOrCreateSession(chatId, ctx.from?.username)
        await ctx.reply(
            'Welcome to Loomos AI Agent!\n\n' +
            'Send me any message and I will help you complete your task.\n\n' +
            'Commands:\n' +
            '/start - Show this message\n' +
            '/status - Check current task status\n' +
            '/cancel - Cancel current task\n' +
            '/new - Start a new conversation'
        )
    })

    bot.command('status', async (ctx: Context) => {
        const chatId = ctx.chat?.id
        if (!chatId) return

        const session = await getOrCreateSession(chatId, ctx.from?.username)

        if (!session.taskId) {
            await ctx.reply('No active task. Send me a message to start a new task.')
            return
        }

        const taskInfo = await getTask(session.taskId, session.userId)
        if (!taskInfo) {
            await ctx.reply('Task not found. It may have been deleted.')
            await clearActiveTask(chatId)
            return
        }

        const statusEmoji: Record<string, string> = {
            idle: '⚪️',
            thinking: '🤔',
            executing: '⚡',
            awaiting_confirmation: '⏳',
            completed: '✅',
            error: '❌',
        }

        const emoji = statusEmoji[taskInfo.status] || '❓'
        await ctx.reply(
            `*Current Task*\n` +
            `Status: ${emoji} ${taskInfo.status}\n` +
            `Task ID: \`${session.taskId}\`\n` +
            `Requires Confirmation: ${taskInfo.requiresConfirmation ? 'Yes' : 'No'}`,
            { parse_mode: 'Markdown' }
        )
    })

    bot.command('cancel', async (ctx: Context) => {
        const chatId = ctx.chat?.id
        if (!chatId) return

        const session = await getOrCreateSession(chatId, ctx.from?.username)

        if (!session.taskId) {
            await ctx.reply('No active task to cancel.')
            return
        }

        await clearActiveTask(chatId)
        await ctx.reply('Current task has been cancelled. Send me a new message to start fresh.')
    })

    bot.command('new', async (ctx: Context) => {
        const chatId = ctx.chat?.id
        if (!chatId) return

        await clearActiveTask(chatId)
        await ctx.reply('Started a new conversation. Send me a message to begin.')
    })

    bot.on(['message:text', 'message:photo'], async (ctx: Context) => {
        const chatId = ctx.chat?.id
        let text = ctx.message?.text || ctx.message?.caption || ''
        if (!chatId) return

        if (ctx.message?.photo && ctx.message.photo.length > 0) {
            try {
                // Get the highest resolution photo
                const photo = ctx.message.photo[ctx.message.photo.length - 1]
                if (!photo) return
                const file = await ctx.api.getFile(photo.file_id)
                if (file.file_path) {
                    const fileUrl = `https://api.telegram.org/file/bot${config.token}/${file.file_path}`
                    const response = await fetch(fileUrl)
                    const arrayBuffer = await response.arrayBuffer()
                    const base64Image = Buffer.from(arrayBuffer).toString('base64')
                    
                    // Create JSON array for agent
                    const contentArray = []
                    if (text) {
                        contentArray.push({ type: 'text', text })
                    }
                    contentArray.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: base64Image
                        }
                    })
                    text = JSON.stringify(contentArray)
                }
            } catch (err) {
                logger.error('TelegramBot', `Failed to process photo: ${err}`)
                await ctx.reply('Failed to process the uploaded image.')
                return
            }
        }

        if (!text && (!ctx.message?.photo || ctx.message.photo.length === 0)) return

        const session = await getOrCreateSession(chatId, ctx.from?.username)

        if (await hasActiveTask(chatId)) {
            await handleContinueConversation(ctx, chatId, text, session)
            return
        }

        await handleNewTask(ctx, chatId, text, session)
    })

    bot.on('callback_query:data', async (ctx: Context) => {
        const data = ctx.callbackQuery?.data
        if (!data) return

        const parsed = parseCallbackData(data)
        if (!parsed) {
            await ctx.answerCallbackQuery('Invalid callback data')
            return
        }

        if (parsed.action === CALLBACK_APPROVE) {
            await handleApproveCallback(ctx, parsed.taskId)
        } else if (parsed.action === CALLBACK_REJECT) {
            await handleRejectCallback(ctx, parsed.taskId)
        } else {
            await ctx.answerCallbackQuery('Unknown action')
        }
    })

    bot.catch((error) => {
        logger.error('TelegramBot', `Bot error: ${error.message}`)
    })

    return bot
}

async function handleNewTask(
    ctx: Context,
    chatId: number,
    text: string,
    session: TelegramSession
): Promise<void> {
    try {
        await ctx.replyWithChatAction('typing')

        const result = await createTask(session.userId, text)

        const message = await ctx.reply('Processing your request...')
        await setLastMessageId(chatId, message.message_id)

        logger.info('TelegramBot', `Created task ${result.taskId} for user ${chatId}`)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('TelegramBot', `Failed to create task: ${errorMessage}`)
        await ctx.reply(`Failed to create task: ${errorMessage}`)
    }
}

async function handleContinueConversation(
    ctx: Context,
    chatId: number,
    text: string,
    session: TelegramSession
): Promise<void> {
    if (!session.taskId) {
        await handleNewTask(ctx, chatId, text, session)
        return
    }

    try {
        await ctx.replyWithChatAction('typing')

        const taskInfo = await getTask(session.taskId, session.userId)
        if (!taskInfo) {
            await clearActiveTask(chatId)
            await handleNewTask(ctx, chatId, text, session)
            return
        }

        await createTask(session.userId, text, {
            taskId: session.taskId,
            priority: 1,
        })

        const message = await ctx.reply('Processing your response...')
        await setLastMessageId(chatId, message.message_id)

        logger.info('TelegramBot', `Continued task ${session.taskId} for user ${chatId}`)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('TelegramBot', `Failed to continue task: ${errorMessage}`)
        await ctx.reply(`Failed to continue task: ${errorMessage}`)
    }
}

export async function sendAssistantResponse(
    bot: Bot,
    chatId: number,
    content: string,
    lastMessageId?: number
): Promise<void> {
    let finalContent = content;
    const imageMatch = finalContent.match(/!\[.*?\]\((.*?)\)/);

    if (imageMatch && imageMatch[1]) {
        const imagePath = imageMatch[1];
        if (existsSync(imagePath)) {
            try {
                // Send the image directly
                await bot.api.sendPhoto(chatId, new InputFile(createReadStream(imagePath)));
                // Remove the markdown image from the text to avoid duplicate/broken links in chat
                finalContent = finalContent.replace(imageMatch[0], '').trim();
                
                // If there's no text left, let's just put a placeholder so we can still edit the "Processing..." message
                if (!finalContent) {
                    finalContent = "Image sent successfully.";
                }
            } catch (err) {
                logger.error('TelegramBot', `Failed to send photo from ${imagePath}: ${err}`)
            }
        }
    }

    const truncatedContent = truncateMessage(finalContent)

    try {
        if (lastMessageId) {
            await bot.api.editMessageText(chatId, lastMessageId, truncatedContent)
        } else {
            await bot.api.sendMessage(chatId, truncatedContent)
        }
    } catch (error) {
        logger.error('TelegramBot', `Failed to send message: ${error}`)
        await bot.api.sendMessage(chatId, truncatedContent)
    }
}

export async function sendConfirmationRequest(
    bot: Bot,
    chatId: number,
    taskId: string,
    confirmationMessage: string
): Promise<void> {
    const keyboard = new InlineKeyboard()
        .text('Approve', createCallbackData(CALLBACK_APPROVE, taskId))
        .text('Reject', createCallbackData(CALLBACK_REJECT, taskId))

    const truncatedMessage = truncateMessage(confirmationMessage)

    await bot.api.sendMessage(chatId, truncatedMessage, {
        reply_markup: keyboard,
    })

    logger.info('TelegramBot', `Sent confirmation request for task ${taskId} to chat ${chatId}`)
}
