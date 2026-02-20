# Loomos

A generic AI agent for daily life. Built on Bun + Hono, it leverages Playwright MCP for browser automation and Find-Skill for capability discovery to complete your tasks. Run it locally or deploy to a server.

## Features

- 🧠 **Intelligent Reasoning** - Thinks step-by-step to solve complex tasks
- 🌐 **Browser Automation** - Uses Playwright MCP to interact with websites
- 🔍 **Skill Discovery** - Finds and applies relevant skills via Find-Skill
- ✅ **Human-in-the-Loop** - Confirms with you before taking important actions
- ⚡ **Background Processing** - Handles tasks asynchronously with a worker queue
- 💾 **Task Persistence** - Saves conversation history and task state

## Use Cases

- **Web Automation** - Browse websites, fill forms, extract data
- **Research** - Search, gather, and summarize information
- **Content Creation** - Generate and publish content online
- **Daily Tasks** - Any task you can do in a browser

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
