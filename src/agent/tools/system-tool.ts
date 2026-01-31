import { Tool, ToolResult } from '../types'

export const systemTools: Tool[] = [
    {
        name: 'web_fetch',
        description: 'Fetch content from a URL. Returns the text content of the page.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The URL to fetch',
                },
                options: {
                    type: 'string',
                    description: 'Optional JSON object with fetch options (method, headers, body)',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'web_search',
        description: 'Search the web for information using a search engine.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query',
                },
                numResults: {
                    type: 'string',
                    description: 'Number of results to return (default: 5)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'ask_user',
        description: 'Ask the user for clarification, feedback, or additional information. Returns questions in JSON format for easy UI rendering.',
        parameters: {
            type: 'object',
            properties: {
                questions: {
                    type: 'string',
                    description: 'JSON array of questions. Each question: {id, text, type?, options?}',
                },
                context: {
                    type: 'string',
                    description: 'Optional context about why user input is needed.',
                },
            },
            required: ['questions'],
        },
    },
]

export async function webFetch(url: string, options?: string): Promise<ToolResult> {
    try {
        const fetchOptions: Record<string, unknown> = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Agent/1.0)',
            },
        }

        if (options) {
            try {
                const parsed = JSON.parse(options)
                Object.assign(fetchOptions, parsed)
            } catch {
                return {
                    success: false,
                    content: '',
                    error: 'Invalid JSON in options parameter',
                }
            }
        }

        const response = await fetch(url, fetchOptions as RequestInit)

        if (!response.ok) {
            return {
                success: false,
                content: '',
                error: `HTTP ${response.status}: ${response.statusText}`,
            }
        }

        const content = await response.text()
        return {
            success: true,
            content: content.slice(0, 10000), // Limit content size
        }
    } catch (error) {
        return {
            success: false,
            content: '',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

export async function webSearch(query: string, numResults?: string): Promise<ToolResult> {
    try {
        // Use Bing search
        const limit = numResults ? parseInt(numResults, 10) : 5
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Agent/1.0)',
            },
        })

        if (!response.ok) {
            return {
                success: false,
                content: '',
                error: `HTTP ${response.status}: ${response.statusText}`,
            }
        }

        const html = await response.text()

        // Parse simple results from HTML
        const results: string[] = []
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*b_algo[^"]*"[^>]*>([^<]+)<\/a>/g
        let match

        while ((match = linkRegex.exec(html)) && results.length < limit) {
            const url = match[1]
            const title = match[2]?.replace(/<[^>]*>/g, '').trim()
            if (url && title) {
                results.push(`${results.length + 1}. [${title}](${url})`)
            }
        }

        if (results.length === 0) {
            return {
                success: true,
                content: 'No results found.',
            }
        }

        return {
            success: true,
            content: `Search results for "${query}":\n\n${results.join('\n')}`,
        }
    } catch (error) {
        return {
            success: false,
            content: '',
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

export interface AskUserQuestion {
    id: string
    text: string
    type?: 'text' | 'choice' | 'boolean'
    options?: string[]
}

export interface AskUserArgs {
    questions: AskUserQuestion[]
    context?: string
}

export async function askUser(args: AskUserArgs): Promise<ToolResult> {
    return {
        success: true,
        content: JSON.stringify({
            type: 'ask_user',
            questions: args.questions,
            context: args.context,
        }),
        requiresConfirmation: true,
    }
}

export const systemToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
    web_fetch: async (args) => webFetch(args.url as string, args.options as string),
    web_search: async (args) => webSearch(args.query as string, args.numResults as string),
    ask_user: async (args) => {
        const questionsStr = args.questions as string
        const questions = JSON.parse(questionsStr)
        return askUser({ questions, context: args.context as string })
    },
}