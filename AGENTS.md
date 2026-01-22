# Loomos Project - AGENTS.md

## Project Overview

This is a lightweight Web server project based on the **Bun** runtime, built using the **Hono** framework. Hono is a fast, modern Web framework that supports multiple runtimes (Bun, Node.js, Deno, etc.), known for its high performance and concise API.

The project is developed in TypeScript with strict type checking and JSX support configured, making it suitable for building high-performance API services or SSR applications.

## Tech Stack

- **Runtime**: Bun
- **Web Framework**: Hono (^4.11.5)
- **Language**: TypeScript
- **Package Manager**: Bun

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

Bun natively supports running TypeScript without additional build steps. For production environments, you can directly use:

```sh
bun run src/index.ts
```

Or use Bun's bundler:

```sh
bun build
```

## Project Structure

```
loomos/
├── src/
│   └── index.ts          # Main application entry point
├── package.json          # Project dependencies and script configuration
├── tsconfig.json         # TypeScript compiler configuration
├── bun.lock              # Bun dependency lock file
└── README.md             # Project documentation
```

### Core File Descriptions

- **`src/index.ts`**: Main application entry point, defines the Hono app instance and route configuration
- **`package.json`**: Contains project metadata, dependencies, and npm scripts
- **`tsconfig.json`**: TypeScript configuration, enables strict mode and Hono JSX support

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow Hono framework best practices
- Use Bun's type definitions (`@types/bun`)

### Route Configuration Example

The basic route structure of the current project:

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

export default app
```

### Extending the Project

To add new features:

1. **Add new routes**: Use `app.get()`, `app.post()` and other methods in `src/index.ts`
2. **Add middleware**: Use `app.use()` to add global middleware
3. **Add dependencies**: Use `bun add <package>` to install new packages

## Testing

The project currently does not have a test framework configured. To add tests:

```sh
bun add -D bun-test  # or other testing frameworks
```

## Notes

- This project is in its initial stage with relatively simple functionality
- Hono framework's JSX support is configured and can be used for server-side rendering
- Using `bun run --hot` enables hot reload during development