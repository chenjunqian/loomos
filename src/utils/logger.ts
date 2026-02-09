import pino from 'pino'
import { join } from 'path'

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const LOG_FILE_ENABLED = process.env.LOG_FILE_ENABLED === 'true'
const LOG_FILE = process.env.LOG_FILE || './logs/app.log'

type LogLevel = 'debug' | 'info' | 'error'

const getLogLevel = (): string => {
    const validLevels = ['debug', 'info', 'warn', 'error', 'fatal']
    const level = LOG_LEVEL.toLowerCase()
    return validLevels.includes(level) ? level : 'info'
}

const createTransport = () => {
    const targets: pino.TransportTargetOptions[] = [
        {
            level: getLogLevel(),
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        },
    ]

    if (LOG_FILE_ENABLED) {
        targets.push({
            level: getLogLevel(),
            target: 'pino-roll',
            options: {
                file: join(process.cwd(), LOG_FILE),
                size: '10m',
                count: 10,
                mkdir: true,
            },
        })
    }

    return pino.transport({ targets })
}

const baseLogger = pino(
    {
        level: LOG_LEVEL,
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    createTransport()
)

export const logger = {
    debug: (module: string, message: string, ...args: unknown[]): void => {
        baseLogger.debug({ module }, message, ...args)
    },

    info: (module: string, message: string, ...args: unknown[]): void => {
        baseLogger.info({ module }, message, ...args)
    },

    error: (module: string, message: string, ...args: unknown[]): void => {
        baseLogger.error({ module }, message, ...args)
    },
}

export type { LogLevel }