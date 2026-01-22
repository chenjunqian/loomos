import { Hono } from 'hono'
import { createAgent, availableTools } from './agent'
import { AgentInput, AgentOutput } from './agent/types'

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

        const agent = createAgent()
        const result = await agent.run(body)

        return c.json(result)
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
        const { approved, alternativeInput } = await c.req.json()
        const agent = createAgent()
        const state = agent.getState()

        if (!state.requiresHumanConfirmation) {
            return c.json({ error: 'No pending confirmation' }, 400)
        }

        const result = await agent.confirmAction(approved, alternativeInput)
        return c.json(result)
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

// Get current agent state
app.get('/agent/state', (c) => {
    const agent = createAgent()
    return c.json(agent.getState())
})

// List available tools
app.get('/agent/tools', (c) => {
    return c.json(availableTools)
})

export default app
