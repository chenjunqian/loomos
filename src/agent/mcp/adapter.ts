import { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js'
import { Tool } from '../types.js'
import { ToolParameter, OpenAITool } from '../tools/index.js'

interface MCPParameter {
    type: string
    description?: string
    enum?: string[]
    default?: unknown
}

export function convertMCPToolToTool(mcpTool: MCPTool, serverName: string): Tool {
    const properties: Record<string, ToolParameter> = {}

    const schemaProps = mcpTool.inputSchema.properties
    if (schemaProps) {
        for (const [key, value] of Object.entries(schemaProps) as [string, MCPParameter][]) {
            properties[key] = {
                type: value.type,
                description: value.description || '',
                enum: value.enum,
            }
        }
    }

    return {
        name: `${serverName}_${mcpTool.name}`,
        description: mcpTool.description || '',
        parameters: {
            type: 'object',
            properties,
            required: mcpTool.inputSchema.required || [],
        },
    }
}

export function convertMCPToolToOpenAI(mcpTool: MCPTool, serverName: string): OpenAITool {
    const properties: Record<string, ToolParameter> = {}

    const schemaProps = mcpTool.inputSchema.properties
    if (schemaProps) {
        for (const [key, value] of Object.entries(schemaProps) as [string, MCPParameter][]) {
            properties[key] = {
                type: value.type,
                description: value.description || '',
                enum: value.enum,
            }
        }
    }

    return {
        type: 'function',
        function: {
            name: `${serverName}_${mcpTool.name}`,
            description: mcpTool.description || '',
            parameters: {
                type: 'object',
                properties,
                required: mcpTool.inputSchema.required || [],
                additionalProperties: false,
            },
        },
    }
}

export function extractMCPToolContent(result: { content: Array<{ type: string; text?: string }> }): string {
    return result.content
        .map((item) => {
            if (item.type === 'text' && item.text) {
                return item.text
            }
            return JSON.stringify(item)
        })
        .filter(Boolean)
        .join('\n')
}

export function parseMCPError(error: unknown): string {
    if (error instanceof Error) {
        const message = error.message
        if (message.includes('MCP')) {
            return message
        }
        return `MCP Error: ${message}`
    }
    return `Unknown MCP error: ${String(error)}`
}
