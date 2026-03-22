import { AgentStatus } from '../agent/types'
import { TelegramSession } from './types'
import { getOrCreateUserByAccount } from '../database/user'
import { getUserProfile, upsertUserProfile } from '../database/user-profile'
import { getTask, stopTask } from '../agent/gateway'

const PROVIDER = 'telegram'

interface TelegramSessionState {
    activeTaskId: string | null
    lastMessageId: number | null
}

const TELEGRAM_SESSION_PROFILE = 'telegram-session'

function getDefaultSessionState(): TelegramSessionState {
    return {
        activeTaskId: null,
        lastMessageId: null,
    }
}

function parseSessionState(data?: string | null): TelegramSessionState {
    if (!data) {
        return getDefaultSessionState()
    }

    try {
        const parsed = JSON.parse(data)
        return {
            activeTaskId: typeof parsed.activeTaskId === 'string' ? parsed.activeTaskId : null,
            lastMessageId: typeof parsed.lastMessageId === 'number' ? parsed.lastMessageId : null,
        }
    } catch {
        return getDefaultSessionState()
    }
}

async function getSessionState(userId: string): Promise<TelegramSessionState> {
    const profile = await getUserProfile(userId, TELEGRAM_SESSION_PROFILE)
    return parseSessionState(profile?.data)
}

async function saveSessionState(userId: string, state: TelegramSessionState): Promise<void> {
    await upsertUserProfile(userId, TELEGRAM_SESSION_PROFILE, JSON.stringify(state))
}

async function buildSession(chatId: number, username?: string): Promise<TelegramSession> {
    const { user, account } = await getOrCreateUserByAccount(PROVIDER, chatId.toString(), username ? { username } : undefined)
    const sessionState = await getSessionState(user.id)

    if (!sessionState.activeTaskId) {
        return {
            chatId,
            userId: user.id,
            accountId: account.id,
            taskId: null,
            status: AgentStatus.Idle,
            lastMessageId: sessionState.lastMessageId,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
    }

    const task = await getTask(sessionState.activeTaskId, user.id)
    if (!task) {
        await saveSessionState(user.id, {
            activeTaskId: null,
            lastMessageId: sessionState.lastMessageId,
        })

        return {
            chatId,
            userId: user.id,
            accountId: account.id,
            taskId: null,
            status: AgentStatus.Idle,
            lastMessageId: sessionState.lastMessageId,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
    }

    return {
        chatId,
        userId: user.id,
        accountId: account.id,
        taskId: task.taskId,
        status: task.status,
        lastMessageId: sessionState.lastMessageId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
    }
}

function shouldCancelTask(status: AgentStatus): boolean {
    return [
        AgentStatus.Idle,
        AgentStatus.Thinking,
        AgentStatus.AwaitingAction,
        AgentStatus.AwaitingConfirmation,
        AgentStatus.Executing,
    ].includes(status)
}

export async function getSession(chatId: number): Promise<TelegramSession | undefined> {
    try {
        return await buildSession(chatId)
    } catch {
        return undefined
    }
}

export async function getOrCreateSession(chatId: number, username?: string): Promise<TelegramSession> {
    return buildSession(chatId, username)
}

export async function setLastMessageId(chatId: number, messageId: number): Promise<void> {
    const session = await getSession(chatId)
    if (!session) {
        return
    }

    const sessionState = await getSessionState(session.userId)
    await saveSessionState(session.userId, {
        activeTaskId: sessionState.activeTaskId,
        lastMessageId: messageId,
    })
}

export async function clearActiveTask(chatId: number): Promise<void> {
    const session = await getSession(chatId)
    if (!session) {
        return
    }

    if (session.taskId && shouldCancelTask(session.status)) {
        try {
            await stopTask(session.userId, session.taskId)
        } catch {
            // Task might already be stopped or not found.
        }
    }

    await saveSessionState(session.userId, {
        activeTaskId: null,
        lastMessageId: null,
    })
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

export async function setActiveTask(chatId: number, taskId: string, username?: string): Promise<void> {
    const { user } = await getOrCreateUserByAccount(PROVIDER, chatId.toString(), username ? { username } : undefined)
    const sessionState = await getSessionState(user.id)

    await saveSessionState(user.id, {
        activeTaskId: taskId,
        lastMessageId: sessionState.lastMessageId,
    })
}

export async function clearActiveTaskByUser(userId: string, taskId?: string): Promise<void> {
    const sessionState = await getSessionState(userId)

    if (taskId && sessionState.activeTaskId !== taskId) {
        return
    }

    await saveSessionState(userId, {
        activeTaskId: null,
        lastMessageId: sessionState.lastMessageId,
    })
}
