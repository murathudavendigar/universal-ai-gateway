# Universal AI Gateway

Route AI workloads through a shared gateway, pick the right free model per task, and delegate heavy work from your primary assistant via MCP — without burning primary-model tokens on every sub-task.

## What it does

- **Gateway runtime** (`@uag/core`) — registers providers, routes by task type, falls back when a model fails
- **Provider adapters** — OpenRouter and NVIDIA NIM integrations
- **Operator package** (`@uag/operator`) — shared delegate handlers, task registry, moderation, and stats used by MCP and the web console
- **MCP server** (`apps/mcp`) — exposes `delegate_task` to Cursor, Claude Desktop, and other MCP clients
- **Web operator console** (`apps/web`) — personal UI with single/thread/compare modes, templates, durable browser history, analytics, and rate-limited APIs
- **Task-aware routing** — coding, reasoning, documentation, review, and chat each get their own model chain

Free downstream models can be slow (often 3–4 minutes). The MCP server waits up to 5 minutes by default and emits progress updates while a request is in flight.

## Quick start

### 1. Install

```sh
pnpm install
cp .env.example .env
```

Add at least one provider key to `.env`:

```env
OPENROUTER_API_KEY=...
NVIDIA_API_KEY=...
```

### 2. Build core packages

```sh
pnpm --filter @uag/sdk build
pnpm --filter @uag/core build
pnpm --filter @uag/provider-openrouter build
pnpm --filter @uag/provider-nvidia build
pnpm --filter @uag/operator build
pnpm --filter @uag/mcp build
```

### 3. Smoke test the gateway

```sh
pnpm exec tsx examples/gateway.ts
```

### 4. Run the web operator console (optional)

```sh
pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000). See [apps/web/README.md](apps/web/README.md) for auth, API routes, and history persistence.

### 5. Run the MCP server (Cursor)

Copy the template and point it at your absolute path (project `.cursor/mcp.json` is gitignored):

```sh
cp .cursor/mcp.json.example .cursor/mcp.json
```

Or add the same block to your user MCP config:

```json
{
  "mcpServers": {
    "universal-ai-gateway": {
      "command": "node",
      "args": ["/absolute/path/to/universal-ai-gateway/apps/mcp/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your-key",
        "NVIDIA_API_KEY": "your-key"
      }
    }
  }
}
```

After code changes that affect MCP tools, rebuild `@uag/mcp` (and dependencies) and restart the MCP server in Cursor. See [apps/mcp/README.md](apps/mcp/README.md) for tool reference, dev mode, and timeout settings.

## MCP tools

| Tool | Purpose |
|------|---------|
| `health` | Ping registered providers |
| `list_routing` | Intent→model chains + guidance for `specific_model` |
| `delegate_task` | Send a coding or reasoning task to a downstream model |
| `get_session_stats` | Session-level token-savings counters |
| `get_task_result` | Poll a `request_id` after timeout or while pending |

`delegate_task` supports idempotency via `request_id`, input moderation, model validation, automatic truncation recovery, and background completion after timeout. Prefer auto-route; use `list_routing` before overriding `specific_model`.

## Routing

The router picks a fallback chain per task. If the first model fails, the gateway tries the next.

| Task | Primary chain |
|------|----------------|
| `coding` | GPT-OSS 120B → Nemotron Ultra 550B → Super 120B |
| `reasoning` | Nemotron Ultra 550B → Super 120B → GPT-OSS 120B |
| `documentation` | GPT-OSS 120B → Nemotron Super 120B |
| `review` / `chat` | Nemotron Super 120B → GPT-OSS 120B → Ultra 550B |

Routing lives in `packages/core/src/router.ts`.

## Architecture

```text
MCP client (Cursor)          Browser (operator console)
       │                              │
       ▼                              ▼
  apps/mcp                    apps/web /api/*
  (delegate / list_routing)            │
       │                              │
       └──────────┬───────────────────┘
                  ▼
           @uag/operator  ── handlers + TaskRegistry + SessionStats + routing guide
                  │
                  ▼
            @uag/core  ── AIGateway + Router + ProviderRegistry
                  │
                  ├── @uag/provider-nvidia
                  └── @uag/provider-openrouter
```

## Repository layout

| Path | Role |
|------|------|
| `apps/mcp` | MCP server (Cursor / Claude Desktop integration) |
| `apps/web` | Web operator console |
| `apps/docs` | Documentation site |
| `apps/cli` | CLI entrypoints |
| `packages/core` | Gateway, router, provider registry |
| `packages/operator` | Shared delegate handlers, task registry, stats |
| `packages/sdk` | Shared provider contracts |
| `packages/provider-openrouter` | OpenRouter adapter |
| `packages/provider-nvidia` | NVIDIA adapter |
| `packages/shared` | Shared types and helpers |
| `examples/` | Smoke tests, model probe, coding bench, perf scripts |

Other packages (`cache`, `config`, `logger`, `router`, `ui`, etc.) are scaffolding for future work.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | One of two | OpenRouter API key |
| `NVIDIA_API_KEY` | One of two | NVIDIA API key |
| `UAG_DELEGATE_TIMEOUT_MS` | No | Delegate timeout in ms (default: `300000`) |
| `UAG_WEB_TOKEN` | No | If set, web `/api/*` requires Bearer auth |

## Development

```sh
pnpm dev                              # turbo dev across apps
pnpm test                             # vitest (all packages)
pnpm vitest run packages/operator/src # operator unit tests
pnpm vitest run apps/mcp/src          # MCP live integration (gated)
UAG_RUN_LIVE_TESTS=1 pnpm vitest run apps/mcp/src/live.integration.test.ts
pnpm --dir apps/mcp typecheck
pnpm --filter @uag/operator typecheck
pnpm --filter web check-types
```

Build only gateway-related packages when iterating on MCP:

```sh
pnpm --filter @uag/operator build
pnpm --filter @uag/mcp build
```

## Using with Cursor

A project rule in `.cursor/rules/universal-ai-gateway-delegation.mdc` tells the agent when to delegate vs. when to handle work directly. Delegation is for self-contained drafts and reasoning — not for repo-aware bug fixes or small edits where free models are too weak.

## Extra examples

```sh
pnpm exec tsx examples/model-probe.ts    # which catalog models still respond
pnpm exec tsx examples/perf-smoke.ts     # latency smoke
pnpm exec tsx examples/coding-bench.ts   # coding quality / speed bench
```

## Notes

- `tokens_saved` in MCP responses is an approximation based on downstream provider usage, not a direct comparison to the primary model's tokenizer.
- At least one provider key is required; both are recommended for full fallback coverage.
- Free models may take several minutes. Use `get_task_result` if `delegate_task` returns `timeout`.
- Local artifacts stay out of git: `.env*`, `dist/`, `.data/` (web task history), and `.cursor/mcp.json`.

## License

Private monorepo — see individual package manifests for publishing status.
