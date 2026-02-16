import { Tool, ToolResult } from '../types'
import { glob } from 'glob'
import { searchTaskHistory } from '../../database/task-record'

export const systemTools: Tool[] = [
    {
        name: 'ask_user',
        description: 'Ask the user for clarification, feedback, or additional information. Format: Question text followed by numbered options (each on a new line).',
        parameters: {
            type: 'object',
            properties: {
                questions: {
                    type: 'string',
                    description: 'Question text with numbered options. Example: "Which deployment strategy?\n1. Blue/Green - Zero-downtime\n2. Rolling - Gradual rollout\n3. Canary - Test 5% traffic"',
                },
                context: {
                    type: 'string',
                    description: 'Optional additional context about why user input is needed.',
                },
            },
            required: ['questions'],
        },
    },
    {
        name: 'glob',
        description: 'Find files matching a glob pattern. Returns absolute paths of matching files.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.json")',
                },
                path: {
                    type: 'string',
                    description: 'Base directory to search in (defaults to current working directory)',
                },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'grep',
        description: 'Search file contents using regular expressions. Returns matching lines with line numbers.',
        parameters: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Regular expression pattern to search for',
                },
                path: {
                    type: 'string',
                    description: 'Directory to search in (defaults to current working directory)',
                },
                include: {
                    type: 'string',
                    description: 'File pattern to include (e.g., "*.ts", "*.{ts,js}")',
                },
                recursive: {
                    type: 'string',
                    description: 'Search recursively (default: true)',
                },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'bash',
        description: 'Execute a shell command. Returns command output. Use with caution - commands run in the working directory.',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Shell command to execute',
                },
                description: {
                    type: 'string',
                    description: 'Brief description of what this command does',
                },
                timeout: {
                    type: 'string',
                    description: 'Timeout in milliseconds (default: 60000)',
                },
                workdir: {
                    type: 'string',
                    description: 'Working directory for the command (defaults to current working directory)',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'search_history',
        description: 'Search your past task history for relevant context. Only searches user messages and assistant responses (not tool results). Returns formatted history snippets for context.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query - keywords or phrases to search for in history',
                },
                limit: {
                    type: 'string',
                    description: 'Maximum number of results to return (default: 5)',
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

export interface AskUserArgs {
    questions: string
    context?: string
}

export async function askUser(args: AskUserArgs): Promise<ToolResult> {
    const { questions, context } = args
    
    return {
        success: true,
        content: `${questions}\n\nContext:\n${context}`,
        requiresConfirmation: true,
    }
}

export const systemToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
    ask_user: async (args) => {
        const questionsStr = args.questions as string
        return askUser({ questions: questionsStr, context: args.context as string })
    },
    glob: async (args) => {
        const pattern = args.pattern as string
        const path = args.path as string | undefined

        try {
            const baseDir = path || process.cwd()
            const globPattern = pattern.startsWith('/') || pattern.includes(':')
                ? pattern
                : `${baseDir}/${pattern}`

            const matches = await glob(globPattern, { absolute: true })
            matches.sort()

            return {
                success: true,
                content: matches.length > 0
                    ? `Found ${matches.length} file(s):\n\n${matches.join('\n')}`
                    : 'No files found matching the pattern.',
            }
        } catch (error) {
            return {
                success: false,
                content: '',
                error: error instanceof Error ? error.message : 'Unknown error during glob search',
            }
        }
    },
    grep: async (args) => {
        const pattern = args.pattern as string
        const path = args.path as string | undefined
        const include = args.include as string | undefined
        const recursive = args.recursive !== 'false'

        try {
            const baseDir = path || process.cwd()
            const results: string[] = []
            const regex = new RegExp(pattern)

            const searchDir = async (dir: string, depth: number) => {
                if (recursive && depth > 50) return

                const entries = await glob('*', { cwd: dir, absolute: true })
                const dirs: string[] = []

                for (const entry of entries) {
                    const stat = await Bun.file(entry).stat()

                    if (stat.isDirectory()) {
                        if (recursive) {
                            dirs.push(entry)
                        }
                    } else if (stat.isFile()) {
                        if (include) {
                            const globPattern = include.startsWith('!')
                                ? include.slice(1)
                                : include
                            const globFiles = await glob(globPattern, { cwd: dir })
                            const matches = globFiles.some(f => entry.endsWith(f))
                            if (!matches && !include.startsWith('!')) {
                                continue
                            }
                        }

                        try {
                            const content = await Bun.file(entry).text()
                            const lines = content.split('\n')
                            lines.forEach((line, index) => {
                                if (regex.test(line)) {
                                    const relativePath = entry.replace(baseDir + '/', '')
                                    results.push(`${relativePath}:${index + 1}: ${line.trim()}`)
                                }
                            })
                        } catch {
                        }
                    }
                }

                for (const dirEntry of dirs) {
                    await searchDir(dirEntry, depth + 1)
                }
            }

            await searchDir(baseDir, 0)

            return {
                success: true,
                content: results.length > 0
                    ? `Found ${results.length} match(es):\n\n${results.slice(0, 100).join('\n')}${results.length > 100 ? `\n... and ${results.length - 100} more` : ''}`
                    : 'No matches found.',
            }
        } catch (error) {
            return {
                success: false,
                content: '',
                error: error instanceof Error ? error.message : 'Unknown error during grep search',
            }
        }
    },
    bash: async (args) => {
        const command = args.command as string
        const workdir = args.workdir as string | undefined

        try {
            const childProcess = Bun.spawn({
                cmd: ['/bin/bash', '-c', command],
                cwd: workdir || process.cwd(),
                stdout: 'pipe',
                stderr: 'pipe',
                env: {
                    ...process.env,
                    PATH: process.env.PATH || '/usr/bin:/bin',
                },
            })

            const stdoutChunks: Uint8Array[] = []
            const stderrChunks: Uint8Array[] = []

            const readStream = async (stream: ReadableStream<Uint8Array>, chunks: Uint8Array[]) => {
                const reader = stream.getReader()
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    chunks.push(value)
                }
            }

            await Promise.all([
                readStream(childProcess.stdout!, stdoutChunks),
                readStream(childProcess.stderr!, stderrChunks),
            ])

            const stdout = new TextDecoder('utf-8').decode(stdoutChunks.length > 0 ? stdoutChunks.reduce((a, b) => new Uint8Array([...a, ...b])) : new Uint8Array())
            const stderr = new TextDecoder('utf-8').decode(stderrChunks.length > 0 ? stderrChunks.reduce((a, b) => new Uint8Array([...a, ...b])) : new Uint8Array())
            const exitCode = childProcess.exitCode
            const combinedOutput = [stdout, stderr].filter(Boolean).join('\n')

            if (exitCode !== 0) {
                return {
                    success: false,
                    content: combinedOutput,
                    error: `Command exited with code ${exitCode}`,
                }
            }

            return {
                success: true,
                content: combinedOutput.slice(0, 50000) || 'Command executed successfully (no output)',
            }
        } catch (error) {
            return {
                success: false,
                content: '',
                error: error instanceof Error ? error.message : 'Unknown error executing command',
            }
        }
    },
    search_history: async (args, userId?: string) => {
        const query = args.query as string
        const limit = args.limit ? parseInt(args.limit as string, 10) : 5

        if (!userId) {
            return {
                success: false,
                content: '',
                error: 'userId is required for history search',
            }
        }

        try {
            const results = await searchTaskHistory(userId, query, limit)

            if (results.length === 0) {
                return {
                    success: true,
                    content: 'No relevant history found for the given query.',
                }
            }

            const formatted = results.map((r) => {
                const date = new Date(r.timestamp).toLocaleString()
                const roleLabel = r.role === 'user' ? 'user' : 'assistant'
                return `## Task: ${r.taskRecordId.slice(0, 8)}... @ ${date}\n**Role:** ${roleLabel}\n${r.content}`
            }).join('\n\n---\n\n')

            return {
                success: true,
                content: `=== RELATED HISTORY ===\n\n${formatted}\n\n===`,
            }
        } catch (error) {
            return {
                success: false,
                content: '',
                error: error instanceof Error ? error.message : 'Unknown error during history search',
            }
        }
    },
}
