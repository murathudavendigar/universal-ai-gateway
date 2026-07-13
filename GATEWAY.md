# Universal AI Gateway — Usage Guide

How to run the gateway today, and how to extend it with new providers and models later.

## 1. Architecture

```
@uag/sdk              → AIProvider interface + shared ChatRequest/ChatResponse types
@uag/core             → ProviderRegistry, Router, AIGateway (provider-agnostic)
@uag/provider-*        → one package per AI provider, each implements AIProvider
```

- `ProviderRegistry` — holds provider instances by name (`"openrouter"`, `"nvidia"`, ...).
- `Router` — maps a `TaskType` (`chat`, `documentation`, `coding`, `review`, `reasoning`) to a `{ provider, model }` pair. This is the only place routing decisions live.
- `AIGateway` — looks up the route, resolves the provider from the registry, sends the chat request.

Apps never talk to a provider package directly — they only import `@uag/core` and call `gateway.chat(request, task)`.

## 2. Setup

Add API keys to `.env` at the repo root (see `.env.example` for the full list):

```
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=nvapi-...
```

Install and build the workspace packages you touched:

```bash
pnpm install -w
npx turbo run build --filter=@uag/core --filter=@uag/provider-openrouter --filter=@uag/provider-nvidia
```

Run `npx turbo run build` with no filter to build everything.

## 3. Run the example

```bash
pnpm exec tsx examples/gateway.ts
```

`examples/gateway.ts` registers both providers and sends one `"coding"` request and one `"reasoning"` request, so you can see both routes hit in one run.

## 4. Use it in your own code

```typescript
import { ProviderRegistry, Router, AIGateway } from "@uag/core";
import { createOpenRouterProvider } from "@uag/provider-openrouter";
import { createNvidiaProvider } from "@uag/provider-nvidia";

const registry = new ProviderRegistry();
registry.register(createOpenRouterProvider(process.env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(process.env.NVIDIA_API_KEY!));

const gateway = new AIGateway(registry, new Router());

const response = await gateway.chat(
  { messages: [{ role: "user", content: "hello" }] },
  "reasoning" // task type — decides provider + model. Defaults to "chat".
);
```

`request.model` is optional. If you omit it, the `Router` fills in the model for the given task. Pass a `model` explicitly to override the router's choice for that one call.

## 5. Current routing table

Defined in [`packages/core/src/router.ts`](packages/core/src/router.ts):

| Task            | Provider   | Model                                     |
| --------------- | ---------- | ------------------------------------------ |
| `documentation` | openrouter | `cohere/north-mini-code`                   |
| `reasoning`     | nvidia     | `nvidia/llama-3.3-nemotron-super-49b-v1`   |
| `coding`        | openrouter | `openai/gpt-oss-120b`                      |
| `review`        | openrouter | `openai/gpt-oss-120b`                      |
| `chat`          | openrouter | `openai/gpt-oss-120b`                      |

Update this switch statement whenever you want a task to route somewhere else — nothing else in the codebase needs to change.

## 6. Adding a new provider

Every provider package follows the exact same shape as `packages/provider-openrouter` and `packages/provider-nvidia`. To add provider `foo`:

1. **Scaffold the package**

   ```
   packages/provider-foo/
   ├── package.json
   ├── tsconfig.json
   └── src/
       ├── client.ts     # thin fetch wrapper around foo's HTTP API
       ├── types.ts       # foo's raw response shape
       ├── models.ts      # MODELS map of model id constants
       ├── provider.ts    # class FooProvider implements AIProvider + createFooProvider()
       └── index.ts       # export * from the four files above
   ```

   Copy `packages/provider-nvidia/*` as a template and rename `Nvidia` → `Foo`, `NVIDIA` → `FOO`.

2. **Implement `AIProvider`** (from `@uag/sdk/provider`):

   ```typescript
   export class FooProvider implements AIProvider {
     readonly name = "foo";
     async chat(request: ChatRequest): Promise<ChatResponse> { ... }
     async listModels(): Promise<string[]> { ... }
     async health(): Promise<boolean> { ... }
   }
   ```

   The `chat()` method's only job is translating `ChatRequest` → the provider's wire format, and the provider's raw response → `ChatResponse`. Keep provider-specific fields (e.g. `max_tokens` vs `maxOutputTokens`) inside this one file.

3. **Register it in `package.json` (root) and `examples/tsconfig.json`** the same way `@uag/provider-nvidia` was added — add the workspace dependency and a `paths` entry so `tsx`/`tsc` can resolve it without a build step during local dev.

4. **Add a route** in `packages/core/src/router.ts` pointing whichever `TaskType`(s) should use it at `"foo"` + a model id.

5. **Build + register**

   ```bash
   pnpm install -w
   npx turbo run build --filter=@uag/provider-foo
   ```

   Then `registry.register(createFooProvider(apiKey))` wherever you construct the gateway.

Nothing in `@uag/core`, `AIGateway`, or the apps needs to change — that's the whole point of the registry/router split.

## 7. Adding a new model to an existing provider

1. Add the constant to that provider's `src/models.ts` `MODELS` object.
2. Point a `Router` case at it (or pass `model` explicitly in the `ChatRequest` from the caller).
3. Rebuild that provider package.

## 8. Finding valid model IDs for a provider

Provider APIs reject unknown or unentitled model IDs — don't guess. Most OpenAI-compatible providers expose a `GET /v1/models` endpoint that lists what your account can actually call. Example, for NVIDIA:

```bash
curl -s https://integrate.api.nvidia.com/v1/models \
  -H "Authorization: Bearer $NVIDIA_API_KEY" | python3 -m json.tool
```

Filter for a keyword (e.g. `nemotron`) to shortlist candidates, then confirm access with a real chat request — being listed in `/v1/models` does not always mean your account has access to that specific model/function. A quick way to confirm:

```bash
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<candidate-id>","messages":[{"role":"user","content":"OK"}],"max_tokens":5}'
```

If access is missing you'll get `404 Not Found for account` even though the model appears in the catalog — try the next candidate.

## 9. Troubleshooting

| Symptom                                             | Cause                                                              | Fix                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Missing Authentication header` / `401 Unauthorized` | API key env var is empty or not loaded                             | Check `.env` has the key, and that you run from the repo root (dotenv reads `.env` relative to `cwd`) |
| `404 ... Function '<uuid>' Not found for account`    | Model ID exists in the catalog but this account has no access to it | Pick a different model ID (see §8), or request access from the provider |
| `Provider 'x' not found.`                            | `registry.register(...)` was never called for that provider name    | Register the provider before calling `gateway.chat`             |
| Changes to a provider package not showing up          | Package wasn't rebuilt                                              | `npx turbo run build --filter=@uag/provider-x`, or use `tsx` against `src/index.ts` via the `examples/tsconfig.json` path mapping instead of the built `dist/` |
