import { Hono } from 'hono'
import { availableTools } from '../agent/index.js'
import { createTask, getTask, getTaskHistory, confirmTask } from '../agent/gateway.js'
import { AgentInput, MessageRole } from '../agent/types.js'

export const agentApp = new Hono()

agentApp.post('/run', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        if (!body.task) {
            return c.json({ error: 'task is required' }, 400)
        }

        const userId = body.userId || 'default'
        const result = await createTask(userId, body.task, {
            taskId: body.taskId,
            thinkingMode: body.thinkingMode,
            maxIterations: body.maxIterations,
            apiKey: body.apiKey,
            baseUrl: body.baseUrl,
            model: body.model,
            activeSkills: body.activeSkills,
        })

        return c.json(result)
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
        const approved = body.approved

        if (!body.userId || !body.taskId) {
            return c.json({ error: 'userId and taskId are required' }, 400)
        }

        if (approved === undefined) {
            return c.json({ error: 'approved is required' }, 400)
        }

        const result = await confirmTask(body.userId, body.taskId, approved, body.alternativeInput)

        return c.json({
            ...result,
            approved,
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'Task record not found') {
            return c.json({ error: 'Task record not found' }, 404)
        }
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

    const record = await getTask(taskId, userId)

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

    const history = await getTaskHistory(taskId, userId, role as MessageRole | undefined)

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
