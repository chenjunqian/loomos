# Loomos Project - AGENTS.md

## Project Overview

AI Agent API service built on Bun runtime with Hono framework. Implements intelligent agent system with LLM integration, native OpenAI/MCP tool calling, Anthropic Agent Skills support, real-time task history tracking, and human-in-the-loop confirmation. Features user-isolated MCP sessions with Playwright storage state persistence.

## Tech Stack

- **Runtime**: Bun
- **Web Framework**: Hono (^4.11.5)
- **Language**: TypeScript (strict mode)
- **Package Manager**: Bun
- **Database**: Prisma with SQLite (default, supports PostgreSQL)
- **MCP SDK**: @modelcontextprotocol/sdk (^1.25.3)
- **Skills Format**: YAML frontmatter + Markdown
- **Logging**: Pino with rotating file support

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
├── routes/
│   ├── agent.ts         # Agent API endpoints (/run, /confirm, /state, /tools, /history)
│   ├── queue.ts         # Queue API endpoints (/tasks/:id, /stats)
│   ├── scheduler.ts     # Scheduler API endpoints
│   └── skills.ts        # Skill API endpoints (/skills, /skills/:name, /skills/:name/bundle, /skills/:name/file/*)
├── utils/
│   └── logger.ts         # Pino-based structured logging with file rotation
├── agent/
│   ├── index.ts          # Agent factory (createAgent) with thinking mode support
│   ├── client.ts         # LLM client (createLLMClient) with streaming support
│   ├── config.ts         # Environment config (getAgentConfig, config)
│   ├── prompt.ts         # System prompt templates (with/without thinking)
│   ├── types.ts          # TypeScript interfaces/enums (AgentStatus, MessageRole, etc.)
│   ├── gateway.ts        # Task operations (createTask, getTask, confirmTask, getTasksByUser, getTaskHistory, stopTask)
│   ├── mcp/
│   │   ├── index.ts      # MCP module exports (client, adapter, config)
│   │   ├── client.ts     # MCP client factory (shared & user-isolated), HTTP/SSE transport
│   │   ├── adapter.ts     # MCP tool to OpenAI tool format conversion
│   │   └── config.ts      # MCP server configurations (filesystem, playwright)
│   ├── skills/
│   │   ├── index.ts      # Skill loader with YAML frontmatter parsing
│   └── tools/
│       ├── index.ts      # Tool registry, MCP tool integration, handler dispatch
│       └── system-tool.ts # Built-in system tools (read_file, search_file_content, etc.)
├── types/
│   └── bun.d.ts          # Bun type definitions
├── database/
│   ├── db.ts             # Prisma client re-exports
│   ├── task-queue.ts     # TaskQueue CRUD, task claiming with locking, stats
│   ├── task-record.ts    # TaskRecord persistence, history management
│   └── mcp-session.ts    # User session persistence for Playwright storage state
└── queue/
    └── worker-pool.ts    # Background task workers, concurrency control, stale task recovery
└── scheduler/
    └── scheduler.ts      # Task scheduler for periodic/cron jobs
