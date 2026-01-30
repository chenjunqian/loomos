import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { McpConfig, McpServerConfig } from '../types'
import { validateConfig } from './schema'

interface ConfigLoader {
    load: () => Promise<McpConfig>
    validate: (raw: unknown) => McpConfig
    merge: (base: McpConfig, overrides: Partial<McpConfig>) => McpConfig
}

export function createConfigLoader(configPath?: string): ConfigLoader {
    const resolvePath = (): string => {
        if (configPath) return configPath
        return path.resolve(process.cwd(), 'config', 'mcp.yaml')
    }

    const expandEnv = (value: unknown): unknown => {
        if (typeof value !== 'string') return value
        return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || '')
    }

    const expandEnvInConfig = (config: McpConfig): McpConfig => ({
        ...config,
        servers: config.servers.map((server) => ({
            ...server,
            transport: {
                ...server.transport,
                env: server.transport.env
                    ? Object.fromEntries(
                          Object.entries(server.transport.env).map(([k, v]) => [k, expandEnv(v) as string])
                      )
                    : undefined,
            },
        })),
    })

    const load = async (): Promise<McpConfig> => {
        const filePath = resolvePath()
        if (!fs.existsSync(filePath)) {
            throw new Error(`MCP config not found: ${filePath}`)
        }

        const content = fs.readFileSync(filePath, 'utf-8')
        const raw = yaml.load(content)
        const config = validateConfig(raw)
        return expandEnvInConfig(config)
    }

    const validate = (raw: unknown): McpConfig => {
        return validateConfig(raw)
    }

    const merge = (base: McpConfig, overrides: Partial<McpConfig>): McpConfig => ({
        ...base,
        servers: [
            ...base.servers.map((s) => {
                const override = overrides.servers?.find((o) => o.id === s.id)
                return override ? { ...s, ...override } : s
            }),
            ...(overrides.servers?.filter((o) => !base.servers.find((s) => s.id === o.id)) || []),
        ],
    })

    return { load, validate, merge }
}

export async function loadMcpConfig(configPath?: string): Promise<McpConfig> {
    return createConfigLoader(configPath).load()
}
