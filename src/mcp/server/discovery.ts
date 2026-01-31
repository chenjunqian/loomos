import { McpServerConfig } from '../types'

interface DiscoveryEvents {
    serverFound: (config: McpServerConfig) => void
}

export interface Discovery {
    start: () => Promise<void>
    stop: () => Promise<void>
    on: <E extends keyof DiscoveryEvents>(event: E, handler: DiscoveryEvents[E]) => void
    off: <E extends keyof DiscoveryEvents>(event: E, handler: DiscoveryEvents[E]) => void
}

interface DiscoveryOptions {
    port?: number
}

export function createDiscovery(options: DiscoveryOptions = {}): Discovery {
    const { port = 3000 } = options
    let server: ReturnType<typeof import('http').createServer> | null = null
    const handlers: Map<keyof DiscoveryEvents, Array<(...args: unknown[]) => void>> = new Map([
        ['serverFound', []],
    ])

    const on = <E extends keyof DiscoveryEvents>(event: E, handler: DiscoveryEvents[E]): void => {
        const eventHandlers = handlers.get(event) || []
        eventHandlers.push(handler as (...args: unknown[]) => void)
        handlers.set(event, eventHandlers)
    }

    const off = <E extends keyof DiscoveryEvents>(event: E, handler: DiscoveryEvents[E]): void => {
        const eventHandlers = handlers.get(event) || []
        const idx = eventHandlers.indexOf(handler as (...args: unknown[]) => void)
        if (idx >= 0) eventHandlers.splice(idx, 1)
    }

    const emit = <E extends keyof DiscoveryEvents>(event: E, ...args: Parameters<DiscoveryEvents[E]>): void => {
        const eventHandlers = handlers.get(event) || []
        eventHandlers.forEach((h) => h(...args))
    }

    const start = async (): Promise<void> => {
        const http = await import('http')

        server = http.createServer((req, res) => {
            if (req.method === 'POST' && req.url === '/announce') {
                let body = ''
                req.on('data', (chunk) => (body += chunk))
                req.on('end', () => {
                    try {
                        const config = JSON.parse(body) as McpServerConfig
                        emit('serverFound', config)
                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ status: 'ok' }))
                    } catch {
                        res.writeHead(400, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ error: 'Invalid config' }))
                    }
                })
            } else if (req.method === 'GET' && req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: 'ok' }))
            } else if (req.method === 'GET' && req.url === '/servers') {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ message: 'Server list endpoint - implement if needed' }))
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Not found' }))
            }
        })

        await new Promise<void>((resolve) => server!.listen(port, resolve))
        console.log(`[MCP Discovery] Listening on port ${port}`)
    }

    const stop = async (): Promise<void> => {
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server!.close((err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })
            server = null
        }
    }

    return { start, stop, on, off }
}
