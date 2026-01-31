import { createMcpClient, McpClient } from './client'
import { loadMcpConfig } from './config/loader'
import { createServerRegistry, ServerRegistry } from './server/registry'
import { createDiscovery, Discovery } from './server/discovery'
import { createToolRegistry, McpToolRegistry } from './tools'
import { Tool } from '../agent/types'
import { McpServerConfig, McpServerState, McpToolCallResult } from './types'

export interface McpManager {
    getTools: () => Promise<Tool[]>
    getTool: (name: string) => Promise<Tool | undefined>
    callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>
    getServerStates: () => Promise<McpServerState[]>
    addServer: (config: McpServerConfig) => Promise<void>
    removeServer: (id: string) => Promise<void>
    shutdown: () => Promise<void>
}

interface McpManagerOptions {
    configPath?: string
    enableDiscovery?: boolean
}

export function createMcpManager(options: McpManagerOptions = {}): McpManager {
    let clients: Map<string, McpClient> = new Map()
    let toolRegistry: McpToolRegistry | null = null
    let registry: ServerRegistry | null = null
    let discovery: Discovery | null = null
    let initialized = false

    const ensureInitialized = async (): Promise<void> => {
        if (initialized) return

        const config = await loadMcpConfig(options.configPath)

        registry = createServerRegistry()
        toolRegistry = createToolRegistry()

        for (const serverConfig of config.servers) {
            if (serverConfig.enabled !== false) {
                await addServer(serverConfig)
            }
        }

        if (options.enableDiscovery !== false && config.discovery?.enabled) {
            discovery = createDiscovery({
                port: config.discovery.port,
            })

            discovery.on('serverFound', async (newConfig) => {
                await addServer(newConfig)
            })

            await discovery.start()
        }

        initialized = true
    }

    const addServer = async (config: McpServerConfig): Promise<void> => {
        const client = createMcpClient(config)

        client.connect().then(() => {
            registry?.register(client)

            const state = client.getState()
            const tools = client.getTools()

            toolRegistry?.addTools(tools, state.id)

            console.log(`[MCP] Connected to server: ${state.name} (${state.toolCount} tools)`)
        }).catch((error) => {
            console.error(`[MCP] Failed to connect to ${config.name}:`, error)
        })

        clients.set(config.id, client)
    }

    const getTools = async (): Promise<Tool[]> => {
        await ensureInitialized()
        return toolRegistry?.getAllTools() || []
    }

    const getTool = async (name: string): Promise<Tool | undefined> => {
        await ensureInitialized()
        return toolRegistry?.getTool(name)
    }

    const callTool = async (name: string, args: Record<string, unknown>): Promise<McpToolCallResult> => {
        await ensureInitialized()

        const parts = name.split('_')
        const serverId = parts[0]
        if (!serverId) {
            throw new Error(`Invalid tool name: ${name}`)
        }

        const client = clients.get(serverId)

        if (!client) {
            throw new Error(`MCP server not found: ${serverId}`)
        }

        return client.callTool(name, args)
    }

    const getServerStates = async (): Promise<McpServerState[]> => {
        await ensureInitialized()
        return registry?.getStates() || []
    }

    const removeServer = async (id: string): Promise<void> => {
        const client = clients.get(id)
        if (client) {
            await client.disconnect()
            clients.delete(id)
        }
    }

    const shutdown = async (): Promise<void> => {
        if (discovery) await discovery.stop()
        for (const client of Array.from(clients.values())) {
            await client.disconnect()
        }
        clients.clear()
        initialized = false
    }

    return {
        getTools,
        getTool,
        callTool,
        getServerStates,
        addServer,
        removeServer,
        shutdown,
    }
}

let managerInstance: McpManager | null = null

export async function getMcpManager(options?: McpManagerOptions): Promise<McpManager> {
    if (!managerInstance) {
        managerInstance = createMcpManager(options)
    }
    return managerInstance
}
