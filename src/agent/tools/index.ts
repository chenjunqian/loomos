import { Tool, ToolResult } from '../types'
import { systemTools, systemToolHandlers } from './system-tool'
import {
    getMCPClient,
    getIsolatedMCPClient,
    extractMCPToolContent,
    parseMCPError,
    type MCPClient,
    type IsolatedMCPClient,
} from '../mcp/index.js'
import { getEnabledMCPServers, convertMCPToolToTool, getMCPServerConfig } from '../mcp/index.js'

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

export interface ToolParameter {
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

export const toolHandlers: Record<string, (args: Record<string, unknown>, userId?: string) => Promise<ToolResult>> = {
    ...systemToolHandlers,
}

const mcpToolCache: Tool[] = []
const mcpToolHandlers: Map<string, string> = new Map()

export async function loadMCPTools(): Promise<Tool[]> {
    const enabledServers = getEnabledMCPServers()

    for (const serverConfig of enabledServers) {
        try {
            const mcpClient = await getMCPClient(serverConfig)
            const result = await mcpClient.listTools()

            for (const tool of result.tools) {
                const adaptedTool = convertMCPToolToTool(tool, serverConfig.name)
                mcpToolCache.push(adaptedTool)
                mcpToolHandlers.set(adaptedTool.name, serverConfig.name)
            }
        } catch (error) {
            console.error(`Failed to load tools from MCP server ${serverConfig.name}:`, error)
        }
    }

    return mcpToolCache
}

export async function getAllToolsIncludingMCP(): Promise<Tool[]> {
    const mcpTools = await loadMCPTools()
    return [...systemTools, ...mcpTools]
}

export async function getMCPToolHandler(
    toolName: string
): Promise<((args: Record<string, unknown>) => Promise<ToolResult>) | null>
export async function getMCPToolHandler(
    toolName: string,
    userId?: string
): Promise<((args: Record<string, unknown>) => Promise<ToolResult>) | null>
export async function getMCPToolHandler(
    toolName: string,
    userId?: string
): Promise<((args: Record<string, unknown>) => Promise<ToolResult>) | null> {
    const serverName = mcpToolHandlers.get(toolName)
    if (!serverName) {
        return null
    }

    return async (args: Record<string, unknown>): Promise<ToolResult> => {
        try {
            let mcpClient: MCPClient | IsolatedMCPClient

            if (userId) {
                const serverConfig = getMCPServerConfig(serverName)
                if (!serverConfig) {
                    return {
                        success: false,
                        content: '',
                        error: `MCP server config not found: ${serverName}`,
                    }
                }
                mcpClient = await getIsolatedMCPClient(serverConfig, userId)
            } else {
                const config = { name: serverName, transport: 'stdio' as const }
                mcpClient = await getMCPClient(config as any)
            }

            const result = await mcpClient.callTool(toolName.split('_').slice(1).join('_'), args)
            return {
                success: true,
                content: extractMCPToolContent(result),
                error: undefined,
            }
        } catch (error) {
            return {
                success: false,
                content: '',
                error: parseMCPError(error),
            }
        }
    }
}

export async function getToolByName(name: string): Promise<Tool | undefined> {
    const systemTool = allTools.find((t) => t.name === name)
    if (systemTool) {
        return systemTool
    }

    return mcpToolCache.find((t) => t.name === name)
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

export async function callToolHandler(toolName: string, args: Record<string, unknown>, userId?: string): Promise<ToolResult> {
    const systemHandler = toolHandlers[toolName]
    if (systemHandler) {
        return systemHandler(args, userId)
    }

    return {
        success: false,
        content: '',
        error: `No handler for tool: ${toolName}`,
    }
}
