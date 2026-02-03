import { homedir } from 'node:os'
import { mkdir } from 'node:fs/promises'

export interface MCPServerConfig {
    name: string
    enabled: boolean
    transport: 'stdio' | 'http'
    stdio?: {
        command: string
        args: string[]
        env?: Record<string, string>
    }
    http?: {
        url: string
    }
}

export const mcpServers: MCPServerConfig[] = [
    {
        name: 'filesystem',
        enabled: true,
        transport: 'stdio',
        stdio: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
    },
    {
        name: 'playwright',
        enabled: true,
        transport: 'stdio',
        stdio: {
            command: 'npx',
            args: ['-y', '@playwright/mcp@latest'],
        },
    },
]

export function getMCPServerConfig(name: string): MCPServerConfig | undefined {
    return mcpServers.find((server) => server.name === name)
}

export function getEnabledMCPServers(): MCPServerConfig[] {
    return mcpServers.filter((server) => server.enabled)
}

const MCPSessionDir = `${homedir()}/.loomos/mcp`

export function getUserStorageDir(userId: string): string {
    return `${MCPSessionDir}/${userId}`
}

export function getUserStorageStatePath(userId: string): string {
    return `${getUserStorageDir(userId)}/storage-state.json`
}

export async function ensureUserStorageDir(userId: string): Promise<string> {
    const dir = getUserStorageDir(userId)
    await mkdir(dir, { recursive: true })
    return dir
}

export function getIsolatedServerConfig(baseConfig: MCPServerConfig, userId: string): MCPServerConfig {
    if (baseConfig.transport !== 'stdio' || !baseConfig.stdio) {
        throw new Error('Isolated config only supports stdio transport')
    }

    const userDataDir = getUserStorageDir(userId)

    const env: Record<string, string> = {
        ...baseConfig.stdio.env,
        PLAYWRIGHT_MCP_USER_DATA_DIR: userDataDir,
        PLAYWRIGHT_MCP_ISOLATED: '1',
    }

    const args = [...baseConfig.stdio.args]

    if (baseConfig.name === 'playwright') {
        args.push('--isolated', '--user-data-dir', userDataDir)
    }

    return {
        ...baseConfig,
        stdio: {
            ...baseConfig.stdio,
            args,
            env,
        },
    }
}

export function getSessionSyncConfig() {
    return {
        syncIntervalMs: parseInt(process.env.PLAYWRIGHT_SESSION_SYNC_INTERVAL_MS || '30000', 10),
        sessionDir: MCPSessionDir,
    }
}
