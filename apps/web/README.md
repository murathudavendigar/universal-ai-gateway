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
- **Modes** — `single`, multi-turn `thread`, and `compare` (two models)
- **Templates** — explain / refactor / tests / review / debug / docs presets
- **Polling + progress** — long free-model runs show elapsed time and poll `/api/tasks/:id`
- **History** — server tasks merged with browser `localStorage` (survives Vercel cold starts in your browser)
- **Analytics** — local success rate, tokens saved, top intent/model
- **Routing** — intent → fallback chain; unhealthy providers are deferred
- **Health / stats** — provider status and session counters
- **Rate limit** — ~40 req/min per bearer token / IP

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
- Server task registry is in-process (+ local `.data/tasks.json` when the filesystem is writable). On Vercel this is ephemeral — the UI also keeps a browser-side history merge.
- Multiple Next.js instances do **not** share server memory.
- Free models may take several minutes; default timeout is `UAG_DELEGATE_TIMEOUT_MS` (300000).
- Compare mode uses two model calls — prefer faster models to stay within free-tier limits.
