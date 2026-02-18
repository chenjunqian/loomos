import { Hono } from 'hono'
import {
    createScheduledJob,
    getScheduledJob,
    listScheduledJobs,
    updateScheduledJob,
    deleteScheduledJob,
    triggerScheduledJob,
    type CreateScheduledJobInput,
    type UpdateScheduledJobInput,
} from '../database/scheduled-job'

export const schedulerApp = new Hono()

schedulerApp.get('/jobs', async (c) => {
    try {
        const userId = c.req.query('userId') || 'default'
        const enabled = c.req.query('enabled')
        const includeDisabled = c.req.query('includeDisabled') === 'true'

        const jobs = await listScheduledJobs(userId, {
            enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
            includeDisabled,
        })

        return c.json({ jobs })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

schedulerApp.post('/jobs', async (c) => {
    try {
        const body = await c.req.json<CreateScheduledJobInput>()

        if (!body.name || !body.task) {
            return c.json({ error: 'name and task are required' }, 400)
        }

        if (!body.cronExpression && !body.runAt) {
            return c.json({ error: 'Either cronExpression or runAt must be provided' }, 400)
        }

        if (body.cronExpression && body.runAt) {
            return c.json({ error: 'Cannot specify both cronExpression and runAt' }, 400)
        }

        const userId = body.userId || 'default'
        const job = await createScheduledJob({
            ...body,
            userId,
        })

        return c.json({ job }, 201)
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

schedulerApp.get('/jobs/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const userId = c.req.query('userId') || 'default'

        const job = await getScheduledJob(id, userId)

        if (!job) {
            return c.json({ error: 'Scheduled job not found' }, 404)
        }

        return c.json({ job })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

schedulerApp.put('/jobs/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const userId = c.req.query('userId') || 'default'
        const body = await c.req.json<UpdateScheduledJobInput>()

        const job = await updateScheduledJob(id, userId, body)

        return c.json({ job })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

schedulerApp.delete('/jobs/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const userId = c.req.query('userId') || 'default'

        await deleteScheduledJob(id, userId)

        return c.json({ success: true })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

schedulerApp.post('/jobs/:id/run', async (c) => {
    try {
        const id = c.req.param('id')
        const userId = c.req.query('userId') || 'default'

        const job = await triggerScheduledJob(id, userId)

        return c.json({ job })
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})
