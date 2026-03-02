# Loomos

A generic AI agent for daily life. Built on Bun + Hono, it leverages Playwright MCP for browser automation and Find-Skill for capability discovery to complete your tasks. Run it locally or deploy to a server.

## Features

- 🧠 **Intelligent Reasoning** - Thinks step-by-step to solve complex tasks
- 🌐 **Browser Automation** - Uses Playwright MCP to interact with websites
- 🔍 **Skill Discovery** - Finds and applies relevant skills via Find-Skill
- 🤖 **Telegram Interface** - Interact with your agent remotely via a Telegram bot
- 🌉 **Task Gateway** - Unified task management across API and Telegram interfaces
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

# Confirm a pending action (Human-in-the-Loop)
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{"taskId": "{id}", "userId": "default", "approved": true}'

# Get task history
curl "http://localhost:3000/agent/history?taskId={id}&userId=default"
```

## Telegram Bot

To enable the Telegram bot:

1. Create a bot via [@BotFather](https://t.me/BotFather) and get your `TELEGRAM_BOT_TOKEN`.
2. Add the token to your `.env` file:

   ```env
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_ENABLED=true
   ```

3. Restart the server and message your bot!

**Commands:**

- `/start` - Welcome message
- `/status` - Check current task status
- `/cancel` - Cancel active task
- `/new` - Start a new conversation

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **Language**: TypeScript
- **Database**: Prisma with SQLite

## License

MIT
