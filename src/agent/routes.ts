import { Hono } from 'hono'
import { availableTools } from './index.js'
import { getTaskRecord, saveTaskRecord } from '../database/task-record.js'
import { createTask, getPendingTasks, completeTask, prisma } from '../database/task-queue.js'
import { AgentInput, AgentStatus } from './types.js'

export const agentApp = new Hono()

agentApp.post('/run', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        if (!body.task) {
            return c.json({ error: 'task is required' }, 400)
        }

        const taskId = body.taskId || crypto.randomUUID()
        const userId = body.userId || 'default'

        const existingRecord = await getTaskRecord(userId, taskId)

        if (existingRecord) {
            await saveTaskRecord({
                id: taskId,
                userId,
                task: body.task,
                context: body.context,
                status: AgentStatus.Idle,
            })
        } else {
            await saveTaskRecord({
                id: taskId,
                userId,
                task: body.task,
                context: body.context,
                status: AgentStatus.Idle,
            })
        }

        await createTask({
            userId,
            taskRecordId: taskId,
            priority: 0,
        })

        const pendingCount = (await getPendingTasks()).length

        return c.json({
            taskId,
            userId,
            status: 'queued',
            position: pendingCount,
            message: 'Task has been queued for processing',
        })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

agentApp.post('/confirm', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        const { approved, alternativeInput } = body

        if (!body.userId || !body.taskId) {
            return c.json({ error: 'userId and taskId are required' }, 400)
        }

        const taskId = body.taskId
        const userId = body.userId

        const existingRecord = await getTaskRecord(userId, taskId)

        if (!existingRecord) {
            return c.json({ error: 'Task record not found' }, 404)
        }

        const taskDescription = body.task || existingRecord.task

        if (approved === false) {
            const previousQueue = await prisma.taskQueue.findFirst({
                where: {
                    userId,
                    taskRecordId: taskId,
                    status: 'processing',
                },
                orderBy: { createdAt: 'desc' },
            })

            if (previousQueue) {
                await completeTask(previousQueue.id, false, 'Rejected by user')
            }
        }

        await saveTaskRecord({
            id: taskId,
            userId,
            task: taskDescription,
            context: body.context,
            status: AgentStatus.Idle,
        })

        await createTask({
            userId,
            taskRecordId: taskId,
            priority: 1,
        })

        const pendingCount = (await getPendingTasks()).length

        return c.json({
            taskId,
            userId,
            status: 'queued',
            position: pendingCount,
            approved,
            message: 'Confirmation has been queued for processing',
        })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

agentApp.get('/state', async (c) => {
    const userId = c.req.query('userId')
    const taskId = c.req.query('taskId')

    if (!userId || !taskId) {
        return c.json({ error: 'userId and taskId are required as query parameters' }, 400)
    }

    const record = await getTaskRecord(userId, taskId)

    if (record) {
        return c.json({
            source: 'database',
            record
        })
    }

    return c.json({
        source: 'memory',
        status: 'idle',
        message: 'No task record found in database',
        userId,
        taskId
    })
})

agentApp.get('/tools', (c) => {
    return c.json(availableTools)
})
