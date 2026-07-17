# Web Operator Console

Personal web UI for Universal AI Gateway — run delegates without Cursor/MCP.

## Run

From the repo root (with provider keys in `.env`):

```sh
pnpm --filter @uag/operator build
pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Playground** — prompt + intent (`chat` / `coding` / `reasoning` / `documentation` / `review`) + optional model
- **Polling** — long free-model runs return `pending`/`timeout`; the UI polls `/api/tasks/:id`
- **History** — last 200 tasks, persisted to `apps/web/.data/tasks.json`
- **Routing** — intent → fallback chain table
- **Health / stats** — provider status and session token-savings counters

## Auth

If `UAG_WEB_TOKEN` is set, every `/api/*` route requires:

```http
Authorization: Bearer <token>
```

Paste the same token into the console’s Bearer field (stored in `localStorage`). If the env var is unset, APIs are open (local personal use).

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Provider health |
| `GET` | `/api/stats` | Session stats |
| `GET` | `/api/routing` | Routing chains + known models |
| `POST` | `/api/delegate` | `{ prompt, intent, specific_model?, request_id? }` |
| `GET` | `/api/tasks` | Recent tasks |
| `GET` | `/api/tasks/[id]` | Poll a task by `request_id` |

## Notes

- Provider keys stay server-side; the browser only talks to `/api/*`.
- Task registry is in-process memory with file durability. Multiple Next.js instances do **not** share state — run a single process.
- Free models may take several minutes; default timeout is `UAG_DELEGATE_TIMEOUT_MS` (300000).
