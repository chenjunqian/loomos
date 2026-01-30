import { z } from 'zod'
import { McpConfig, McpServerConfig } from '../types'

export const ServerConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    transport: z.object({
        type: z.enum(['stdio', 'http', 'sse', 'websocket']),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().url().optional(),
        headers: z.record(z.string()).optional(),
        timeout: z.number().optional(),
    }),
    enabled: z.boolean().default(true),
    capabilities: z.object({
        tools: z.boolean().default(true),
        resources: z.boolean().default(false),
        prompts: z.boolean().default(false),
    }).optional(),
    filters: z.object({
        include: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
    }).optional(),
})

export const ConfigSchema = z.object({
    version: z.literal('1.0'),
    servers: z.array(ServerConfigSchema),
    discovery: z.object({
        enabled: z.boolean().default(false),
        port: z.number().default(3000),
        multicast: z.boolean().default(false),
        announceInterval: z.number().default(30),
    }).optional(),
})

export function validateServerConfig(raw: unknown): McpServerConfig {
    const result = ServerConfigSchema.safeParse(raw)
    if (!result.success) {
        throw new Error(`Invalid MCP server config: ${result.error.message}`)
    }
    return result.data
}

export function validateConfig(raw: unknown): McpConfig {
    const result = ConfigSchema.safeParse(raw)
    if (!result.success) {
        throw new Error(`Invalid MCP config: ${result.error.message}`)
    }
    return result.data
}
