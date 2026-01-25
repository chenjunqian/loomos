import { Tool, ToolResult } from '../types'
import { webTools, webToolHandlers } from './web'

export { webTools, webToolHandlers }

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

export const allTools: Tool[] = [...webTools]

export const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
    ...webToolHandlers,
}

export function getToolByName(name: string): Tool | undefined {
    return allTools.find((t) => t.name === name)
}

export function validateToolCall(toolName: string, args: Record<string, unknown>): { valid: boolean; error?: string } {
    const tool = getToolByName(toolName)
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
