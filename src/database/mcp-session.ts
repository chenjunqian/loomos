import { prisma } from './task-queue'

export interface StorageState {
    cookies?: Array<{
        name: string
        value: string
        domain: string
        path?: string
        expires?: number
        httpOnly?: boolean
        secure?: boolean
        sameSite?: string
    }>
    origins?: Array<{
        origin: string
        localStorage: Array<{
            name: string
            value: string
        }>
    }>
}

export async function saveUserSession(
    userId: string,
    storageState: StorageState
): Promise<void> {
    await prisma.userSession.upsert({
        where: { userId },
        update: {
            storageState: JSON.stringify(storageState),
            updatedAt: new Date(),
        },
        create: {
            userId,
            storageState: JSON.stringify(storageState),
        },
    })
}

export async function getUserSession(userId: string): Promise<StorageState | null> {
    const session = await prisma.userSession.findUnique({
        where: { userId },
    })

    if (!session) {
        return null
    }

    try {
        return JSON.parse(session.storageState) as StorageState
    } catch {
        console.error(`[MCP-Session] Failed to parse storage state for user: ${userId}`)
        return null
    }
}

export async function deleteUserSession(userId: string): Promise<void> {
    await prisma.userSession.delete({
        where: { userId },
    }).catch(() => {
        console.warn(`[MCP-Session] Session not found for user: ${userId}`)
    })
}

export async function cleanupStaleSessions(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs)
    const result = await prisma.userSession.deleteMany({
        where: {
            updatedAt: {
                lt: cutoff,
            },
        },
    })
    return result.count
}

export async function getSessionStats(): Promise<{
    totalSessions: number
    oldestSession: Date | null
    newestSession: Date | null
}> {
    const [total, oldest, newest] = await Promise.all([
        prisma.userSession.count(),
        prisma.userSession.findFirst({
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
        }),
        prisma.userSession.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true },
        }),
    ])

    return {
        totalSessions: total,
        oldestSession: oldest?.createdAt || null,
        newestSession: newest?.updatedAt || null,
    }
}
