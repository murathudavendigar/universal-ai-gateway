# MCP

Model Context Protocol server for Universal AI Gateway.

This package exposes the gateway to stdio-based MCP clients such as Cursor, Claude Desktop, and the MCP inspector.

## Tools

| Tool | Purpose |
|------|---------|
| `health` | Checks gateway status and pings registered providers |
| `delegate_task` | Sends a coding or reasoning task to a downstream model |
| `get_session_stats` | Returns session-level delegation counters |
| `get_task_result` | Polls a prior `request_id` after timeout or while pending |

## Environment

At least one provider API key is required:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | One of two | OpenRouter provider key |
| `NVIDIA_API_KEY` | One of two | NVIDIA provider key |
| `UAG_DELEGATE_TIMEOUT_MS` | No | Delegate timeout in ms (default: `300000` / 5 min) |

If keys are not already in the environment, the server falls back to `./.env` in the current working directory.

## Cursor setup

Add this to your MCP config:

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

For local development without building:

```json
{
  "mcpServers": {
    "universal-ai-gateway": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/universal-ai-gateway/apps/mcp", "dev"],
      "env": {
        "OPENROUTER_API_KEY": "your-key",
        "NVIDIA_API_KEY": "your-key"
      }
    }
  }
}
```

## Example calls

Delegate a coding task:

```json
{
  "prompt": "Write a TypeScript function that reverses a string.",
  "intent": "coding"
}
```

Delegate with an explicit model:

```json
{
  "prompt": "Summarize the trade-offs between mutexes and semaphores.",
  "intent": "reasoning",
  "specific_model": "nvidia/nemotron-3-ultra-550b-a55b"
}
```

Poll after timeout:

```json
{
  "request_id": "the-id-returned-by-delegate_task"
}
```

## Development

```sh
pnpm install
pnpm build
pnpm --dir apps/mcp dev
pnpm vitest run apps/mcp/src
UAG_RUN_LIVE_TESTS=1 pnpm vitest run apps/mcp/src/live.integration.test.ts
```

## Notes

- `tokens_saved` is an approximation based on downstream provider usage, not a direct measurement against the primary assistant model.
- `delegate_task` supports `request_id` idempotency and background completion after timeout.
- Free downstream models may take 3-4 minutes. While waiting, the server emits MCP progress/log updates every 15 seconds.
- Input moderation blocks obvious prompt-injection and credential-leak patterns before dispatch.
