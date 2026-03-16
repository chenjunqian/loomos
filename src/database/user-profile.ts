import { prisma } from './task-queue'

export interface UserProfileData {
    userId: string
    name: string
    data: string
}

export async function getUserProfile(userId: string, name: string) {
    return await prisma.userProfile.findUnique({
        where: {
            userId_name: {
                userId,
                name,
            },
        },
    })
}

export async function upsertUserProfile(userId: string, name: string, data: string) {
    return await prisma.userProfile.upsert({
        where: {
            userId_name: {
                userId,
                name,
            },
        },
        update: {
            data,
        },
        create: {
            userId,
            name,
            data,
        },
    })
}

export async function deleteUserProfile(userId: string, name: string) {
    return await prisma.userProfile.delete({
        where: {
            userId_name: {
                userId,
                name,
            },
        },
    })
}
