import { Transport } from '../transport'
import { JsonRpcMessage } from '../types'
import { createId, createJsonRpcMessage, parseJsonRpcResponse } from './utils'

export interface Session {
    request: <T>(method: string, params?: unknown) => Promise<T>
    notify: (method: string, params?: unknown) => Promise<void>
    close: () => Promise<void>
    registerHandler: () => void
}

interface SessionOptions {
    timeout?: number
}

export function createSession(transport: Transport, options: SessionOptions = {}): Session {
    const { timeout = 30000 } = options
    const pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map()

    const handleMessage = (message: unknown): void => {
        const parsed = parseJsonRpcResponse(message as JsonRpcMessage)
        if (!parsed) return

        const request = pendingRequests.get(parsed.id as string)
        if (request) {
            if (parsed.error) {
                request.reject(new Error(parsed.error.message))
            } else {
                request.resolve(parsed.result)
            }
            pendingRequests.delete(parsed.id as string)
        }
    }

    let handlerRegistered = false
    let removeHandler: (() => void) | null = null

    const registerHandler = (): void => {
        if (handlerRegistered || !transport.onMessage) return
        removeHandler = transport.onMessage(handleMessage)
        handlerRegistered = true
    }

    const unregisterHandler = (): void => {
        if (!handlerRegistered || !removeHandler) return
        removeHandler()
        removeHandler = null
        handlerRegistered = false
    }

    const request = async <T>(method: string, params?: unknown): Promise<T> => {
        const id = createId()
        const message = createJsonRpcMessage(id, method, params)

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                pendingRequests.delete(id)
                reject(new Error(`Request timeout: ${method}`))
            }, timeout)

            pendingRequests.set(id, {
                resolve: (result) => {
                    clearTimeout(timeoutId)
                    resolve(result as T)
                },
                reject,
            })

            transport.send(message)
        })
    }

    const notify = async (method: string, params?: unknown): Promise<void> => {
        const message = createJsonRpcMessage(null, method, params)
        await transport.send(message)
    }

    const close = async (): Promise<void> => {
        unregisterHandler()
        await transport.close()
    }

    return {
        request,
        notify,
        close,
        registerHandler,
    }
}
