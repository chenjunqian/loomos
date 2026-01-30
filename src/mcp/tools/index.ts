import { createToolConverter } from './converter'
import { Tool } from '../../agent/types'
import { McpTool } from '../types'

export interface McpToolRegistry {
    addTools: (tools: McpTool[], serverId: string) => void
    getTool: (name: string) => Tool | undefined
    getAllTools: () => Tool[]
    filterTools: (filters: { include?: string[]; exclude?: string[] }) => Tool[]
}

export function createToolRegistry(): McpToolRegistry {
    const tools: Map<string, Tool> = new Map()
    const converter = createToolConverter()

    const addTools = (mcpTools: McpTool[], serverId: string): void => {
        for (const mcpTool of mcpTools) {
            const tool = converter.toLoomosTool(mcpTool, serverId)
            tools.set(tool.name, tool)
        }
    }

    const getTool = (name: string): Tool | undefined => {
        return tools.get(name)
    }

    const getAllTools = (): Tool[] => {
        return Array.from(tools.values())
    }

    const filterTools = (filters: { include?: string[]; exclude?: string[] }): Tool[] => {
        let result = Array.from(tools.values())

        if (filters.include?.length) {
            const includePattern = new RegExp(filters.include.join('|'))
            result = result.filter((t) => includePattern.test(t.name))
        }

        if (filters.exclude?.length) {
            const excludePattern = new RegExp(filters.exclude.join('|'))
            result = result.filter((t) => !excludePattern.test(t.name))
        }

        return result
    }

    return {
        addTools,
        getTool,
        getAllTools,
        filterTools,
    }
}
