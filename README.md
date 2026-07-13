# Universal AI Gateway

Universal AI Gateway is a monorepo for routing AI requests through a shared gateway and a set of independent provider packages.

## What lives here

- `apps/cli` - command-line entrypoints and local operator tools
- `apps/mcp` - MCP server exposed to Claude Desktop and the inspector
- `apps/docs` - documentation site
- `apps/web` - web app and product surface
- `packages/core` - provider registry, router, and gateway runtime
- `packages/router` - task routing rules and model selection
- `packages/provider-openrouter` - OpenRouter provider adapter
- `packages/provider-nvidia` - NVIDIA provider adapter
- `packages/sdk` - shared request and response contracts
- `packages/shared` - common types, constants, and helpers
- `packages/cache` - cache abstractions and implementations
- `packages/config` - config loading and validation helpers
- `packages/logger` - logging setup and shared logger utilities
- `packages/eslint-config` - shared ESLint presets
- `packages/typescript-config` - shared TypeScript presets
- `packages/ui` - shared React components

## Working on the repo

```sh
pnpm install
pnpm dev
pnpm exec tsx examples/gateway.ts
```

The example scripts under `examples/` show how the gateway, providers, and router fit together.
