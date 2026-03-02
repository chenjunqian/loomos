import { AgentStatus } from '../agent/types'
import { TelegramSession, TelegramChatState } from './types'
import { getOrCreateUserByAccount } from '../database/user'
import { getTaskRecord, updateTaskRecord } from '../database/task-record'
import { prisma } from '../database/task-queue'
import { stopTask } from '../agent/gateway'

const PROVIDER = 'telegram'

export async function getSession(chatId: number): Promise<TelegramSession | undefined> {
    try {
        const { user, account } = await getOrCreateUserByAccount(PROVIDER, chatId.toString())
        
        // Find the latest incomplete task for this user
        const activeTask = await prisma.taskRecord.findFirst({
            where: {
                userId: user.id,
                status: {
                    notIn: [AgentStatus.Completed, AgentStatus.Error]
                }
            },
            orderBy: { createdAt: 'desc' }
        })

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
            taskId: activeTask?.id || null,
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
    
    const activeTask = await prisma.taskRecord.findFirst({
        where: {
            userId: user.id,
            status: {
                notIn: [AgentStatus.Completed, AgentStatus.Error]
            }
        },
        orderBy: { createdAt: 'desc' }
    })

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
        taskId: activeTask?.id || null,
        status: (activeTask?.status as TelegramChatState) || 'idle',
        lastMessageId,
        createdAt: activeTask?.createdAt || new Date(),
        updatedAt: activeTask?.updatedAt || new Date(),
    }
}

export async function setLastMessageId(chatId: number, messageId: number): Promise<void> {
    const session = await getSession(chatId)
    if (!session || !session.taskId) return

    const task = await getTaskRecord(session.userId, session.taskId)
    if (!task) return

    let metadata: Record<string, any> = {}
    if (task.metadata) {
        try {
            metadata = JSON.parse(task.metadata)
        } catch (e) {}
    }

    metadata.telegramLastMessageId = messageId

    await updateTaskRecord(session.taskId, {
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
