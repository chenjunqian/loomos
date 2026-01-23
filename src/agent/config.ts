export interface AgentConfig {
    apiKey: string
    baseUrl: string
    model: string
    timeout: number
    maxIterations: number
    temperature: number
}

export function getAgentConfig(): AgentConfig {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required')
    }

    return {
        apiKey,
        baseUrl: process.env.OPENAI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        timeout: parseInt(process.env.AGENT_TIMEOUT || '60000', 10),
        maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '20', 10),
        temperature: parseFloat(process.env.AGENT_TEMPERATURE || '0.5'),
    }
}

export const config = getAgentConfig()
