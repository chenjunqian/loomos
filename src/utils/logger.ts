const LOG_LEVEL = process.env.LOG_LEVEL || 'info'
const LOG_FILE_ENABLED = process.env.LOG_FILE_ENABLED === 'true'
const LOG_FILE = process.env.LOG_FILE || './logs/app.log'
const LOG_FILE_MAX_SIZE = parseInt(process.env.LOG_FILE_MAX_SIZE || '10485760', 10)
const LOG_FILE_MAX_BACKUPS = parseInt(process.env.LOG_FILE_MAX_BACKUPS || '5', 10)

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

const ensureLogDirectory = async (): Promise<void> => {
    const dir = LOG_FILE.substring(0, LOG_FILE.lastIndexOf('/'))
    try {
        await Bun.spawn({ cmd: ['mkdir', '-p', dir] })
    } catch {
    }
}

const rotateLogFile = async (): Promise<void> => {
    try {
        const file = Bun.file(LOG_FILE)
        const stat = await file.size
        if (stat < LOG_FILE_MAX_SIZE) {
            return
        }
    } catch {
        return
    }

    for (let i = LOG_FILE_MAX_BACKUPS - 1; i >= 1; i--) {
        const oldPath = `${LOG_FILE}.${i}`
        const newPath = `${LOG_FILE}.${i + 1}`
        try {
            const oldFile = Bun.file(oldPath)
            if (await oldFile.exists()) {
                await Bun.write(Bun.file(newPath), await oldFile.text())
                await Bun.write(Bun.file(oldPath), '')
            }
        } catch {
        }
    }

    try {
        await Bun.write(Bun.file(`${LOG_FILE}.1`), await Bun.file(LOG_FILE).text())
        await Bun.write(Bun.file(LOG_FILE), '')
    } catch {
    }
}

const writeToFile = async (formattedMessage: string): Promise<void> => {
    if (!LOG_FILE_ENABLED) {
        return
    }

    await ensureLogDirectory()
    await rotateLogFile()

    try {
        const file = Bun.file(LOG_FILE)
        const existing = await file.text()
        await Bun.write(file, existing + formattedMessage + '\n')
    } catch {
    }
}

export const logger = {
    debug: async (module: string, message: string, ...args: unknown[]): Promise<void> => {
        if (shouldLog('debug')) {
            const formatted = formatMessage('debug', module, message)
            console.log(formatted, ...args)
            await writeToFile(formatted)
        }
    },

    info: async (module: string, message: string, ...args: unknown[]): Promise<void> => {
        if (shouldLog('info')) {
            const formatted = formatMessage('info', module, message)
            console.log(formatted, ...args)
            await writeToFile(formatted)
        }
    },

    error: async (module: string, message: string, ...args: unknown[]): Promise<void> => {
        if (shouldLog('error')) {
            const formatted = formatMessage('error', module, message)
            console.error(formatted, ...args)
            await writeToFile(formatted)
        }
    },
}

export type { LogLevel }
