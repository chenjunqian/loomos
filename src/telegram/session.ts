import { AgentStatus } from '../agent/types'
import { TelegramSession, TelegramChatState } from './types'

const sessions = new Map<number, TelegramSession>()

function generateUserId(chatId: number): string {
    return `telegram_${chatId}`
}

export function createSession(chatId: number): TelegramSession {
    const now = new Date()
    const session: TelegramSession = {
        chatId,
        userId: generateUserId(chatId),
        taskId: null,
        status: 'idle',
        lastMessageId: null,
        createdAt: now,
        updatedAt: now,
    }
    sessions.set(chatId, session)
    return session
}

export function getSession(chatId: number): TelegramSession | undefined {
    return sessions.get(chatId)
}

export function getOrCreateSession(chatId: number): TelegramSession {
    const existing = getSession(chatId)
    if (existing) {
        return existing
    }
    return createSession(chatId)
}

export function updateSession(
    chatId: number,
    updates: Partial<Omit<TelegramSession, 'chatId' | 'userId' | 'createdAt'>>
): TelegramSession | undefined {
    const session = sessions.get(chatId)
    if (!session) {
        return undefined
    }
    Object.assign(session, updates, { updatedAt: new Date() })
    return session
}

export function setActiveTask(chatId: number, taskId: string): void {
    updateSession(chatId, {
        taskId,
        status: 'processing',
    })
}

export function setSessionStatus(chatId: number, status: TelegramChatState): void {
    updateSession(chatId, { status })
}

export function setLastMessageId(chatId: number, messageId: number): void {
    updateSession(chatId, { lastMessageId: messageId })
}

export function clearActiveTask(chatId: number): void {
    updateSession(chatId, {
        taskId: null,
        status: 'idle',
        lastMessageId: null,
    })
}

export function getUserId(chatId: number): string {
    return generateUserId(chatId)
}

export function hasActiveTask(chatId: number): boolean {
    const session = getSession(chatId)
    return session?.taskId !== null && session?.status === 'processing'
}

export function isAwaitingConfirmation(chatId: number): boolean {
    const session = getSession(chatId)
    return session?.status === AgentStatus.AwaitingConfirmation
}

export function deleteSession(chatId: number): boolean {
    return sessions.delete(chatId)
}

export function getAllSessions(): TelegramSession[] {
    return Array.from(sessions.values())
}
