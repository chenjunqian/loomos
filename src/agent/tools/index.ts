import { Tool, ToolResult } from '../types'
import { webTools, webToolHandlers } from './web'

export { webTools, webToolHandlers }


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
