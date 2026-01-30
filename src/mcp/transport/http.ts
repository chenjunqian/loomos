import { Transport } from './index'
import { TransportConfig } from '../types'

interface HttpConfig {
    url: string
    headers?: Record<string, string>
    timeout?: number
}

type HttpTransportType = 'http' | 'sse' | 'websocket'

export function HttpSseTransport(config: TransportConfig, type: HttpTransportType): Transport {
    const httpConfig = config as HttpConfig
    let abortController: AbortController | null = null
    let eventSource: EventSource | null = null
    let postEndpoint: string | null = null
    let isConnected = false
    const handlers: Array<(message: unknown) => void> = []

    const connect = async (): Promise<void> => {
        const baseUrl = httpConfig.url.replace(/\/$/, '')

        if (type === 'sse') {
            eventSource = new EventSource(`${baseUrl}/sse`)

            eventSource.onopen = () => {
                isConnected = true
            }

            eventSource.onmessage = (event) => {
                try {
                    const data = event.data ? JSON.parse(event.data) : null
                    if (data) {
                        handlers.forEach((h) => h(data))
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            eventSource.onerror = (error) => {
                console.error(`[MCP SSE] connection error:`, error)
                isConnected = false
            }

            postEndpoint = `${baseUrl}/message`
        } else if (type === 'http') {
            postEndpoint = `${baseUrl}/message`
            isConnected = true
        } else if (type === 'websocket') {
            const WebSocket = await import('ws')
            const ws = new WebSocket.default(`${baseUrl.replace('http', 'ws')}/ws`)

            ws.onopen = () => {
                isConnected = true
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data.toString())
                    handlers.forEach((h) => h(data))
                } catch {
                    // Ignore parse errors
                }
            }

            ws.onerror = (error) => {
                console.error(`[MCP WebSocket] error:`, error)
            }

            ws.onclose = () => {
                isConnected = false
            }

            postEndpoint = baseUrl
        }
    }

    const send = async (message: unknown): Promise<void> => {
        if (!postEndpoint) throw new Error('Transport not connected')

        const response = await fetch(postEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...httpConfig.headers,
            },
            body: JSON.stringify(message),
            signal: abortController?.signal,
        })

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`)
        }
    }

    const close = async (): Promise<void> => {
        if (abortController) {
            abortController.abort()
            abortController = null
        }
        if (eventSource) {
            eventSource.close()
            eventSource = null
        }
        isConnected = false
    }

    const onMessage = (handler: (message: unknown) => void): (() => void) => {
        handlers.push(handler)
        return () => {
            const idx = handlers.indexOf(handler)
            if (idx >= 0) handlers.splice(idx, 1)
        }
    }

    return {
        connect,
        send,
        close,
        get connected() { return isConnected },
        onMessage,
    }
}
