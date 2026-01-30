import { createTransport, Transport } from '../transport'
import { createSession } from '../session'
import { McpServerConfig, McpTool, McpToolCallResult, McpConnectionState, McpServerCapabilities, McpServerState } from '../types'

export interface McpClient {
    connect: () => Promise<void>
    disconnect: () => Promise<void>
    callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>
    getTools: () => McpTool[]
    getState: () => McpServerState
}

export function createMcpClient(config: McpServerConfig): McpClient {
    let transport: Transport | null = null
    let session: ReturnType<typeof createSession> | null = null
    let tools: Map<string, McpTool> = new Map()
    let capabilities: McpServerCapabilities | null = null
    let state: McpConnectionState = 'disconnected'

    const getState = (): McpServerState => ({
        id: config.id,
        name: config.name,
        state,
        capabilities,
        toolCount: tools.size,
        resourceCount: 0,
        lastConnectedAt: state === 'connected' ? new Date() : null,
    })

    const connect = async (): Promise<void> => {
        state = 'connecting'

        try {
            transport = createTransport(config.transport)
            await transport.connect()

            session = createSession(transport)
            session.registerHandler()

            const initResponse = await session.request<{
                capabilities: McpServerCapabilities
                serverInfo: { name: string; version: string }
            }>('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {}, resources: {}, prompts: {} },
                clientInfo: { name: 'loomos', version: '1.0.0' },
            })

            capabilities = initResponse.capabilities

            await listTools()

            state = 'connected'
        } catch (error) {
            state = 'error'
            throw error
        }
    }

    const disconnect = async (): Promise<void> => {
        if (session) {
            await session.close()
            session = null
        }
        if (transport) {
            await transport.close()
            transport = null
        }
        state = 'disconnected'
    }

    const callTool = async (name: string, args: Record<string, unknown>): Promise<McpToolCallResult> => {
        if (!session) throw new Error('Client not connected')
        return session.request('tools/call', { name, arguments: args })
    }

    const listTools = async (): Promise<McpTool[]> => {
        if (!session) throw new Error('Client not connected')

        const response = await session.request<{ tools: McpTool[] }>('tools/list')
        tools = new Map(response.tools.map((t) => [t.name, t]))
        return response.tools
    }

    return {
        connect,
        disconnect,
        callTool,
        getTools: () => Array.from(tools.values()),
        getState,
    }
}
