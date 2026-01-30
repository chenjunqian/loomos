import { Tool, ToolResult } from '../types'
import { systemTools, systemToolHandlers } from './system-tool'
import { getMcpManager } from '../../mcp'

export { systemTools, systemToolHandlers }

export interface OpenAITool {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: {
            type: 'object'
            properties: Record<string, ToolParameter>
            required: string[]
            additionalProperties: false
        }
    }
}

interface ToolParameter {
    type: string
    description: string
    enum?: string[]
}

export function toolsToOpenAIFormat(tools: Tool[]): OpenAITool[] {
    return tools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'object' as const,
                properties: tool.parameters.properties,
                required: tool.parameters.required || [],
                additionalProperties: false,
            },
        },
    }))
}

export const allTools: Tool[] = [...systemTools]

export const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
    ...systemToolHandlers,
}

export async function createMcpToolHandler(toolName: string): Promise<((args: Record<string, unknown>) => Promise<ToolResult>) | null> {
    try {
        const manager = await getMcpManager()
        const tool = await manager.getTool(toolName)
        if (!tool) return null

        return async (args: Record<string, unknown>): Promise<ToolResult> => {
            try {
                const result = await manager.callTool(toolName, args)
                const textContent = result.content
                    .map((c) => (c.type === 'text' ? c.text || '' : `[${c.type}]`))
                    .filter(Boolean)
                    .join('\n')

                return {
                    success: !result.isError,
                    content: textContent || 'No content',
                    error: result.isError ? textContent : undefined,
                }
            } catch (error) {
                return {
                    success: false,
                    content: '',
                    error: error instanceof Error ? error.message : 'Unknown error',
                }
            }
        }
    } catch {
        return null
    }
}

export async function getToolByName(name: string): Promise<Tool | undefined> {
    const systemTool = allTools.find((t) => t.name === name)
    if (systemTool) return systemTool

    try {
        const manager = await getMcpManager()
        return manager.getTool(name)
    } catch {
        return undefined
    }
}

export async function validateToolCall(toolName: string, args: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const tool = await getToolByName(toolName)
    if (!tool) {
        return { valid: false, error: `Unknown tool: ${toolName}` }
    }

    const required = tool.parameters.required || []
    for (const param of required) {
        if (!(param in args) || args[param] === undefined || args[param] === '') {
            return { valid: false, error: `Missing required parameter: ${param}` }
        }
    }

    return { valid: true }
}

export async function callToolHandler(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const systemHandler = toolHandlers[toolName]
    if (systemHandler) {
        return systemHandler(args)
    }

    const mcpHandler = await createMcpToolHandler(toolName)
    if (mcpHandler) {
        return mcpHandler(args)
    }

    return {
        success: false,
        content: '',
        error: `No handler for tool: ${toolName}`,
    }
}
