import { prisma } from './task-queue'
import { User, UserAccount } from '@prisma/client'

export async function getOrCreateUserByAccount(
    provider: string,
    providerId: string,
    details?: { email?: string; name?: string; username?: string }
): Promise<{ user: User; account: UserAccount }> {
    // 1. Try to find the account first
    let account = await prisma.userAccount.findUnique({
        where: {
            provider_providerId: {
                provider,
                providerId,
            },
        },
        include: { user: true },
    })

    if (account) {
        // Update username if provided and changed
        if (details?.username && account.username !== details.username) {
            account = await prisma.userAccount.update({
                where: { id: account.id },
                data: { username: details.username },
                include: { user: true },
            })
        }
        return { user: account.user, account }
    }

    // 2. If email provided, check if user exists to bind
    let user: User | null = null
    if (details?.email) {
        user = await prisma.user.findUnique({
            where: { email: details.email },
        })
    }

    // 3. Create user if not found
    if (!user) {
        user = await prisma.user.create({
            data: {
                email: details?.email || null,
                name: details?.name || null,
            },
        })
    }

    // 4. Create account linked to user
    account = await prisma.userAccount.create({
        data: {
            userId: user.id,
            provider,
            providerId,
            username: details?.username || null,
        },
        include: { user: true },
    })

    return { user, account }
}

export async function bindAccountToEmail(
    provider: string,
    providerId: string,
    email: string
): Promise<{ user: User; account: UserAccount }> {
    const existingUser = await prisma.user.findUnique({
        where: { email },
    })

    if (!existingUser) {
        throw new Error(`User with email ${email} not found`)
    }

    const account = await prisma.userAccount.findUnique({
        where: {
            provider_providerId: {
                provider,
                providerId,
            },
        },
    })

    if (!account) {
        // Create new account for existing user
        const newAccount = await prisma.userAccount.create({
            data: {
                userId: existingUser.id,
                provider,
                providerId,
            },
            include: { user: true },
        })
        return { user: existingUser, account: newAccount }
    }

    if (account.userId === existingUser.id) {
        const user = await prisma.user.findUnique({ where: { id: account.userId } })
        return { user: user!, account }
    }

    // Move account to the new user (Binding)
    const updatedAccount = await prisma.userAccount.update({
        where: { id: account.id },
        data: { userId: existingUser.id },
        include: { user: true },
    })

    return { user: existingUser, account: updatedAccount }
}

export async function getUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
        where: { email },
        include: { accounts: true },
    })
}
