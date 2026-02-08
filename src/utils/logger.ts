const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

const LEVELS = {
    debug: 0,
    info: 1,
    error: 2,
} as const

type LogLevel = keyof typeof LEVELS

const shouldLog = (level: LogLevel): boolean => {
    const configuredLevel = LEVELS[LOG_LEVEL as LogLevel]
    return LEVELS[level] >= (configuredLevel !== undefined ? configuredLevel : LEVELS.info)
}

const formatMessage = (level: string, module: string, message: string): string => {
    const timestamp = new Date().toISOString()
    return `[${level.toUpperCase()}] [${timestamp}] ${module}: ${message}`
}

export const logger = {
    debug: (module: string, message: string, ...args: unknown[]): void => {
        if (shouldLog('debug')) {
            console.log(formatMessage('debug', module, message), ...args)
        }
    },

    info: (module: string, message: string, ...args: unknown[]): void => {
        if (shouldLog('info')) {
            console.log(formatMessage('info', module, message), ...args)
        }
    },

    error: (module: string, message: string, ...args: unknown[]): void => {
        if (shouldLog('error')) {
            console.error(formatMessage('error', module, message), ...args)
        }
    },
}

export type { LogLevel }
