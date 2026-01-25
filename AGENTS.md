# Loomos Project - AGENTS.md

## Project Overview

AI Agent API service built on Bun runtime with Hono framework. Implements intelligent agent system with LLM integration, native OpenAI tool calling, real-time task history tracking, and human-in-the-loop confirmation.

## Tech Stack

- **Runtime**: Bun
- **Web Framework**: Hono (^4.11.5)
- **Language**: TypeScript (strict mode)
- **Package Manager**: Bun
- **Database**: Prisma with SQLite (default, supports PostgreSQL)

## Commands

```sh
# Install dependencies
bun install

# Development with hot reload
bun run dev

# Build for production (generates Prisma client + compiles TypeScript)
bun run build

# Start production server
bun run start

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
    currentIteration: number
    uncertaintyLevel: number
    requiresHumanConfirmation: boolean
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
        confirmAction: async (approved, alternativeInput) => { ... },
    }
}
```

- Private state via closures (not classes)
- Return readonly state snapshots via `getState`
- Reset state cleanly between runs
- Support human-in-the-loop confirmation via `confirmAction`

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
├── index.ts              # Hono app, route config, middleware, worker pool startup
├── agent/
│   ├── index.ts          # Agent factory (createAgent) with thinking mode support
│   ├── client.ts         # LLM client (createLLMClient) with streaming support
│   ├── config.ts         # Environment config (getAgentConfig, config)
│   ├── prompt.ts         # System prompt templates (with/without thinking)
│   ├── types.ts          # TypeScript interfaces/enums (AgentStatus, MessageRole, etc.)
│   ├── routes.ts         # Agent API endpoints (/run, /confirm, /state, /tools)
│   └── tools/
│       ├── index.ts      # Tool registry, validation, OpenAI format conversion
│       └── web.ts        # Web tools (web_fetch, web_search)
├── database/
│   ├── db.ts             # Prisma client re-exports
│   ├── task-queue.ts     # TaskQueue CRUD, task claiming with locking, stats
│   └── task-record.ts    # TaskRecord persistence, history management
└── queue/
    ├── routes.ts         # Queue API endpoints (/tasks/:id, /stats)
    └── worker-pool.ts    # Background task workers, concurrency control, stale task recovery
```

### Key Patterns

- **Agent**: Closure-based factory with `{ run, getState, confirmAction }`, supports `thinkingMode` and progress callbacks
- **LLM Client**: Functional factory with optional config overrides, supports streaming via `streamChat`
- **Tools**: Static definitions with handler registry, converted to OpenAI tool format automatically
- **Routes**: Hono chainable API with inline handlers
- **Database**: TaskRecord with unified TaskHistory (role/content/iteration/timestamp), TaskQueue with priority and worker tracking
- **Worker Pool**: Background processing with configurable concurrency, SQLite/PostgreSQL optimizations, stale task recovery

## Data Models

### TaskRecord

Main entity representing a task with its status, confirmation state, and full history.

### TaskHistory

Unified history entries with role and content fields:

- `role`: Entry type (`'user' | 'assistant' | 'tool' | 'system'`)
- `content`: Message/content for this entry
- `iteration`: Optional, only for assistant/tool entries
- `timestamp`: Recorded via `createdAt` in database
- Ordered by `createdAt` to reconstruct conversation

### TaskQueue

Queue management for background task processing:

- `status`: Task lifecycle state (`pending` | `processing` | `completed` | `failed`)
- `priority`: Execution priority (higher = processed first)
- `workerId`: ID of worker processing the task
- `attempts`: Number of processing attempts
- `maxAttempts`: Maximum retry attempts (default: 3)
- Indexed for efficient pending task discovery

## API Endpoints

```
GET  /                    # Health check
POST /agent/run           # Queue a new agent task
POST /agent/confirm       # Confirm or reject pending action
GET  /agent/state         # Get task state from database or memory
GET  /agent/tools         # List available tools in OpenAI format
GET  /queue/tasks/:id     # Get task queue status
GET  /queue/stats         # Get queue statistics (pending/processing/completed/failed)
```

## Configuration

Environment variables via `.env` files (managed by @dotenvx/dotenvx):

- `OPENAI_API_KEY` - Required LLM API key
- `OPENAI_BASE_URL` - LLM endpoint (default: <https://api.openai.com/v1>)
- `OPENAI_MODEL` - Model name (default: gpt-4o)
- `AGENT_TIMEOUT` - Request timeout ms (default: 60000)
- `AGENT_MAX_ITERATIONS` - Max iterations (default: 20)
- `AGENT_UNCERTAINTY_THRESHOLD` - Confirmation threshold (default: 0.5)
- `DATABASE_URL` - Database connection (default: file:./dev.db)
- `DATABASE_PROVIDER` - Database type: `sqlite` or `postgresql` (auto-detected from DATABASE_URL)

## Agent Features

### Thinking Modes

- **`auto`**: Agent uses ReAct pattern with `<thought>` tags for reasoning
- **`enabled`**: Explicit thinking mode with reasoning content in responses
- **`disabled`**: Direct execution without reasoning output

### Human-in-the-Loop

Agent automatically detects uncertainty and requests confirmation when:

- Ambiguous requirements detected
- Confidence below 70%
- High-risk actions (data loss, irreversible changes)
- Ethical concerns
- Missing critical information
- Unexpected results

### Tool Calling

Native OpenAI tool calling support with:

- Automatic argument validation
- Tool registry with static definitions
- Handler-based execution
- Web fetch and search tools built-in
- Extensible tool system

### Real-time History Tracking

- Progress callbacks for streaming history updates
- Database persistence of all history entries
- Support for task resumption with history context
- Iteration tracking per assistant/tool entry
