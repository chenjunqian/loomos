import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
    ListToolsResultSchema,
    CallToolResultSchema,
    Tool as MCPTool,
} from '@modelcontextprotocol/sdk/types.js'
import {
    MCPServerConfig,
    getIsolatedServerConfig,
    getUserStorageStatePath,
    getSessionSyncConfig,
    ensureUserStorageDir,
} from './config.js'
import {
    saveUserSession,
    getUserSession,
    type StorageState,
} from '../../database/mcp-session.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'

const PlaywrightBrowserLockFile = `${homedir()}/.loomos/.playwright-install-lock`

async function ensurePlaywrightBrowsersInstalled(): Promise<void> {
    const browserCacheDir = `${homedir()}/.cache/ms-playwright`
    const chromiumBrowserPath = `${browserCacheDir}/chromium-`

    if (existsSync(chromiumBrowserPath)) {
        return
    }

    const { writeFileSync, unlinkSync } = await import('node:fs')

    const lockFileExists = existsSync(PlaywrightBrowserLockFile)
    if (lockFileExists) {
        console.log('[MCP] Playwright browser installation in progress by another process, waiting...')
        let retries = 0
        const maxRetries = 30
        while (existsSync(PlaywrightBrowserLockFile) && retries < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            retries++
        }
        if (existsSync(chromiumBrowserPath)) {
            return
        }
        console.warn('[MCP] Browser installation may have failed, will attempt to install anyway')
    }

    console.log('[MCP] Installing Playwright Chromium browser...')
    try {
        writeFileSync(PlaywrightBrowserLockFile, '')
        execSync('npx -y playwright install chromium', {
            stdio: 'inherit',
            env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
        })
        console.log('[MCP] Playwright Chromium installed successfully')
    } catch (error) {
        console.error('[MCP] Failed to install Playwright Chromium:', error)
        throw new Error('Failed to install Playwright browser. Please run "npx playwright install chromium" manually.')
    } finally {
        try {
            if (existsSync(PlaywrightBrowserLockFile)) {
                unlinkSync(PlaywrightBrowserLockFile)
            }
        } catch {
            // Ignore cleanup errors
        }
    }
}

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

export interface IsolatedMCPClient extends MCPClient {
    getUserId(): string
    getUserDataDir(): string
    syncToDatabase(): Promise<void>
    restoreFromDatabase(): Promise<void>
    startPeriodicSync(): void
    stopPeriodicSync(): void
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

const sharedClientCache = new Map<string, MCPClient>()
const isolatedClientCache = new Map<string, IsolatedMCPClient>()
const syncIntervals = new Map<string, ReturnType<typeof setInterval>>()

export async function getMCPClient(config: MCPServerConfig): Promise<MCPClient> {
    const cacheKey = config.name
    let client = sharedClientCache.get(cacheKey)

    if (!client) {
        if (config.name === 'playwright') {
            await ensurePlaywrightBrowsersInstalled()
        }
        client = createMCPClient(config)
        await client.connect()
        sharedClientCache.set(cacheKey, client)
    }

    return client
}

export async function getIsolatedMCPClient(config: MCPServerConfig, userId: string): Promise<IsolatedMCPClient> {
    let client = isolatedClientCache.get(userId)

    if (!client) {
        if (config.name === 'playwright') {
            await ensurePlaywrightBrowsersInstalled()
        }
        const isolatedConfig = getIsolatedServerConfig(config, userId)
        client = createIsolatedMCPClient(isolatedConfig, userId)
        await client.connect()
        isolatedClientCache.set(userId, client)
    }

    return client
}

function createIsolatedMCPClient(config: MCPServerConfig, userId: string): IsolatedMCPClient {
    let client: Client | null = null
    let transport: Transport | null = null
    const serverName = config.name
    const userDataDir = config.stdio?.env?.PLAYWRIGHT_MCP_USER_DATA_DIR || ''
    const storageStatePath = getUserStorageStatePath(userId)

    const connect = async (): Promise<void> => {
        await ensureUserStorageDir(userId)
        await restoreFromDatabase()

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
            console.error(`[MCP] Isolated client error for ${serverName} (user ${userId}):`, error.message)
        }

        await client.connect(transport)
    }

    const listTools = async (): Promise<ToolListResult> => {
        if (!client) {
            throw new Error(`Isolated MCP client not connected for server: ${serverName}`)
        }

        const result = await client.request(
            { method: 'tools/list', params: {} },
            ListToolsResultSchema
        )

        return { tools: result.tools }
    }

    const callTool = async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
        if (!client) {
            throw new Error(`Isolated MCP client not connected for server: ${serverName}`)
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

    const getUserId = (): string => {
        return userId
    }

    const getUserDataDir = (): string => {
        return userDataDir
    }

    const syncToDatabase = async (): Promise<void> => {
        try {
            const storageState: StorageState = {
                cookies: [],
                origins: [],
            }

            if (existsSync(storageStatePath)) {
                const content = readFileSync(storageStatePath, 'utf-8')
                const parsed = JSON.parse(content)
                if (parsed.cookies) storageState.cookies = parsed.cookies
                if (parsed.origins) storageState.origins = parsed.origins
            }

            await saveUserSession(userId, storageState)
            console.log(`[MCP] Synced session to DB for user: ${userId}`)
        } catch (error) {
            console.error(`[MCP] Failed to sync session for user ${userId}:`, error)
        }
    }

    const restoreFromDatabase = async (): Promise<void> => {
        try {
            const session = await getUserSession(userId)
            if (session) {
                writeFileSync(storageStatePath, JSON.stringify(session, null, 2))
                console.log(`[MCP] Restored session from DB for user: ${userId}`)
            }
        } catch (error) {
            console.error(`[MCP] Failed to restore session for user ${userId}:`, error)
        }
    }

    let intervalId: ReturnType<typeof setInterval> | null = null

    const startPeriodicSync = (): void => {
        const { syncIntervalMs } = getSessionSyncConfig()
        if (syncIntervalMs <= 0) return

        stopPeriodicSync()
        intervalId = setInterval(() => {
            syncToDatabase()
        }, syncIntervalMs)

        syncIntervals.set(userId, intervalId)
    }

    const stopPeriodicSync = (): void => {
        if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
        }
        syncIntervals.delete(userId)
    }

    return {
        connect,
        listTools,
        callTool,
        disconnect,
        getServerName,
        getUserId,
        getUserDataDir,
        syncToDatabase,
        restoreFromDatabase,
        startPeriodicSync,
        stopPeriodicSync,
    }
}

export async function cleanupIsolatedMCPClient(userId: string): Promise<void> {
    const client = isolatedClientCache.get(userId)
    if (client) {
        await client.syncToDatabase()
        client.stopPeriodicSync()
        await client.disconnect()
        isolatedClientCache.delete(userId)
        console.log(`[MCP] Cleaned up isolated client for user: ${userId}`)
    }
}

export async function cleanupAllIsolatedClients(): Promise<void> {
    for (const userId of isolatedClientCache.keys()) {
        await cleanupIsolatedMCPClient(userId)
    }
}

export async function disconnectAllMCPClients(): Promise<void> {
    for (const client of sharedClientCache.values()) {
        await client.disconnect()
    }
    sharedClientCache.clear()

    await cleanupAllIsolatedClients()
}

export function stopAllSyncIntervals(): void {
    for (const interval of syncIntervals.values()) {
        clearInterval(interval)
    }
    syncIntervals.clear()
}
