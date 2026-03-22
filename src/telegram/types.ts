import { AgentStatus, AgentHistoryEntry } from '../agent/types'

export type TelegramChatState = AgentStatus

export interface TelegramSession {
    chatId: number
    userId: string
    accountId?: string
    taskId: string | null
    status: TelegramChatState
    lastMessageId: number | null
    createdAt: Date
    updatedAt: Date
}

export interface TelegramProgressUpdate {
    taskId: string
    userId: string
    entry: AgentHistoryEntry
    status: AgentStatus
}

export interface TelegramBotConfig {
    token: string
    enabled: boolean
}

export interface TelegramConfirmationRequest {
    mode: 'default' | 'ask_user'
    message: string
    options?: string[]
}

export interface TelegramTaskCallbacks {
    onProgress?: (update: TelegramProgressUpdate) => void
    onTaskComplete?: (taskId: string, userId: string, success: boolean, error?: string) => void
}
