export enum MessageRole {
    System = 'system',
    User = 'user',
    Assistant = 'assistant',
    Tool = 'tool',
}

export interface Message {
    role: MessageRole
    content: string
    name?: string
    tool_calls?: ToolCall[]
    tool_call_id?: string
}

export interface ToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export interface Tool {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: Record<string, ToolParameter>
        required: string[]
    }
}

export interface ToolParameter {
    type: string
    description: string
    enum?: string[]
}

export interface ToolResult {
    success: boolean
    content: string
    error?: string
}

export interface ToolExecution {
    toolName: string
    arguments: Record<string, unknown>
    result: ToolResult
}

export enum AgentStatus {
    Idle = 'idle',
    Thinking = 'thinking',
    AwaitingAction = 'awaiting_action',
    AwaitingConfirmation = 'awaiting_confirmation',
    Executing = 'executing',
    Completed = 'completed',
    Error = 'error',
}

export interface AgentState {
    status: AgentStatus
    messages: Message[]
    history: AgentHistoryEntry[]
    currentIteration: number
    uncertaintyLevel: number
    requiresHumanConfirmation: boolean
    pendingToolCall?: ToolCall
}

export interface AgentHistoryEntry {
    role: 'user' | 'assistant' | 'tool'
    content: string
    iteration?: number
    timestamp: number
}

export type ThinkingMode = 'auto' | 'enabled' | 'disabled'

export interface AgentInput {
    userId?: string
    taskId?: string
    task: string
    approved?: boolean
    alternativeInput?: string
    maxIterations?: number
    thinkingMode?: ThinkingMode
    apiKey?: string
    baseUrl?: string
    model?: string
}

export interface TaskRecord {
    id: string
    userId: string
    task: string
    status: AgentStatus
    response?: string
    history: AgentHistoryEntry[]
    requiresConfirmation: boolean
    createdAt: Date
    updatedAt: Date
}

export interface AgentOutput {
    response: string
    status: AgentStatus
    history: AgentHistoryEntry[]
    requiresConfirmation: boolean
}

export interface LLMResponse {
    content: string
    toolCalls?: ToolCall[]
    finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error'
}
