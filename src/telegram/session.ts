import { AgentStatus } from '../agent/types'
import { TelegramSession, TelegramChatState } from './types'
import { getOrCreateUserByAccount } from '../database/user'
import { stopTask, getTask, getTasksByUser, updateTask } from '../agent/gateway'

const PROVIDER = 'telegram'

export async function getSession(chatId: number): Promise<TelegramSession | undefined> {
    try {
        const { user, account } = await getOrCreateUserByAccount(PROVIDER, chatId.toString())
        
        // Find the latest task for this user
        // We include Completed tasks to preserve history for context
        // Only exclude Error tasks which are usually aborted or explicitly cleared
        const tasks = await getTasksByUser(user.id, { limit: 1 })
        const activeTask = tasks.length > 0 && tasks[0] && tasks[0].status !== AgentStatus.Error ? tasks[0] : null

        let lastMessageId: number | null = null
        if (activeTask?.metadata) {
            try {
                const metadata = JSON.parse(activeTask.metadata)
                if (metadata.telegramLastMessageId) {
                    lastMessageId = parseInt(metadata.telegramLastMessageId)
                }
            } catch (e) {
                // ignore parsing error
            }
        }

        return {
            chatId,
            userId: user.id,
            accountId: account.id,
            taskId: activeTask?.taskId || null,
            status: (activeTask?.status as TelegramChatState) || 'idle',
            lastMessageId,
            createdAt: activeTask?.createdAt || new Date(),
            updatedAt: activeTask?.updatedAt || new Date(),
        }
    } catch (error) {
        return undefined
    }
}

export async function getOrCreateSession(chatId: number, username?: string): Promise<TelegramSession> {
    const { user, account } = await getOrCreateUserByAccount(PROVIDER, chatId.toString(), { username })
    
    // Find the latest task for this user
    // We include Completed tasks to preserve history for context
    const tasks = await getTasksByUser(user.id, { limit: 1 })
    const activeTask = tasks.length > 0 && tasks[0] && tasks[0].status !== AgentStatus.Error ? tasks[0] : null

    let lastMessageId: number | null = null
    if (activeTask?.metadata) {
        try {
            const metadata = JSON.parse(activeTask.metadata)
            if (metadata.telegramLastMessageId) {
                lastMessageId = parseInt(metadata.telegramLastMessageId)
            }
        } catch (e) {
            // ignore parsing error
        }
    }

    return {
        chatId,
        userId: user.id,
        accountId: account.id,
        taskId: activeTask?.taskId || null,
        status: (activeTask?.status as TelegramChatState) || 'idle',
        lastMessageId,
        createdAt: activeTask?.createdAt || new Date(),
        updatedAt: activeTask?.updatedAt || new Date(),
    }
}

export async function setLastMessageId(chatId: number, messageId: number): Promise<void> {
    const session = await getSession(chatId)
    if (!session || !session.taskId) return

    const task = await getTask(session.taskId, session.userId)
    if (!task) return

    let metadata: Record<string, any> = {}
    if (task.metadata) {
        try {
            metadata = JSON.parse(task.metadata)
        } catch (e) {}
    }

    metadata.telegramLastMessageId = messageId

    await updateTask(session.taskId, {
        metadata: JSON.stringify(metadata)
    })
}

export async function clearActiveTask(chatId: number): Promise<void> {
    const session = await getSession(chatId)
    if (!session || !session.taskId) return

    try {
        await stopTask(session.userId, session.taskId)
    } catch (error) {
        // Task might already be stopped or not found
    }
}

export async function getUserId(chatId: number): Promise<string> {
    const { user } = await getOrCreateUserByAccount(PROVIDER, chatId.toString())
    return user.id
}

export async function hasActiveTask(chatId: number): Promise<boolean> {
    const session = await getSession(chatId)
    return session?.taskId !== null
}

export async function isAwaitingConfirmation(chatId: number): Promise<boolean> {
    const session = await getSession(chatId)
    return session?.status === AgentStatus.AwaitingConfirmation
}
