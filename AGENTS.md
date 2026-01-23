# Loomos Project - AGENTS.md

## Project Overview

Loomos is an AI Agent API service project built on the **Bun** runtime, using the **Hono** framework. Hono is a high-performance modern Web framework that supports multiple runtimes (Bun, Node.js, Deno, etc.), known for its excellent performance and concise API.

This project is developed in TypeScript with strict type checking, implementing an intelligent Agent system based on Large Language Models (LLM), supporting core features such as task execution, human-in-the-loop confirmation, and tool calling.

## Tech Stack

- **Runtime**: Bun
- **Web Framework**: Hono (^4.11.5)
- **Language**: TypeScript
- **Package Manager**: Bun
- **Environment Config**: @dotenvx/dotenvx

## Quick Start

### Install Dependencies

```sh
bun install
```

### Run the Project

Development mode (with hot reload):

```sh
bun run dev
```

The project will start at `http://localhost:3000`.

### Build and Deploy

Build the project for production:

```sh
bun run build
```

Start the production server:

```sh
bun run start
```

## Project Structure

```
loomos/
├── src/
│   ├── index.ts              # Main application entry point, Hono app instance and route configuration
│   └── agent/                # Core Agent module
│       ├── index.ts          # Agent factory function (createAgent)
│       ├── client.ts         # LLM client for API communication
│       ├── config.ts         # Agent configuration management
│       ├── prompt.ts         # System prompt generation
│       ├── types.ts          # TypeScript type definitions
│       └── tools/            # Available tools for agent execution
│           ├── index.ts      # Tool registry
│           └── web.ts        # Web-related tools (fetch, etc.)
├── package.json              # Project dependencies and script configuration
├── tsconfig.json             # TypeScript compiler configuration
├── bun.lock                  # Bun dependency lock file
└── README.md                 # Project documentation
```

### Core File Descriptions

- **`src/index.ts`**: Main application entry point, defines Hono app instance and route configuration, including Agent API endpoints
- **`src/agent/index.ts`**: Agent factory function, creates Agent instances using closures for private state encapsulation
- **`src/agent/client.ts`**: LLM client implementation for API communication
- **`src/agent/config.ts`**: Agent configuration including max iterations, uncertainty thresholds
- **`src/agent/prompt.ts`**: System prompt generation for Agent behavior
- **`src/agent/types.ts`**: Comprehensive TypeScript interfaces for Agent, Tool, Message, and State types
- **`src/agent/tools/`**: Tool system for extending Agent capabilities
- **`package.json`**: Contains project metadata, dependencies, and npm scripts
- **`tsconfig.json`**: TypeScript configuration, enables strict mode and Hono JSX support

## API Endpoints

### Health Check

```
GET /
```

Returns a simple status message indicating the API is running.

### Run Agent Task

```
POST /agent/run
Content-Type: application/json

{
  "task": "Your task description here"
}
```

Executes an Agent task with the provided input.

### Confirm/Uncertain Action

```
POST /agent/confirm
Content-Type: application/json

{
  "approved": true,
  "alternativeInput": "Optional guidance for the agent"
}
```

Confirms or rejects an uncertain action proposed by the Agent.

### Get Agent State

```
GET /agent/state
```

Returns the current state of the Agent instance.

### List Available Tools

```
GET /agent/tools
```

Returns a list of all available tools that the Agent can use.

## Agent Features

### State Management

- **Idle**: Agent is ready to receive new tasks
- **Thinking**: Agent is processing and generating responses
- **Executing**: Agent is executing a tool call
- **AwaitingConfirmation**: Agent requires human confirmation before proceeding
- **Completed**: Task completed successfully
- **Error**: An error occurred during execution

### Uncertainty Detection

The Agent automatically detects uncertainty in LLM responses and can request human confirmation before executing potentially risky actions. Uncertainty is determined by:

- Explicit uncertainty markers (`<uncertainty>` tags)
- Language indicators (e.g., "I'm not sure", "it depends")
- Risk level of the proposed action

### Tool System

The Agent can use various tools to accomplish tasks. Each tool:

- Has a defined name, description, and parameters
- Returns structured results with success status and content
- Can be validated before execution

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow Hono framework best practices
- Use Bun's type definitions (`@types/bun`)
- Agent module uses functional pattern with closures for state encapsulation

### Adding New Tools

To add a new tool to the Agent:

1. Define the tool in `src/agent/tools/your-tool.ts`
2. Export the tool definition with name, description, and parameters
3. Register the tool in `src/agent/tools/index.ts`
4. Add the handler implementation

Example tool structure:

```typescript
export const yourTool = {
  name: 'yourTool',
  description: 'Description of what your tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  }
}
```

### Extending the Project

To add new features:

1. **Add new API routes**: Use `app.get()`, `app.post()` and other methods in `src/index.ts`
2. **Add new Agent tools**: Create files in `src/agent/tools/` and register in index.ts
3. **Add middleware**: Use `app.use()` to add global middleware
4. **Add dependencies**: Use `bun add <package>` to install new packages

## Configuration

Agent behavior can be configured in `src/agent/config.ts`:

- **maxIterations**: Maximum number of iterations before task completion
- **uncertaintyThreshold**: Threshold for requesting human confirmation
- **model**: LLM model to use for Agent reasoning

Environment variables can be configured using `.env` files (via @dotenvx/dotenvx).

## Testing

The project currently does not have a test framework configured. To add tests:

```sh
bun add -D bun-test  # or other testing frameworks
```

## Notes

- Agent uses closures for private state encapsulation, ensuring thread-safe instances
- All tool calls are validated before execution for security
- Hono framework's JSX support is configured and can be used for server-side rendering
- Using `bun run --hot` enables hot reload during development
