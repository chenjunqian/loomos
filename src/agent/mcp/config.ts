import { homedir } from 'node:os'

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
            command: 'bunx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', homedir()],
        },
    }
]

export function getMCPServerConfig(name: string): MCPServerConfig | undefined {
    return mcpServers.find((server) => server.name === name)
}

export function getEnabledMCPServers(): MCPServerConfig[] {
    return mcpServers.filter((server) => server.enabled)
}
