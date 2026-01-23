import { config } from './config'
import { Message, LLMResponse, AgentInput } from './types'

interface LLMClientConfig {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
}

function createLLMClient(overrides?: LLMClientConfig) {
    const baseUrl = overrides?.baseUrl || config.baseUrl
    const apiKey = overrides?.apiKey || config.apiKey
    const model = overrides?.model || config.model
    const timeout = overrides?.timeout || config.timeout

    async function chat(messages: Message[], maxTokens?: number): Promise<LLMResponse> {
        const url = `${baseUrl}/chat/completions`

        const body: Record<string, unknown> = {
            model: model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
                name: m.name,
            })),
            temperature: 0.1,
        }

        if (maxTokens) {
            body.max_tokens = maxTokens
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`OpenAI API error: ${response.status} - ${error}`)
            }

            const data = await response.json()

            const choice = data.choices?.[0]
            if (!choice) {
                throw new Error('No response from OpenAI API')
            }

            const message = choice.message

            return {
                content: message.content || '',
                toolCalls: message.tool_calls?.map((tc: Record<string, unknown>) => ({
                    id: tc.id as string,
                    type: tc.type as 'function',
                    function: {
                        name: (tc.function as Record<string, unknown>).name as string,
                        arguments: (tc.function as Record<string, unknown>).arguments as string,
                    },
                })),
                finishReason: choice.finish_reason || 'stop',
            }
        } catch (error) {
            clearTimeout(timeoutId)
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`)
            }
            throw error
        }
    }

    async function streamChat(
        messages: Message[],
        onChunk: (chunk: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        const url = `${baseUrl}/chat/completions`

        const body = {
            model: model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            stream: true,
            temperature: 0.1,
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`OpenAI API error: ${response.status} - ${error}`)
            }

            const reader = response.body?.getReader()
            if (!reader) {
                throw new Error('Failed to get response stream')
            }

            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6)
                        if (data === '[DONE]') {
                            onComplete()
                            return
                        }

                        try {
                            const parsed = JSON.parse(data)
                            const content = parsed.choices?.[0]?.delta?.content
                            if (content) {
                                onChunk(content)
                            }
                        } catch {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }

            onComplete()
        } catch (error) {
            clearTimeout(timeoutId)
            if (error instanceof Error && error.name === 'AbortError') {
                onError(new Error(`Request timeout after ${timeout}ms`))
            } else {
                onError(error instanceof Error ? error : new Error('Unknown error'))
            }
        }
    }

    return {
        chat,
        streamChat,
    }
}

function createLLMClientFromInput(input: AgentInput): ReturnType<typeof createLLMClient> {
    return createLLMClient({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
    })
}

export const llmClient = createLLMClient()
export { createLLMClient, createLLMClientFromInput }
