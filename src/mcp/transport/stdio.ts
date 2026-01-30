import { Transport } from './index'
import { TransportConfig } from '../types'

interface StdioConfig {
    command: string
    args?: string[]
    env?: Record<string, string>
}

export function StdioTransport(config: TransportConfig): Transport {
    let proc: ReturnType<typeof import('node:child_process').spawn> | null = null
    let isConnected = false
    const handlers: Array<(message: unknown) => void> = []

    const connect = async (): Promise<void> => {
        const stdioConfig = config as StdioConfig

        const isBun = typeof process.versions.bun !== 'undefined'

        let spawn: typeof import('node:child_process').spawn
        if (isBun) {
            const childProcess = await import('bun:child_process')
            spawn = childProcess.spawn
        } else {
            const cp = await import('node:child_process')
            spawn = cp.spawn
        }

        proc = spawn(stdioConfig.command, stdioConfig.args || [], {
            env: { ...process.env, ...stdioConfig.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        const decoder = new TextDecoder()

        proc.stdout?.on?.('data', (data: Uint8Array) => {
            const lines = decoder.decode(data).split('\n')
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line)
                        handlers.forEach((h) => h(message))
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        })

        proc.stderr?.on?.('data', (data: Uint8Array) => {
            console.error(`[MCP STDIO] stderr: ${decoder.decode(data)}`)
        })

        proc.on?.('error', (error: Error) => {
            console.error(`[MCP STDIO] process error: ${error}`)
        })

        proc.on?.('close', (code: number | null) => {
            if (code !== 0) {
                console.error(`[MCP STDIO] process exited with code ${code}`)
            }
            isConnected = false
        })

        isConnected = true
    }

    const send = async (message: unknown): Promise<void> => {
        if (!proc?.stdin) throw new Error('Transport not connected')
        proc.stdin.write(JSON.stringify(message) + '\n')
    }

    const close = async (): Promise<void> => {
        if (proc) {
            proc.stdin?.end()
            proc.kill()
            proc = null
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