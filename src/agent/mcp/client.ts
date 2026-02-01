import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
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

export class MCPClient {
    private client: Client | null = null
    private transport: StdioClientTransport | null = null
    private serverName: string

    constructor(private config: MCPServerConfig) {
        this.serverName = config.name
    }

    async connect(): Promise<void> {
        if (this.config.transport !== 'stdio' || !this.config.stdio) {
            throw new Error(`Unsupported transport type: ${this.config.transport}`)
        }

        this.transport = new StdioClientTransport({
            command: this.config.stdio.command,
            args: this.config.stdio.args,
            env: this.config.stdio.env,
        })

        this.client = new Client({
            name: 'loomos-agent',
            version: '1.0.0',
        })

        this.client.onerror = (error: Error) => {
            console.error(`[MCP] Client error for ${this.serverName}:`, error.message)
        }

        await this.client.connect(this.transport)
    }

    async listTools(): Promise<ToolListResult> {
        if (!this.client) {
            throw new Error(`MCP client not connected for server: ${this.serverName}`)
        }

        const result = await this.client.request(
            { method: 'tools/list', params: {} },
            ListToolsResultSchema
        )

        return { tools: result.tools }
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
        if (!this.client) {
            throw new Error(`MCP client not connected for server: ${this.serverName}`)
        }

        const result = await this.client.request(
            {
                method: 'tools/call',
                params: { name, arguments: args },
            },
            CallToolResultSchema
        )

        return { content: result.content }
    }

    async disconnect(): Promise<void> {
        if (this.transport) {
            await this.transport.close()
            this.transport = null
            this.client = null
        }
    }

    getServerName(): string {
        return this.serverName
    }
}

const clientCache = new Map<string, MCPClient>()

export async function getMCPClient(config: MCPServerConfig): Promise<MCPClient> {
    const cacheKey = config.name
    let client = clientCache.get(cacheKey)

    if (!client) {
        client = new MCPClient(config)
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
