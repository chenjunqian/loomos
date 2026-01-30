import { McpClient } from '../client'
import { McpServerState } from '../types'

export interface ServerRegistry {
    register: (client: McpClient) => void
    unregister: (id: string) => void
    get: (id: string) => McpClient | undefined
    getAll: () => McpClient[]
    getStates: () => McpServerState[]
}

export function createServerRegistry(): ServerRegistry {
    const clients: Map<string, McpClient> = new Map()

    const register = (client: McpClient): void => {
        const state = client.getState()
        clients.set(state.id, client)
    }

    const unregister = (id: string): void => {
        clients.delete(id)
    }

    const get = (id: string): McpClient | undefined => {
        return clients.get(id)
    }

    const getAll = (): McpClient[] => {
        return Array.from(clients.values())
    }

    const getStates = (): McpServerState[] => {
        return Array.from(clients.values()).map((c) => c.getState())
    }

    return { register, unregister, get, getAll, getStates }
}
