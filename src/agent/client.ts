import { config } from './config'
import { getModel, Model } from '@mariozechner/pi-ai'
import { AgentInput } from './types'
import { toolsToOpenAIFormat } from './tools'

function getApiType(baseUrl: string): 'openai-responses' | 'openai-completions' {
    return baseUrl.includes('api.openai.com') ? 'openai-responses' : 'openai-completions'
}

export function createLLMClientFromInput(input: AgentInput): Model<any> {
    const modelName = input.model || config.model
    const baseUrl = input.baseUrl || config.baseUrl
    
    if (input.apiKey) {
        process.env.OPENAI_API_KEY = input.apiKey;
    }
    if (input.baseUrl) {
        process.env.OPENAI_BASE_URL = input.baseUrl;
    }

    let model: Model<any> | undefined = getModel('openai', modelName as any)
    if (!model) {
        model = {
            id: modelName,
            name: modelName,
            api: getApiType(baseUrl) as any,
            provider: 'openai',
            baseUrl: baseUrl,
            reasoning: false,
            input: ['text', 'image'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
        } as Model<any>
    }
    return model
}

export function createLLMClient(): Model<any> {
    let model: Model<any> | undefined = getModel('openai', config.model as any)
    if (!model) {
        model = {
            id: config.model,
            name: config.model,
            api: getApiType(config.baseUrl) as any,
            provider: 'openai',
            baseUrl: config.baseUrl,
            reasoning: false,
            input: ['text', 'image'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
        } as Model<any>
    }
    return model
}

export const llmClient = createLLMClient()
export { toolsToOpenAIFormat }

