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
        name: 'github',
        enabled: true,
        transport: 'stdio',
        stdio: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || '',
            },
        },
    },
    {
        name: 'fetch',
        enabled: false,
        transport: 'http',
        http: {
            url: process.env.MCP_FETCH_URL || 'http://localhost:3000/mcp',
        },
    },
]

export function getMCPServerConfig(name: string): MCPServerConfig | undefined {
    return mcpServers.find((server) => server.name === name)
}

export function getEnabledMCPServers(): MCPServerConfig[] {
    return mcpServers.filter((server) => server.enabled)
}
