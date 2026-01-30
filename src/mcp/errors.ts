export interface McpError extends Error {
    code: number
    data?: unknown
}

export function createMcpError(message: string, code: number, data?: unknown): McpError {
    const error = new Error(message) as McpError
    error.code = code
    error.data = data
    return error
}

export const ErrorCodes = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
    ServerError: -32000,
    ConnectionFailed: -32001,
    Timeout: -32002,
    ToolNotFound: -32003,
    ToolCallFailed: -32004,
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

export function isMcpError(error: unknown): error is McpError {
    return error instanceof Error && 'code' in error
}

export function wrapError(error: unknown, context: string): McpError {
    if (isMcpError(error)) return error
    return createMcpError(
        `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCodes.InternalError,
        error
    )
}
