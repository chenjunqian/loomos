import { Hono } from 'hono'
import { createTask, getTaskById, getTaskStats, TASK_STATUS } from '../database/task-queue.js'

export const queueApp = new Hono()

queueApp.post('/tasks', async (c) => {
    const body = await c.req.json()

    if (!body.task || !body.userId) {
        return c.json({ error: 'task and userId are required' }, 400)
    }

    const task = await createTask({
        task: body.task,
        userId: body.userId,
        priority: body.priority ?? 0,
        maxAttempts: body.maxAttempts ?? 3,
    })

    return c.json(task, 201)
})

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
