import { Tool, ToolResult } from '../../agent/types'
import { McpTool, McpToolCallResult } from '../types'

interface ToolConverter {
    toLoomosTool: (mcpTool: McpTool, serverId: string) => Tool
    toLoomosResult: (result: McpToolCallResult) => ToolResult
}

export function createToolConverter(): ToolConverter {
    const toLoomosTool = (mcpTool: McpTool, serverId: string): Tool => ({
        name: `${serverId}_${mcpTool.name}`,
        description: `[${serverId}] ${mcpTool.description}`,
        parameters: {
            type: 'object',
            properties: Object.fromEntries(
                Object.entries(mcpTool.inputSchema.properties || {}).map(([key, schema]) => [
                    key,
                    {
                        type: schema.type,
                        description: schema.description || '',
                        enum: schema.enum,
                        default: schema.default,
                    },
                ])
            ),
            required: mcpTool.inputSchema.required || [],
        },
    })

    const toLoomosResult = (result: McpToolCallResult): ToolResult => {
        const textContent = result.content
            .map((c) => {
                if (c.type === 'text') return c.text || ''
                if (c.type === 'image') return `[Image: ${c.data?.substring(0, 50)}...]`
                if (c.type === 'resource') return `[Resource: ${c.uri}]`
                return `[${c.type}]`
            })
            .filter(Boolean)
            .join('\n')

        return {
            success: !result.isError,
            content: textContent || (result.isError ? 'Tool call returned error' : 'No content'),
            error: result.isError ? textContent : undefined,
        }
    }

    return {
        toLoomosTool,
        toLoomosResult,
    }
}
