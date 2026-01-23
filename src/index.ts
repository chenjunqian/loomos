import { Hono } from 'hono'
import { createAgent, availableTools } from './agent'
import { getTaskRecord } from './database/db'
import { AgentInput } from './agent/types'

const app = new Hono()

// Health check
app.get('/', (c) => {
    return c.text('Loomos Agent API - Use /agent/* endpoints')
})

// Run an agent task
app.post('/agent/run', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        if (!body.task) {
            return c.json({ error: 'task is required' }, 400)
        }

        const taskId = body.taskId || crypto.randomUUID()
        const userId = body.userId || 'default'

        const agent = createAgent({ ...body, taskId, userId })
        const result = await agent.run(body)

        return c.json({
            ...result,
            taskId,
            userId
        })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

// Confirm or reject an uncertain action
app.post('/agent/confirm', async (c) => {
    try {
        const body = await c.req.json<AgentInput>()
        const { approved, alternativeInput } = body
        const agent = createAgent(body)
        const state = agent.getState()

        if (!state.requiresHumanConfirmation) {
            return c.json({ error: 'No pending confirmation' }, 400)
        }

        const result = await agent.confirmAction(approved || false, alternativeInput)
        return c.json(result)
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

// Get current agent state
app.get('/agent/state', async (c) => {
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

// List available tools
app.get('/agent/tools', (c) => {
    return c.json(availableTools)
})

export default app
