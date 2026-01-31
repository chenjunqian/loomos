declare module 'bun:child_process' {
    interface SpawnOptions {
        env?: Record<string, string>
        stdio?: ('pipe' | 'ignore' | 'inherit')[] | ('pipe' | 'ignore' | 'inherit')
    }

    export function spawn(command: string, args?: string[], options?: SpawnOptions): unknown
}
