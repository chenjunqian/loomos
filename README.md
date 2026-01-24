# Loomos

Your AI assistant for daily life. A server-side agent API that helps with everyday tasks like reminders, scheduling, travel advice, research, and decision-making.

## Features

- 🧠 **Intelligent Reasoning** - Thinks step-by-step to solve complex tasks
- 🌐 **Web Search & Fetch** - Gathers real-time information from the web
- ✅ **Human-in-the-Loop** - Confirms with you before taking important actions
- ⚡ **Background Processing** - Handles tasks asynchronously with a worker queue
- 💾 **Task Persistence** - Saves conversation history and task state

## Use Cases

- **Reminders & Scheduling** - Set up reminders and manage your calendar
- **Travel Advice** - Get destination info, weather, and planning tips
- **Research** - Search and summarize information from multiple sources
- **Daily Decisions** - Get recommendations with human oversight for important choices

## Quick Start

```sh
# Install dependencies
bun install

# Run development server
bun run dev
```

Open <http://localhost:3000>

## API

```bash
# Run a task
curl -X POST http://localhost:3000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "What is the weather in Tokyo tomorrow?"}'

# Check task status
curl http://localhost:3000/queue/tasks/{id}
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **Language**: TypeScript
- **Database**: Prisma with SQLite

## License

MIT
