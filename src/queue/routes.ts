import { Hono } from 'hono'
import { getTaskById, getTaskStats } from '../database/task-queue.js'

export const queueApp = new Hono()

queueApp.get('/tasks/:id', async (c) => {
    const id = c.req.param('id')
    const task = await getTaskById(id)

    if (!task) {
        return c.json({ error: 'Task not found' }, 404)
    }

    return c.json(task)
})

queueApp.get('/stats', async (c) => {
    const stats = await getTaskStats()
    return c.json(stats)
})
