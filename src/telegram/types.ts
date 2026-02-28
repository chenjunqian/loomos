import { AgentStatus, AgentHistoryEntry } from '../agent/types'

export type TelegramChatState = 'idle' | 'processing' | 'awaiting_confirmation'

export interface TelegramSession {
    chatId: number
    userId: string
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

export interface TelegramTaskCallbacks {
    onProgress?: (update: TelegramProgressUpdate) => void
    onTaskComplete?: (taskId: string, userId: string, success: boolean, error?: string) => void
}
