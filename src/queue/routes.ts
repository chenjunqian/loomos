import { Hono } from 'hono'
import { getTaskById, getTaskStats } from '../database/task-queue.js'

export const queueApp = new Hono()

queueApp.get('/tasks/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const task = await getTaskById(id)

        if (!task) {
            return c.json({ error: 'Task not found' }, 404)
        }

        return c.json(task)
    } catch (error) {
        const requestId = c.get('requestId' as never)
        console.error(`[Queue] [RequestID: ${requestId ?? 'unknown'}] Error in /tasks/:id:`, error)
        return c.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            500
        )
    }
})

queueApp.get('/stats', async (c) => {
    const stats = await getTaskStats()
    return c.json(stats)
})
