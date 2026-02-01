import { Hono } from 'hono'
import { availableTools } from './index.js'
import { getTaskRecord, saveTaskRecord, getTaskHistory } from '../database/task-record.js'
import { createTaskForQueue, completeTask, prisma, TASK_STATUS } from '../database/task-queue.js'
import { AgentInput, AgentStatus, MessageRole } from './types.js'

export const agentApp = new Hono()

agentApp.post('/run', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        if (!body.task) {
            return c.json({ error: 'task is required' }, 400)
        }

        const taskId = body.taskId || crypto.randomUUID()
        const userId = body.userId || 'default'

        await saveTaskRecord({
            id: taskId,
            userId,
            taskContent: body.task,
            role: MessageRole.User,
            status: AgentStatus.Idle,
        })

        await createTaskForQueue({
            userId,
            taskRecordId: taskId,
            priority: 0,
        })

        return c.json({
            taskId,
            userId,
            status: 'queued',
            message: 'Task has been queued for processing',
        })
    } catch (error) {
        console.error(`[Agent] Error in /run:`, error)
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

agentApp.post('/confirm', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        const { approved } = body

        if (!body.userId || !body.taskId) {
            return c.json({ error: 'userId and taskId are required' }, 400)
        }

        const taskId = body.taskId
        const userId = body.userId

        const existingRecord = await getTaskRecord(userId, taskId)

        if (!existingRecord) {
            return c.json({ error: 'Task record not found' }, 404)
        }

        const task = body.task

        if (approved === false) {
            const previousQueue = await prisma.taskQueue.findFirst({
                where: {
                    userId,
                    taskRecordId: taskId,
                    status: TASK_STATUS.PROCESSING,
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
            taskContent: task,
            role: MessageRole.User,
            status: AgentStatus.Idle,
        })

        await createTaskForQueue({
            userId,
            taskRecordId: taskId,
            priority: 1,
        })

        return c.json({
            taskId,
            userId,
            status: TASK_STATUS.PENDING,
            approved,
            message: 'Confirmation has been queued for processing',
        })
    } catch (error) {
        console.error(`[Agent] Error in /confirm:`, error)
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

agentApp.get('/history', async (c) => {
    const userId = c.req.query('userId')
    const taskId = c.req.query('taskId')
    const role = c.req.query('role')

    if (!userId || !taskId) {
        return c.json({ error: 'userId and taskId are required as query parameters' }, 400)
    }

    const history = await getTaskHistory(userId, taskId, role as MessageRole | undefined)

    return c.json({
        userId,
        taskId,
        role: role || null,
        history,
    })
})

agentApp.get('/tools', async (c) => {
    const allTools = await availableTools()
    return c.json(allTools)
})
