import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
    ListToolsResultSchema,
    CallToolResultSchema,
    Tool as MCPTool,
} from '@modelcontextprotocol/sdk/types.js'
import { MCPServerConfig } from './config.js'

interface ToolListResult {
    tools: MCPTool[]
}

interface ToolCallResult {
    content: Array<{
        type: string
        text?: string
    }>
}

export interface MCPClient {
    connect(): Promise<void>
    listTools(): Promise<ToolListResult>
    callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>
    disconnect(): Promise<void>
    getServerName(): string
}

export function createMCPClient(config: MCPServerConfig): MCPClient {
    let client: Client | null = null
    let transport: Transport | null = null
    const serverName = config.name

    const connect = async (): Promise<void> => {
        if (config.transport === 'stdio' && config.stdio) {
            transport = new StdioClientTransport({
                command: config.stdio.command,
                args: config.stdio.args,
                env: config.stdio.env,
            })
        } else if (config.transport === 'http' && config.http) {
            transport = new SSEClientTransport(new URL(config.http.url))
        } else {
            throw new Error(`Unsupported transport type: ${config.transport}`)
        }

        client = new Client({
            name: 'loomos-agent',
            version: '1.0.0',
        })

        client.onerror = (error: Error) => {
            console.error(`[MCP] Client error for ${serverName}:`, error.message)
        }

        await client.connect(transport)
    }

    const listTools = async (): Promise<ToolListResult> => {
        if (!client) {
            throw new Error(`MCP client not connected for server: ${serverName}`)
        }

        const result = await client.request(
            { method: 'tools/list', params: {} },
            ListToolsResultSchema
        )

        return { tools: result.tools }
    }

    const callTool = async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
        if (!client) {
            throw new Error(`MCP client not connected for server: ${serverName}`)
        }

        const result = await client.request(
            {
                method: 'tools/call',
                params: { name, arguments: args },
            },
            CallToolResultSchema
        )

        return { content: result.content }
    }

    const disconnect = async (): Promise<void> => {
        if (transport) {
            await transport.close()
            transport = null
            client = null
        }
    }

    const getServerName = (): string => {
        return serverName
    }

    return {
        connect,
        listTools,
        callTool,
        disconnect,
        getServerName,
    }
}

const clientCache = new Map<string, MCPClient>()

export async function getMCPClient(config: MCPServerConfig): Promise<MCPClient> {
    const cacheKey = config.name
    let client = clientCache.get(cacheKey)

    if (!client) {
        client = createMCPClient(config)
        await client.connect()
        clientCache.set(cacheKey, client)
    }

    return client
}

export async function disconnectAllMCPClients(): Promise<void> {
    for (const client of clientCache.values()) {
        await client.disconnect()
    }
    clientCache.clear()
}