import { TransportConfig, TransportType } from '../types'
import { StdioTransport } from './stdio'
import { HttpSseTransport } from './http'

export interface Transport {
    connect: () => Promise<void>
    send: (message: unknown) => Promise<void>
    close: () => Promise<void>
    readonly connected: boolean
    onMessage: (handler: (message: unknown) => void) => () => void
}

export function createTransport(config: TransportConfig): Transport {
    const transports: Record<TransportType, () => Transport> = {
        stdio: () => StdioTransport(config),
        http: () => HttpSseTransport(config, 'http'),
        sse: () => HttpSseTransport(config, 'sse'),
        websocket: () => HttpSseTransport(config, 'websocket'),
    }

    const createFn = transports[config.type]
    if (!createFn) {
        throw new Error(`Unsupported transport type: ${config.type}`)
    }

    return createFn()
}
