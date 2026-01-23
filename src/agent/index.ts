import { config } from './config'
import { createSystemPrompt } from './prompt'
import { llmClient } from './client'
import {
    ToolCall,
    ToolResult,
    AgentState,
    AgentStatus,
    AgentInput,
    AgentOutput,
    AgentHistoryEntry,
    LLMResponse,
    MessageRole,
} from './types'
import { allTools, toolHandlers, validateToolCall } from './tools'

interface Agent {
    run: (input: AgentInput) => Promise<AgentOutput>
    getState: () => Readonly<AgentState>
    confirmAction: (approved: boolean, alternativeInput?: string) => Promise<AgentOutput>
}

function createAgent(): Agent {
    // Private state encapsulated in closure
    let state: AgentState = {
        status: AgentStatus.Idle,
        messages: [],
        history: [],
        currentIteration: 0,
        uncertaintyLevel: 0,
        requiresHumanConfirmation: false,
    }
    const systemPrompt = createSystemPrompt(allTools)

    // Private helper functions
    const resetState = (): void => {
        state = {
            status: AgentStatus.Idle,
            messages: [],
            history: [],
            currentIteration: 0,
            uncertaintyLevel: 0,
            requiresHumanConfirmation: false,
        }
    }

    const think = async (): Promise<LLMResponse> => {
        state.status = AgentStatus.Thinking
        return llmClient.chat(state.messages)
    }

    const act = async (toolCall: ToolCall): Promise<ToolResult> => {
        state.status = AgentStatus.Executing

        const validation = validateToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments))
        if (!validation.valid) {
            return {
                success: false,
                content: '',
                error: validation.error,
            }
        }

        const handler = toolHandlers[toolCall.function.name]
        if (!handler) {
            return {
                success: false,
                content: '',
                error: `No handler for tool: ${toolCall.function.name}`,
            }
        }

        const args = JSON.parse(toolCall.function.arguments)
        const result = await handler(args)

        const entry: AgentHistoryEntry = {
            iteration: state.currentIteration,
            reasoning: extractReasoning(),
            action: `${toolCall.function.name}(${JSON.stringify(args)})`,
            result: result.success ? 'Success' : `Error: ${result.error}`,
            uncertaintyDetected: false,
            timestamp: Date.now(),
        }
        state.history.push(entry)

        return result
    }

    const extractReasoning = (): string => {
        const lastAssistantMsg = state.messages.filter((m) => m.role === 'assistant').pop()
        if (!lastAssistantMsg?.content) return ''

        const thoughtMatch = lastAssistantMsg.content.match(/<thought>([\s\S]*?)<\/thought>/)
        return thoughtMatch ? thoughtMatch[1].trim() : ''
    }

    const shouldAskForConfirmation = (content: string): boolean => {
        if (content.includes('<uncertainty>')) {
            state.uncertaintyLevel = 1.0
            return true
        }

        const uncertaintyIndicators = [
            /I'm not sure/i,
            /I need clarification/i,
            /could you clarify/i,
            /would you like me to/i,
            /I'm uncertain/i,
            /it depends/i,
            /perhaps/i,
            /maybe/i,
            /might\s+(cause|result|lead)/i,
        ]

        const matches = uncertaintyIndicators.filter((r) => r.test(content)).length
        state.uncertaintyLevel = matches / uncertaintyIndicators.length

        return state.uncertaintyLevel >= config.uncertainThreshold
    }

    const isHighRiskError = (error: string): boolean => {
        const highRiskPatterns = [
            /permission denied/i,
            /access denied/i,
            /data loss/i,
            /cannot delete/i,
            /critical/i,
            /fatal/i,
        ]
        return highRiskPatterns.some((p) => p.test(error))
    }

    const run = async (input: AgentInput): Promise<AgentOutput> => {
        resetState()
        state.status = AgentStatus.Thinking

        state.messages = [
            { role: MessageRole.System, content: systemPrompt },
            { role: MessageRole.User, content: input.task },
        ]

        while (state.currentIteration < config.maxIterations) {
            try {
                const response = await think()

                if (shouldAskForConfirmation(response.content)) {
                    state.requiresHumanConfirmation = true
                    state.status = AgentStatus.AwaitingConfirmation
                    break
                }

                if (!response.toolCalls || response.toolCalls.length === 0) {
                    state.status = AgentStatus.Completed
                    return {
                        response: response.content,
                        status: AgentStatus.Completed,
                        history: state.history,
                        requiresConfirmation: false,
                    }
                }

                const toolResult = await act(response.toolCalls[0])

                if (!toolResult.success) {
                    if (isHighRiskError(toolResult.error || '')) {
                        state.requiresHumanConfirmation = true
                        state.status = AgentStatus.AwaitingConfirmation
                        break
                    }
                }

                state.messages.push({
                    role: MessageRole.Assistant,
                    content: response.content,
                    tool_calls: response.toolCalls,
                })

                state.messages.push({
                    role: MessageRole.Tool,
                    content: toolResult.content,
                    tool_call_id: response.toolCalls[0].id,
                })

                state.currentIteration++
            } catch (error) {
                state.status = AgentStatus.Error
                return {
                    response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    status: AgentStatus.Error,
                    history: state.history,
                    requiresConfirmation: false,
                }
            }
        }

        state.status = AgentStatus.Completed
        return {
            response: 'Task completed (iteration limit reached)',
            status: AgentStatus.Completed,
            history: state.history,
            requiresConfirmation: state.requiresHumanConfirmation,
        }
    }

    const getState = (): Readonly<AgentState> => {
        return { ...state }
    }

    const confirmAction = async (approved: boolean, alternativeInput?: string): Promise<AgentOutput> => {
        if (!state.requiresHumanConfirmation) {
            throw new Error('No pending confirmation')
        }

        if (approved && alternativeInput) {
            state.messages.push({
                role: MessageRole.User,
                content: `User guidance: ${alternativeInput}`,
            })
        } else if (approved) {
            state.messages.push({
                role: MessageRole.User,
                content: 'Confirmed. Please proceed.',
            })
        } else {
            state.messages.push({
                role: MessageRole.User,
                content: 'Not confirmed. Please suggest a different approach.',
            })
        }

        state.requiresHumanConfirmation = false
        state.status = AgentStatus.Thinking

        return run({ task: state.messages.filter((m) => m.role === 'user').pop()?.content || '' })
    }

    return {
        run,
        getState,
        confirmAction,
    }
}

export { createAgent, allTools as availableTools }