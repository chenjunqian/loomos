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
import {
    getAllToolsIncludingMCP,
    toolsToOpenAIFormat,
    validateToolCall,
    callToolHandler,
    getMCPToolHandler,
} from './tools'
import { getSkillByName } from './skills'
import { logger } from '../utils/logger'

interface Agent {
    run: (input: AgentInput) => Promise<AgentOutput>
    getState: () => Readonly<AgentState>
    confirmAction: (approved: boolean, alternativeInput?: string) => Promise<AgentOutput>
}

async function loadAllTools(): Promise<Tool[]> {
    const allTools = await getAllToolsIncludingMCP()
    return allTools
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
    const userId = effectiveInput.userId

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

        const mcpHandler = await getMCPToolHandler(toolCall.function.name, userId)
        if (mcpHandler) {
            const result = await mcpHandler(args)
            const entry: AgentHistoryEntry = {
                iteration: state.currentIteration,
                content: result.content,
                timestamp: Date.now(),
                role: MessageRole.System,
            }
            state.history.push(entry)

            if (result.requiresConfirmation) {
                state.requiresHumanConfirmation = true
                state.status = AgentStatus.AwaitingConfirmation
            }

            return result
        }

        const result = await callToolHandler(toolCall.function.name, args, userId)

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
            const sortedHistory = input.taskHistory.sort((a, b) => a.timestamp - b.timestamp)
            
            // Build messages with proper tool_calls assignment
            // Tool messages have tool_calls stored, but they belong to the assistant message
            // We need to move tool_calls from tool messages to their preceding assistant messages
            const rawMessages: (Message & { tool_calls?: ToolCall[] })[] = sortedHistory.map((h) => ({
                role: h.role,
                content: h.content,
                tool_call_id: h.tool_call_id,
                tool_calls: h.tool_calls,
            }))
            
            // Process messages: move tool_calls from tool role to preceding assistant role
            for (let i = 0; i < rawMessages.length; i++) {
                const msg = rawMessages[i]!
                if (msg.role === 'tool' && msg.tool_calls) {
                    // Find preceding assistant message and give it the tool_calls
                    for (let j = i - 1; j >= 0; j--) {
                        const prevMsg = rawMessages[j]!
                        if (prevMsg.role === 'assistant') {
                            prevMsg.tool_calls = msg.tool_calls
                            break
                        }
                    }
                    // Remove tool_calls from tool message (it should only have tool_call_id)
                    msg.tool_calls = undefined
                }
            }
            
            historyMessages = rawMessages
        }

        const tools = await getAllTools()
        const systemPrompt = await createSystemPrompt(tools, thinkingMode)

        let fullSystemPrompt = systemPrompt
        if (effectiveInput.activeSkills && effectiveInput.activeSkills.length > 0) {
            const activeSkillsContent = effectiveInput.activeSkills
                .map(name => {
                    const skill = getSkillByName(name)
                    if (skill) {
                        return `\n\n=== BEGIN SKILL: ${skill.metadata.name} ===\n\n${skill.content}\n\n=== END SKILL: ${skill.metadata.name} ===`
                    }
                    return null
                })
                .filter(Boolean)
                .join('\n')

            fullSystemPrompt = systemPrompt + `\n\n=== ACTIVATED SKILLS ===${activeSkillsContent}`
        }

        state.messages = [
            { role: MessageRole.System, content: fullSystemPrompt },
            ...historyMessages,
        ]

        while (state.currentIteration < effectiveMaxIterations) {
            logger.debug('Agent', `Iteration ${state.currentIteration}/${effectiveMaxIterations}`)
            let taskHistory: AgentHistoryEntry = {
                iteration: state.currentIteration,
                timestamp: Date.now(),
                role: MessageRole.Assistant,
                content: '',
            }

            try {
                state.history.push(taskHistory)
                const response = await think()
                taskHistory.content = response.content
                const shouldConfirm = shouldAskForConfirmation(response.content)
                logger.debug('Agent', `Should ask for confirmation: ${shouldConfirm}`)
                if (shouldConfirm) {
                    state.requiresHumanConfirmation = true
                    state.status = AgentStatus.AwaitingConfirmation
                    if (onProgress) await onProgress(taskHistory)
                    break
                }

                if (!response.toolCalls || response.toolCalls.length === 0) {
                    state.status = AgentStatus.Completed
                    taskHistory.role = MessageRole.Assistant
                    logger.debug('Agent', `Completed without tool calls at iteration ${state.currentIteration}`)
                    if (onProgress) await onProgress(taskHistory)
                    return {
                        response: response.content,
                        status: AgentStatus.Completed,
                        history: state.history,
                        requiresConfirmation: false,
                    }
                }

                const toolCall = response.toolCalls[0]!
                const toolName = toolCall.function.name
                const isMCP = toolName.includes('_')

                taskHistory.tool_calls = response.toolCalls

                // Save assistant entry with tool_calls before executing the tool
                if (onProgress) await onProgress(taskHistory)

                logger.debug('Agent', `Tool call: ${toolName} (${isMCP ? 'MCP' : 'system'})`)
                const toolResult = await act(toolCall)

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
                    tool_call_id: toolCall.id,
                })

                const toolCallContent: ToolCallContent = {
                    content: toolResult.content,
                    toolName: toolCall.function.name,
                }
                const toolHistoryEntry: AgentHistoryEntry = {
                    iteration: state.currentIteration,
                    timestamp: Date.now(),
                    role: MessageRole.Tool,
                    content: JSON.stringify(toolCallContent),
                    tool_call_id: toolCall.id,
                }
                state.history.push(toolHistoryEntry)
                if (onProgress) await onProgress(toolHistoryEntry)

                state.currentIteration++

                if (toolCall.function.name === 'ask_user') {
                    state.requiresHumanConfirmation = true
                    state.status = AgentStatus.AwaitingConfirmation
                    break
                }
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

        return {
            response: 'Task completed (iteration limit reached)',
            status: state.status,
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