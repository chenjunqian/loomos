# Loomos Project - AGENTS.md

## Project Overview

AI Agent API service built on Bun runtime with Hono framework. Implements intelligent agent system with LLM integration, tool calling, and human-in-the-loop confirmation.

## Tech Stack

- **Runtime**: Bun
- **Web Framework**: Hono (^4.11.5)
- **Language**: TypeScript (strict mode)
- **Package Manager**: Bun
- **Database**: Prisma with SQLite (default)

## Commands

```sh
# Install dependencies
bun install

# Development with hot reload
bun run dev

# Build for production
bun run build

# Start production server
bun run start

# Add test framework
bun add -D bun-test

# Run all tests
bun test

# Run single test file
bun test src/agent/client.test.ts

# Run tests matching pattern
bun test --match "tool validation"

# Push schema changes to database
npx prisma db push

# Generate Prisma client
npx prisma generate
```

## Code Style Guidelines

### Imports

```typescript
// Single-line imports, grouped by source
import { Hono } from 'hono'
import { createAgent, availableTools } from './agent'
import { getTaskRecord } from '../database/task-record'
```

- One import per line
- Group: external packages → relative paths
- Use named exports exclusively

### Types

```typescript
// Use interfaces for objects
interface AgentState {
    status: AgentStatus
    messages: Message[]
    history: AgentHistoryEntry[]
}

// Use enums for fixed values
export enum MessageRole {
    System = 'system',
    User = 'user',
    Assistant = 'assistant',
    Tool = 'tool',
}

// Use type aliases for unions
export type ThinkingMode = 'auto' | 'enabled' | 'disabled'
```

### Naming

- **Interfaces/Enums**: `PascalCase` (e.g., `AgentState`, `MessageRole`)
- **Functions/Variables**: `camelCase` (e.g., `createAgent`, `state`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `config`, `SYSTEM_PROMPT_WITH_THINKING`)
- **Files**: `kebab-case.ts` (e.g., `agent-state.ts`)

### Formatting

- 4-space indentation (no tabs)
- No comments unless explicitly requested
- No trailing whitespace
- Max line length: 120 characters

### Error Handling

```typescript
try {
    const result = await handler(args)
    return result
} catch (error) {
    return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
    }
}

// API errors return proper HTTP status codes
return c.json({ error: 'task is required' }, 400)
```

- Always use try-catch for async operations
- Check `error instanceof Error` before accessing message
- Provide descriptive error messages
- API endpoints return appropriate status codes

### State Management

```typescript
// Use closures for private state encapsulation
function createAgent(input?: AgentInput): Agent {
    let state: AgentState = { ... }
    const resetState = (): void => { ... }

    return {
        run: async (input) => { ... },
        getState: () => ({ ...state }),
    }
}
```

- Private state via closures (not classes)
- Return readonly state snapshots via `getState`
- Reset state cleanly between runs

### Functional Patterns

```typescript
// Factory functions with dependency injection
function createLLMClient(overrides?: LLMClientConfig) {
    const baseUrl = overrides?.baseUrl || config.baseUrl
    // ... return client interface
}

// Object shorthand for consistent interfaces
return {
    run,
    getState,
    confirmAction,
}
```

## Architecture

```
src/
├── index.ts              # Hono app, route config, middleware
├── agent/
│   ├── index.ts          # Agent factory (createAgent)
│   ├── client.ts         # LLM client (createLLMClient)
│   ├── config.ts         # Environment config (getAgentConfig)
│   ├── prompt.ts         # System prompt templates
│   ├── types.ts          # TypeScript interfaces/enums
│   ├── routes.ts         # Agent API endpoints
│   └── tools/
│       ├── index.ts      # Tool registry, validation
│       └── web.ts        # Web tools (fetch)
├── database/
│   ├── db.ts             # Prisma client singleton
│   ├── task-queue.ts     # TaskQueue CRUD operations
│   └── task-record.ts    # TaskRecord persistence
└── queue/
    ├── routes.ts         # Queue API endpoints
    └── worker-pool.ts    # Background task workers
```

### Key Patterns

- **Agent**: Closure-based factory returning `{ run, getState, confirmAction }`
- **LLM Client**: Functional factory with optional config overrides
- **Tools**: Static definitions with separate handler registry
- **Routes**: Hono chainable API with inline handlers
- **Database**: TaskRecord with unified TaskHistory (role/content fields)

## Data Models

### TaskRecord

Main entity representing a task with its status, response, and history.

### TaskHistory

Unified history entries with role and content fields:

- `role`: Entry type (`'user' | 'assistant' | 'tool'`)
- `content`: Message/content for this entry
- `iteration`: Optional, only for assistant entries
- Ordered by `createdAt` to reconstruct conversation

### TaskQueue

Queue management for background task processing with worker support.

## API Endpoints

```
GET  /                    # Health check
POST /agent/run           # Run agent task
POST /agent/confirm       # Confirm uncertain action
GET  /agent/state         # Get agent state
GET  /agent/tools         # List available tools
GET  /queue/tasks/:id     # Get task status
GET  /queue/stats         # Get queue statistics
```

## Configuration

Environment variables via `.env` files (managed by @dotenvx/dotenvx):

- `OPENAI_API_KEY` - Required LLM API key
- `OPENAI_BASE_URL` - LLM endpoint (default: OpenAI)
- `OPENAI_MODEL` - Model name (default: gpt-4o)
- `AGENT_TIMEOUT` - Request timeout ms (default: 60000)
- `AGENT_MAX_ITERATIONS` - Max iterations (default: 20)
- `AGENT_UNCERTAINTY_THRESHOLD` - Confirmation threshold (default: 0.5)
- `DATABASE_URL` - SQLite database path (default: file:./dev.db)
