import { Hono } from 'hono'
import { queueApp } from './queue/routes'
import { agentApp } from './agent/routes'
import { workerPool } from './queue/worker-pool'

const app = new Hono()

app.route('/queue', queueApp)
app.route('/agent', agentApp)

// Health check
app.get('/', (c) => {
    return c.text('Loomos Agent API - Use /agent/* or /queue/* endpoints')
})

workerPool.start().catch(console.error)

export default app
