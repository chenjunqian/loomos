import { AgentHistoryEntry, MessageRole } from '../agent/types'

export interface AskUserPrompt {
    question: string
    options: string[]
    context?: string
}

interface AskUserToolContent {
    content?: string
    toolName?: string
}

export function parseAskUserContent(content: string): AskUserPrompt | null {
    const normalizedContent = content.replace(/\r\n/g, '\n').trim()
    if (!normalizedContent) {
        return null
    }

    const lines = normalizedContent.split('\n')
    const questionLines: string[] = []
    const options: string[] = []
    const contextLines: string[] = []

    let inContext = false

    for (const rawLine of lines) {
        if (inContext) {
            contextLines.push(rawLine)
            continue
        }

        const contextMatch = rawLine.match(/^Context:\s*(.*)$/)
        if (contextMatch) {
            inContext = true
            if (contextMatch[1]) {
                contextLines.push(contextMatch[1])
            }
            continue
        }

        const optionMatch = rawLine.match(/^\s*\d+\.\s+(.*)$/)
        if (optionMatch) {
            options.push(optionMatch[1]!.trim())
            continue
        }

        if (options.length === 0) {
            questionLines.push(rawLine)
        }
    }

    if (options.length === 0) {
        return null
    }

    const question = questionLines.join('\n').trim()
    const context = contextLines.join('\n').trim()

    return {
        question,
        options,
        context: context || undefined,
    }
}

export function extractLatestAskUserContent(history: AgentHistoryEntry[]): string | null {
    const lastToolEntry = [...history]
        .reverse()
        .find((entry) => entry.role === MessageRole.Tool)

    if (!lastToolEntry?.content) {
        return null
    }

    try {
        const toolContent = JSON.parse(lastToolEntry.content) as AskUserToolContent
        if (toolContent.toolName !== 'ask_user' || typeof toolContent.content !== 'string') {
            return null
        }

        return toolContent.content
    } catch {
        return null
    }
}

export function extractLatestAskUserPrompt(history: AgentHistoryEntry[]): AskUserPrompt | null {
    const content = extractLatestAskUserContent(history)
    if (!content) {
        return null
    }

    return parseAskUserContent(content)
}
