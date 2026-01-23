import { Tool, ToolResult } from '../types'

export const webTools: Tool[] = [
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
        // Use DuckDuckGo HTML search (no API key required)
        const limit = numResults ? parseInt(numResults, 10) : 5
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`

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
        const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g
        let match

        while ((match = linkRegex.exec(html)) && results.length < limit) {
            const url = match[1]
            const title = match[2].replace(/<[^>]*>/g, '').trim()
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

export const webToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
    web_fetch: async (args) => webFetch(args.url as string, args.options as string),
    web_search: async (args) => webSearch(args.query as string, args.numResults as string),
}