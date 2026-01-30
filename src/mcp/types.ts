export type TransportType = 'stdio' | 'http' | 'sse' | 'websocket'

export interface TransportConfig {
    type: TransportType
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
    timeout?: number
}

export interface McpServerConfig {
    id: string
    name: string
    description?: string
    transport: TransportConfig
    enabled?: boolean
    capabilities?: {
        tools?: boolean
        resources?: boolean
        prompts?: boolean
    }
    filters?: {
        include?: string[]
        exclude?: string[]
    }
}

export interface McpTool {
    name: string
    description: string
    inputSchema: {
        type: 'object'
        properties: Record<string, {
            type: string
            description?: string
            enum?: string[]
            default?: unknown
        }>
        required?: string[]
    }
    outputSchema?: unknown
}

export interface McpToolCallParams {
    name: string
    arguments: Record<string, unknown>
}

export interface McpToolCallResult {
    content: Array<{
        type: 'text' | 'image' | 'resource'
        text?: string
        data?: string
        mimeType?: string
        uri?: string
    }>
    isError?: boolean
}

export interface McpServerCapabilities {
    tools?: {
        listChanged?: boolean
    }
    resources?: {
        listChanged?: boolean
        subscribe?: boolean
    }
    prompts?: {
        listChanged?: boolean
    }
    sampling?: Record<string, unknown>
}

export type McpConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error'

export interface McpServerState {
    id: string
    name: string
    state: McpConnectionState
    capabilities: McpServerCapabilities | null
    toolCount: number
    resourceCount: number
    lastConnectedAt: Date | null
    error?: string
}

export interface McpConfig {
    version: '1.0'
    servers: McpServerConfig[]
    discovery?: {
        enabled: boolean
        port?: number
        multicast?: boolean
        announceInterval?: number
    }
}

export interface JsonRpcMessage {
    jsonrpc: '2.0'
    id?: string | null
    method?: string
    params?: unknown
    result?: unknown
    error?: {
        code: number
        message: string
        data?: unknown
    }
}