```

### Key Patterns

- **Agent**: Closure-based factory with `{ run, getState, confirmAction }`, supports `thinkingMode` and progress callbacks, `activeSkills` for skill activation
- **Gateway**: Task operations module with functions for creating, retrieving, confirming, and stopping tasks; manages TaskRecord and TaskQueue coordination
- **LLM Client**: Functional factory with optional config overrides, supports streaming via `streamChat`
- **MCP Client**: Dual-mode (shared & user-isolated) with session state persistence, HTTP/SSE transport support
- **Tools**: Unified system (system tools + MCP tools), auto-converted to OpenAI format
- **Skills**: YAML frontmatter + Markdown definitions with allowed-tools scoping, skill activation at runtime
- **Routes**: Hono chainable API with inline handlers
- **Database**: TaskRecord with unified TaskHistory, TaskQueue with priority/worker tracking, UserSession for MCP state
- **Logging**: Pino-based structured logging with file rotation support

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
- Indexed by taskRecordId + createdAt and taskRecordId + role for efficient queries

### TaskQueue

Queue management for background task processing:

- `id`: Unique task identifier (UUID)
- `userId`: User identifier for task isolation
- `taskRecordId`: Reference to associated TaskRecord
- `status`: Task lifecycle state (`pending` | `processing` | `completed` | `failed`)
- `priority`: Execution priority (higher = processed first)
- `workerId`: ID of worker processing the task
- `attempts`: Number of processing attempts
- `maxAttempts`: Maximum retry attempts (default: 3)
- Indexed for efficient pending task discovery and compound queries by userId + taskRecordId + status

### User

User entity for multi-user support with session isolation.

### UserSession

Playwright MCP storage state persistence:

- `userId`: Unique user identifier (1:1 with User)
- `storageState`: JSON string containing browser cookies and origins
- Used by user-isolated MCP clients to restore browser sessions

## API Endpoints

```
GET  /                    # Health check
POST /agent/run           # Queue a new agent task
POST /agent/confirm      # Confirm or reject pending action
GET  /agent/state         # Get task state from database or memory
GET  /agent/history      # Get task history entries (optional role filter)
GET  /agent/tools         # List available tools in OpenAI format
GET  /skills              # List all available skills (metadata only)
GET  /skills/:name        # Get skill metadata and full content
GET  /skills/:name/bundle # Get skill bundle (scripts, references, examples)
GET  /skills/:name/file/* # Get skill resource file
GET  /queue/tasks/:id     # Get task queue status
GET  /queue/stats         # Get queue statistics (pending/processing/completed/failed)
GET  /scheduler/jobs      # List scheduled jobs
POST /scheduler/jobs      # Create a scheduled job (requires cronExpression or runAt)
GET  /scheduler/jobs/:id  # Get a scheduled job
PUT  /scheduler/jobs/:id  # Update a scheduled job
DELETE /scheduler/jobs/:id # Delete a scheduled job
POST /scheduler/jobs/:id/run # Manually trigger a scheduled job
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
- `SKILLS_PATH` - Path to skills directory (default: ./skills)
- `PLAYWRIGHT_SESSION_SYNC_INTERVAL_MS` - Session sync interval ms (default: 30000)
- `PLAYWRIGHT_MCP_USER_DATA_DIR` - Base directory for user Playwright data (default: /tmp/loomos-mcp)
- `LOG_LEVEL` - Logging level (default: info)
- `LOG_FILE_ENABLED` - Enable file logging (default: false)
- `LOG_FILE` - Log file path (default: ./logs/app.log)

### MCP Server Configuration

MCP servers are configured in `src/agent/mcp/config.ts`:

```typescript
export const mcpServers: MCPServerConfig[] = [
    {
        name: 'filesystem',
        enabled: true,
        transport: 'stdio',
        stdio: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
    },
    {
        name: 'playwright',
        enabled: true,
        transport: 'stdio',
        stdio: {
            command: 'npx',
            args: ['-y', '@playwright/mcp@latest'],
        },
    },
    {
        name: 'remote-server',
        enabled: true,
        transport: 'http',
        http: {
            url: 'http://localhost:3000/sse',
        },
    },
]
```

**Transport Types**:

- `stdio`: Local process communication via standard input/output
- `http`: Remote server communication via SSE (Server-Sent Events)

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

**Agent States**:

- `idle`: Agent is not currently running
- `thinking`: Agent is reasoning about the task
- `awaiting_action`: Waiting for user input or action
- `awaiting_confirmation`: Waiting for human approval of an action
- `executing`: Running tools or performing actions
- `completed`: Task finished successfully
- `error`: An error occurred during execution

### Tool Calling

Native OpenAI tool calling support with:

- Automatic argument validation
- Unified tool registry (system + MCP)
- Handler-based execution
- MCP tools: filesystem (read_file), playwright (browser automation)
- System tools: read_file, search_file_content, run_shell_command
- Extensible tool system with `toolHandlers` map

### MCP Integration

**Model Context Protocol** support with:

- **Shared Clients**: Global MCP server connections (filesystem, playwright)
- **User-Isolated Clients**: Per-user MCP sessions with:
  - Isolated browser storage directories
  - Playwright storage state persistence to database
  - Periodic sync (configurable interval)
  - Session restore on reconnect
  - Automatic cleanup on disconnect

**MCP Tool Naming**: MCP tools are prefixed with server name:

- `filesystem_read_file`, `filesystem_list_directory`, `filesystem_read_file_image`
- `playwright_navigate`, `playwright_click`, `playwright_screenshot`

### Anthropic Agent Skills

Skills are markdown files with YAML frontmatter defining agent capabilities:

```yaml
---
name: code-review
description: Use this skill for any code review task...
license: MIT
allowed-tools: read_file search_file_content run_shell_command
version: 1.0.0
---

# Code Review Skill

## When to Use
...

## Review Process
...
```

**Skill Structure**:

- `skills/{skill-name}/SKILL.md` - Main skill definition
- `skills/{skill-name}/scripts/` - Executable scripts
- `skills/{skill-name}/references/` - Reference documentation
- `skills/{skill-name}/examples/` - Example files

**Skill API**:

- List all skills: `GET /skills`
- Get skill content: `GET /skills/:name`
- Get bundle: `GET /skills/:name/bundle`
- Get resource file: `GET /skills/:name/file/*`

### Real-time History Tracking

- Progress callbacks for streaming history updates
- Database persistence of all history entries
- Support for task resumption with history context
- Iteration tracking per assistant/tool entry
