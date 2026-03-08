import { config } from './config'
import { createSystemPrompt } from './prompt'
import { createLLMClientFromInput } from './client'
import {
    ToolCallContent,
    AgentState,
    AgentStatus,
    AgentInput,
    AgentOutput,
    AgentHistoryEntry,
    MessageRole,
    ThinkingMode,
    Tool,
} from './types'
import {
    getAllToolsIncludingMCP,
    convertToAgentTool,
} from './tools'
import { getSkillByName } from './skills'
import { Agent, AgentMessage } from '@mariozechner/pi-agent-core'

interface AgentInterface {
    run: (input: AgentInput) => Promise<AgentOutput>
    getState: () => Readonly<AgentState>
    confirmAction: (approved: boolean, alternativeInput?: string) => Promise<AgentOutput>
}

async function loadAllTools(): Promise<Tool[]> {
    const allTools = await getAllToolsIncludingMCP()
    return allTools
}

const shouldAskForConfirmation = (content: string, state: AgentState): boolean => {
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

function createAgent(input?: AgentInput, onProgress?: (entry: AgentHistoryEntry) => Promise<void>): AgentInterface {
    let toolsCache: Tool[] | null = null

    const getAllTools = async (): Promise<Tool[]> => {
        if (!toolsCache) {
            toolsCache = await loadAllTools()
        }
        return toolsCache
    }

    const effectiveInput = input || { task: '' }
    const thinkingMode: ThinkingMode = effectiveInput.thinkingMode || 'auto'
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

    const run = async (input: AgentInput): Promise<AgentOutput> => {
        resetState()
        state.status = (thinkingMode !== 'disabled' ? AgentStatus.Thinking : AgentStatus.Executing) as AgentStatus

        if (input.taskHistory) {
            state.history.push(...input.taskHistory)
        }

        const rawTools = await getAllTools()
        const agentTools = rawTools.map(t => convertToAgentTool(t, userId))

        const systemPrompt = await createSystemPrompt(rawTools, thinkingMode)
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

        const initialMessages: AgentMessage[] = input.taskHistory ? input.taskHistory.map(h => {
            if (h.role === 'tool') {
                return {
                    role: 'toolResult',
                    toolCallId: h.tool_call_id || 'unknown',
                    content: [{ type: 'text', text: h.content }],
                    timestamp: h.timestamp
                } as any;
            }
            if (h.role === 'assistant') {
                const contentBlocks: any[] = [];
                if (h.content) {
                    contentBlocks.push({ type: 'text', text: h.content });
                }
                if (h.tool_calls) {
                    contentBlocks.push(...h.tool_calls.map(tc => ({
                        type: 'toolCall',
                        id: tc.id,
                        name: tc.function.name,
                        arguments: JSON.parse(tc.function.arguments)
                    })));
                }
                return {
                    role: 'assistant',
                    content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: '' }],
                    timestamp: h.timestamp
                } as any;
            }
            return {
                role: h.role,
                content: h.content,
                timestamp: h.timestamp
            } as any;
        }) : [];

        const model = createLLMClientFromInput(effectiveInput)

        const agent = new Agent({
            initialState: {
                systemPrompt: fullSystemPrompt,
                model,
                tools: agentTools as any,
                messages: initialMessages,
            }
        })

        let finalResponse = ''
        const pendingProgress: Promise<void>[] = []

        const unsubscribe = agent.subscribe((event) => {
            if (event.type === 'message_end') {
                const msg = event.message as any;
                if (msg.role === 'assistant') {
                    const extractedToolCalls = Array.isArray(msg.content)
                        ? msg.content.filter((c: any) => c.type === 'toolCall').map((tc: any) => ({
                            id: tc.id,
                            type: 'function',
                            function: {
                                name: tc.name,
                                arguments: JSON.stringify(tc.arguments || {})
                            }
                        }))
                        : undefined;

                    const contentStr = Array.isArray(msg.content)
                        ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
                        : (typeof msg.content === 'string' ? msg.content : '');

                    const assistantErrorMessage = typeof msg.errorMessage === 'string'
                        ? msg.errorMessage.trim()
                        : '';
                    const hasTextContent = contentStr.trim().length > 0;
                    const hasToolCalls = (extractedToolCalls?.length || 0) > 0;
                    const isAbortErrorMessage = assistantErrorMessage === 'Aborted' || assistantErrorMessage === 'Request was aborted';

                    if (
                        state.status === AgentStatus.AwaitingConfirmation &&
                        isAbortErrorMessage &&
                        !hasTextContent &&
                        !hasToolCalls
                    ) {
                        return;
                    }

                    if (!hasTextContent && !hasToolCalls && assistantErrorMessage.length === 0) {
                        return;
                    }

                    const entry: AgentHistoryEntry = {
                        iteration: state.currentIteration,
                        timestamp: Date.now(),
                        role: MessageRole.Assistant,
                        content: hasTextContent ? contentStr : (assistantErrorMessage ? `Error: ${assistantErrorMessage}` : ''),
                        tool_calls: hasToolCalls ? extractedToolCalls : undefined
                    };

                    state.history.push(entry);
                    if (onProgress) {
                        pendingProgress.push(onProgress(entry));
                    }

                    if (hasTextContent && shouldAskForConfirmation(contentStr, state)) {
                        state.requiresHumanConfirmation = true;
                        state.status = AgentStatus.AwaitingConfirmation;
                        agent.abort();
                    }
                }
            } else if (event.type === 'tool_execution_end') {
                const resultDetails = event.result?.details;
                
                const toolCallContent: ToolCallContent = {
                    content: event.result?.content?.[0]?.text || '',
                    toolName: event.toolName,
                };

                const entry: AgentHistoryEntry = {
                    iteration: state.currentIteration,
                    timestamp: Date.now(),
                    role: MessageRole.Tool,
                    content: JSON.stringify(toolCallContent),
                    tool_call_id: event.toolCallId,
                };
                
                state.history.push(entry);
                if (onProgress) {
                    pendingProgress.push(onProgress(entry));
                }

                state.currentIteration++;

                if (resultDetails?.requiresConfirmation || event.toolName === 'ask_user') {
                    state.requiresHumanConfirmation = true;
                    state.status = AgentStatus.AwaitingConfirmation;
                    agent.abort();
                } else if (resultDetails?.error && isHighRiskError(resultDetails.error)) {
                    state.requiresHumanConfirmation = true;
                    state.status = AgentStatus.AwaitingConfirmation;
                    agent.abort();
                }
            }
        });

        try {
            await agent.prompt([{ role: 'user', content: input.task } as any]);
            const lastMessage = agent.state.messages[agent.state.messages.length - 1] as any;
            
            const hasToolCalls = lastMessage?.content && Array.isArray(lastMessage.content) 
                ? lastMessage.content.some((c: any) => c.type === 'toolCall')
                : false;

            if (lastMessage && lastMessage.role === 'assistant') {
                const assistantErrorMessage = typeof lastMessage.errorMessage === 'string'
                    ? lastMessage.errorMessage.trim()
                    : '';
                const finalTextResponse = Array.isArray(lastMessage.content)
                    ? lastMessage.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
                    : (typeof lastMessage.content === 'string' ? lastMessage.content : '');

                if (state.status !== AgentStatus.AwaitingConfirmation && (assistantErrorMessage || lastMessage.stopReason === 'error')) {
                    finalResponse = assistantErrorMessage || 'Unknown error';
                    state.status = AgentStatus.Error;
                } else if (!hasToolCalls) {
                    finalResponse = finalTextResponse;
                    if (state.status !== AgentStatus.AwaitingConfirmation) {
                        state.status = AgentStatus.Completed;
                    }
                }
            }
        } catch (error) {
            if (state.status !== AgentStatus.AwaitingConfirmation) {
                state.status = AgentStatus.Error;
                finalResponse = error instanceof Error ? error.message : 'Unknown error';
                
                if (finalResponse !== 'Aborted' && finalResponse !== 'Agent aborted') {
                    const errorEntry: AgentHistoryEntry = {
                        iteration: state.currentIteration,
                        timestamp: Date.now(),
                        role: MessageRole.Assistant,
                        content: `Error: ${finalResponse}`,
                    };
                    if (onProgress) {
                        pendingProgress.push(onProgress(errorEntry));
                    }
                }
            }
        } finally {
            unsubscribe();
            // Await all background DB writes to finish before returning to worker pool
            if (pendingProgress.length > 0) {
                await Promise.allSettled(pendingProgress);
            }
        }

        return {
            response: finalResponse || (state.status === AgentStatus.AwaitingConfirmation ? 'Awaiting confirmation' : 'Task completed'),
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

        const responseContent = approved 
            ? (alternativeInput ? `User guidance: ${alternativeInput}` : 'Confirmed. Please proceed.')
            : 'Not confirmed. Please suggest a different approach.';

        state.requiresHumanConfirmation = false;
        state.status = AgentStatus.Thinking;

        return run({ task: responseContent, taskHistory: state.history });
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
