import { JsonRpcMessage } from '../types'

export function createId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function createJsonRpcMessage(id: string | null, method: string, params?: unknown): JsonRpcMessage {
    return {
        jsonrpc: '2.0',
        id,
        method,
        params,
    }
}

export function parseJsonRpcResponse(message: unknown): JsonRpcMessage | null {
    if (!message || typeof message !== 'object') return null

    const msg = message as Record<string, unknown>

    if (msg.jsonrpc !== '2.0') return null

    const result: JsonRpcMessage = {
        jsonrpc: '2.0',
        id: msg.id as string | null,
    }

    if ('result' in msg) {
        result.result = msg.result
    } else if ('error' in msg && msg.error) {
        const error = msg.error as Record<string, unknown>
        result.error = {
            code: (error.code as number) || -32000,
            message: (error.message as string) || 'Unknown error',
            data: error.data,
        }
    } else if ('method' in msg) {
        result.method = msg.method as string
        result.params = msg.params
    } else {
        return null
    }

    return result
}

export function isRequest(message: JsonRpcMessage): boolean {
    return message.method !== undefined && message.id !== undefined
}

export function isNotification(message: JsonRpcMessage): boolean {
    return message.method !== undefined && message.id === undefined
}

export function isResponse(message: JsonRpcMessage): boolean {
    return message.id !== undefined && (message.result !== undefined || message.error !== undefined)
}
