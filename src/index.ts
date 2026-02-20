import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { queueApp } from './routes/queue'
import { agentApp } from './routes/agent'
import { skillsRoutes } from './routes/skills'
import { schedulerApp } from './routes/scheduler'
import { workerPool } from './queue/worker-pool'
import { startScheduler, stopScheduler } from './scheduler/scheduler'

const app = new Hono()

app.use('*', logger())
app.route('/queue', queueApp)
app.route('/agent', agentApp)
app.route('/agent', skillsRoutes)
app.route('/scheduler', schedulerApp)

// Health check
app.get('/', (c) => {
    return c.text('Loomos Agent API - Use /agent/*, /queue/*, or /scheduler/* endpoints')
})

workerPool.start().catch((error) => {
    console.error('[Server] Failed to start worker pool:', error)
})

startScheduler().catch((error) => {
    console.error('[Server] Failed to start scheduler:', error)
})

const gracefulShutdown = async () => {
    console.log('[Server] Shutting down...')
    await stopScheduler()
    await workerPool.stop()
    process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

export default app
