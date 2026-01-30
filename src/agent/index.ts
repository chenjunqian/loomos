import { config } from './config'
import { createSystemPrompt } from './prompt'
import { createLLMClientFromInput } from './client'
import {
    ToolCall,
    ToolResult,
    ToolCallContent,
    AgentState,
    AgentStatus,
    AgentInput,
    AgentOutput,
    AgentHistoryEntry,
    LLMResponse,
    MessageRole,
    ThinkingMode,
    Message,
    Tool,
} from './types'
import { getMcpManager } from '../mcp'
import { toolsToOpenAIFormat, validateToolCall, callToolHandler, getToolByName } from './tools'

interface Agent {
    run: (input: AgentInput) => Promise<AgentOutput>
    getState: () => Readonly<AgentState>
    confirmAction: (approved: boolean, alternativeInput?: string) => Promise<AgentOutput>
}

async function loadAllTools(): Promise<Tool[]> {
    const systemTools = await import('./tools').then((m) => m.allTools)
    try {
        const manager = await getMcpManager()
        const mcpTools = await manager.getTools()
        return [...systemTools, ...mcpTools]
    } catch {
        return systemTools
    }
}

function createAgent(input?: AgentInput, onProgress?: (entry: AgentHistoryEntry) => Promise<void>): Agent {
    let toolsCache: Tool[] | null = null

    const getAllTools = async (): Promise<Tool[]> => {
        if (!toolsCache) {
            toolsCache = await loadAllTools()
        }
        return toolsCache
    }

    const effectiveInput = input || { task: '' }
    const thinkingMode: ThinkingMode = effectiveInput.thinkingMode || 'auto'
    const effectiveMaxIterations = effectiveInput.maxIterations || config.maxIterations
    const llmClient = createLLMClientFromInput(effectiveInput)

    let state: AgentState = {
        status: AgentStatus.Idle,
        messages: [],
        history: input?.taskHistory || [],
        currentIteration: 0,
        uncertaintyLevel: 0,
        requiresHumanConfirmation: false,
    }

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
        state.status = thinkingMode !== 'disabled' ? AgentStatus.Thinking : AgentStatus.Executing
        const tools = await getAllTools()
        return llmClient.chat(state.messages, toolsToOpenAIFormat(tools))
    }

    const act = async (toolCall: ToolCall): Promise<ToolResult> => {
        state.status = AgentStatus.Executing

        const validation = await validateToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments))
        if (!validation.valid) {
            return {
                success: false,
                content: '',
                error: validation.error,
            }
        }

        const args = JSON.parse(toolCall.function.arguments)
        const result = await callToolHandler(toolCall.function.name, args)

        const entry: AgentHistoryEntry = {
            iteration: state.currentIteration,
            content: result.content,
            timestamp: Date.now(),
            role: MessageRole.System
        }
        state.history.push(entry)

        if (result.requiresConfirmation) {
            state.requiresHumanConfirmation = true
            state.status = AgentStatus.AwaitingConfirmation
        }

        return result
    }

    const extractReasoning = (): string => {
        if (thinkingMode === 'disabled') {
            return ''
        }

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
        state.status = thinkingMode !== 'disabled' ? AgentStatus.Thinking : AgentStatus.Executing

        let historyMessages: Message[] = []
        if (input.taskHistory) {
            state.history.push(...input.taskHistory)
            historyMessages = input.taskHistory
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((h) => ({ role: h.role, content: h.content }))
        }

        const tools = await getAllTools()
        const systemPrompt = createSystemPrompt(tools, thinkingMode)

        state.messages = [
            { role: MessageRole.System, content: systemPrompt },
            ...historyMessages,
        ]

        while (state.currentIteration < effectiveMaxIterations) {
            let taskHistory: AgentHistoryEntry = {
                iteration: state.currentIteration,
                timestamp: Date.now(),
                role: MessageRole.System,
                content: '',
            }

            try {
                state.history.push(taskHistory)
                const response = await think()
                taskHistory.content = response.content
                if (shouldAskForConfirmation(response.content)) {
                    state.requiresHumanConfirmation = true
                    state.status = AgentStatus.AwaitingConfirmation
                    if (onProgress) await onProgress(taskHistory)
                    break
                }

                if (!response.toolCalls || response.toolCalls.length === 0) {
                    state.status = AgentStatus.Completed
                    taskHistory.role = MessageRole.Assistant
                    if (onProgress) await onProgress(taskHistory)
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
                        if (onProgress) await onProgress(taskHistory)
                        break
                    }
                }

                state.messages.push({
                    role: MessageRole.Assistant,
                    content: response.content,
                    reasoning_content: response.reasoningContent,
                    tool_calls: response.toolCalls,
                })

                state.messages.push({
                    role: MessageRole.Tool,
                    content: toolResult.content,
                    tool_call_id: response.toolCalls[0].id,
                })

                const toolCallContent: ToolCallContent = {
                    content: toolResult.content,
                    toolName: response.toolCalls[0].function.name,
                }
                const toolHistoryEntry: AgentHistoryEntry = {
                    iteration: state.currentIteration,
                    timestamp: Date.now(),
                    role: MessageRole.Tool,
                    content: JSON.stringify(toolCallContent),
                }
                state.history.push(toolHistoryEntry)
                if (onProgress) await onProgress(toolHistoryEntry)

                state.currentIteration++
            } catch (error) {
                const errorMsg = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                state.status = AgentStatus.Error
                taskHistory.content = errorMsg
                if (onProgress) await onProgress(taskHistory)
                return {
                    response: errorMsg,
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

export { createAgent }
export async function availableTools(): Promise<Tool[]> {
    return loadAllTools()
}