# UAG V2 — Phase 1: Foundation Design

## Context

Universal AI Gateway (UAG) is evolving from an MCP server with two hardcoded
providers into a production-grade AI orchestration platform (see the V2
master prompt for the full 19-feature roadmap). That roadmap is too large
for one spec, so it has been decomposed into phases:

1. **Foundation** — Provider Capability System, Provider Factory/DI, Config
   System *(this document)*
2. Resilience/Routing — Policy Engine, Health Monitoring, Circuit Breaker,
   Retry Engine
3. Observability — Metrics Engine, Session Statistics, Delegation Report
4. Caching
5. Orchestration — Task Planner, Parallel Delegation
6. Model Discovery — dynamic model fetch/cache
7. Streaming + Structured Outputs unification
8. CLI expansion
9. Dashboard architecture prep

Every later phase depends on capability flags, provider construction, and
configuration existing first, which is why Foundation goes first.

**Non-negotiable constraint:** a user who does nothing after this phase
ships (no config file, no code changes) gets byte-for-byte identical
runtime behavior to today. This phase only adds new extension points; it
does not change what `apps/mcp` does by default.

## Current State (before this phase)

- `packages/sdk/src/provider.ts` defines `AIProvider`, `ChatRequest`,
  `ChatResponse`, `ChatChunk`. Two implementations exist:
  `packages/provider-nvidia` and `packages/provider-openrouter`, each with
  a flat `MODELS` const map and a `*Provider` class.
- `packages/core/src/registry.ts` (`ProviderRegistry`) is a simple
  name → `AIProvider` map with `register`/`get`/`has`/`list`.
- `packages/core/src/router.ts` hardcodes model constants and a
  `task → RoutePlan[]` switch statement. **Untouched by this phase** —
  it belongs to Phase 2 (Policy Engine).
- `apps/mcp/src/index.ts` is the only composition root today. It directly
  calls `createOpenRouterProvider(env.OPENROUTER_API_KEY!)` and
  `createNvidiaProvider(env.NVIDIA_API_KEY!)`, checks both env vars are
  present before starting, and registers both into a `ProviderRegistry`
  by hand.
- `packages/cache`, `packages/config`, `packages/logger`, `packages/router`
  exist as empty placeholder packages (README only) — reserved slots for
  future phases. This phase fills in `packages/config`.

## 1. Provider Capability System

**Location:** `packages/sdk/src/provider.ts` (existing shared-contracts
file).

**New types, additive to the file:**

```ts
export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsImages: boolean;
  supportsJson: boolean;
  supportsLongContext: boolean;
  supportsParallel: boolean;
  supportsEmbeddings: boolean;
}
```

**`AIProvider` gains one new required method:**

```ts
export interface AIProvider {
  // ...existing members unchanged...
  getModelCapabilities(model: string): ModelCapabilities;
}
```

Capabilities are declared **per model, not per provider** — a provider
like NVIDIA can host both vision-capable and text-only models under one
`AIProvider` implementation, and the router (in later phases) picks a
specific model, so it needs model-level truth.

Each provider package owns its own defaults. `provider-nvidia` and
`provider-openrouter` each add a `capabilities.ts` next to their existing
`models.ts`, mapping every `MODELS` entry to a `ModelCapabilities` object.
`getModelCapabilities()` on the `*Provider` class looks up that map by
model string; for a model string not in the map (both providers' `MODELS`
types accept arbitrary strings), it returns a conservative default
(`supportsStreaming: true`, every other flag `false`) rather than
throwing — an unknown model should degrade gracefully, not break the
request path.

**Compatibility:** every existing `AIProvider` method (`chat`,
`streamChat`, `listModels`, `health`) is unchanged. Both provider classes
gain exactly one new method each. No caller of the existing methods is
affected.

## 2. Provider Factory / Dependency Injection

**Location:** `packages/core/src/factory.ts` (new file, alongside the
existing `registry.ts`).

The factory is generic — `packages/core` never imports a concrete
provider package (no `provider-nvidia`/`provider-openrouter` dependency
added to `packages/core/package.json`). It maps a **kind string** to a
**constructor function**, registered at runtime by the composition root:

```ts
export type ProviderConstructor = (apiKey: string) => AIProvider;

export interface ProviderConfigEntry {
  kind: string;       // e.g. "openrouter", "nvidia"
  apiKeyEnv: string;   // e.g. "OPENROUTER_API_KEY"
}

export class ProviderFactory {
  private readonly constructors = new Map<string, ProviderConstructor>();

  registerType(kind: string, ctor: ProviderConstructor): void {
    this.constructors.set(kind, ctor);
  }

  build(entries: ProviderConfigEntry[]): ProviderRegistry {
    const registry = new ProviderRegistry();
    const missing: string[] = [];

    for (const entry of entries) {
      const ctor = this.constructors.get(entry.kind);
      if (!ctor) {
        throw new Error(`Unknown provider kind '${entry.kind}'.`);
      }

      const apiKey = process.env[entry.apiKeyEnv];
      if (!apiKey) {
        missing.push(entry.apiKeyEnv);
        continue;
      }

      registry.register(ctor(apiKey));
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variable(s): ${missing.join(", ")}.`
      );
    }

    return registry;
  }
}
```

`ProviderConfigEntry` is defined here (in `packages/core`, next to the
factory that consumes it) and re-exported by `packages/config` — see
Section 3.

**Composition root** (`apps/mcp/src/index.ts`) changes from two hardcoded
`registry.register(...)` calls to:

```ts
const factory = new ProviderFactory();
factory.registerType("openrouter", createOpenRouterProvider);
factory.registerType("nvidia", createNvidiaProvider);

const registry = factory.build(config.providers);
```

Adding a new provider kind later (`provider-groq`, etc.) is one new
`registerType` call in `apps/mcp` — zero changes to `packages/core`.

## 3. Config System

**Location:** `packages/config/src/` (currently an empty placeholder
package — this phase is its first real content).

**Schema** (`packages/config/src/schema.ts`), validated with `zod`:

```ts
export interface UagConfig {
  providers: ProviderConfigEntry[]; // re-exported from @uag/core
}
```

**Loader** (`packages/config/src/load.ts`):

- Looks for `uag.config.json` starting at `process.cwd()`.
- If the file is absent, returns a **built-in default** that reproduces
  today's exact behavior:
  ```json
  {
    "providers": [
      { "kind": "openrouter", "apiKeyEnv": "OPENROUTER_API_KEY" },
      { "kind": "nvidia", "apiKeyEnv": "NVIDIA_API_KEY" }
    ]
  }
  ```
  This default is what makes the phase backward-compatible by
  construction: a user with no config file gets identical provider
  wiring to the current hardcoded setup.
- If present, parses the file as JSON and validates against the zod
  schema; a validation failure throws an error naming the offending
  field (e.g. `providers[1].apiKeyEnv: Required`).
- No env var interpolation syntax (e.g. `${FOO}`) inside the config file.
  `apiKeyEnv` only *names* an environment variable; the factory (Section
  2) reads `process.env[apiKeyEnv]` directly. This keeps the config
  parser dumb and keeps the secret boundary sharp — actual key values
  never pass through the config file or its parser.
- Format scope for this phase: **JSON + env vars only**. YAML support is
  explicitly deferred to a later pass on the Config System — it adds a
  parser dependency and format-detection logic that shouldn't gate
  Foundation.

**Full startup flow in `apps/mcp/src/index.ts` after this phase:**

```
load .env (existing cwd/env fallback logic — unchanged)
  → loadConfig()                        // packages/config
  → new ProviderFactory()
  → registerType("openrouter", createOpenRouterProvider)
  → registerType("nvidia", createNvidiaProvider)
  → factory.build(config.providers)     // → ProviderRegistry
      (throws with every missing env var named, in one error,
       replacing today's two-var special-cased check)
  → new AIGateway(registry, new Router())   // unchanged
```

The `console.error` + `process.exit(1)` pattern at startup is preserved,
just driven by the factory's aggregated error instead of two manual
`if` checks.

## Error Handling

All failures in this phase happen at **startup**, fail-fast, never
deferred to request time:

| Failure | Behavior |
|---|---|
| Unknown `kind` in config | `ProviderFactory.build` throws immediately, naming the kind |
| Missing env var(s) named by `apiKeyEnv` | Collected across *all* configured providers, reported in one error listing every missing var |
| Invalid/malformed `uag.config.json` | zod validation error surfaced with the specific field path |
| Unrecognized model string passed to `getModelCapabilities` | No throw — returns the conservative default capability set |

`apps/mcp/src/index.ts` catches the aggregated startup error, prints it
via `console.error` in the existing human-readable style, and calls
`process.exit(1)` — same UX as today, now covering config/factory errors
generically instead of two hardcoded checks.

## Testing

Per-package `vitest`, matching the existing convention:

- **`packages/config`**: default fallback when no file present; valid
  file parses correctly; invalid file rejected with a field-level
  message.
- **`packages/core` (factory)**: unknown kind throws; missing env
  var(s) throw with all missing names listed; successful build returns a
  populated `ProviderRegistry`; `packages/core/package.json` has no
  `provider-*` dependency (structural check that Open/Closed holds).
- **`provider-nvidia` / `provider-openrouter`**: `getModelCapabilities()`
  returns the correct flags for every entry in `MODELS`; returns the
  conservative default for an unrecognized model string.
- **`apps/mcp`**: startup integration test asserting that config-driven
  `factory.build(...)` with no `uag.config.json` present produces a
  registry containing exactly `["openrouter", "nvidia"]` — the
  backward-compatibility proof for this phase.

## Documentation

- `packages/config/README.md` replaced with real usage docs (schema,
  default behavior, example `uag.config.json`).
- `packages/core/README.md` (if absent, created) documents
  `ProviderFactory` and `ProviderConfigEntry`.
- `GATEWAY.md` (existing monorepo usage guide) gets a new section
  covering: how to write a `uag.config.json`, how capability flags are
  declared for a new provider, and how to register a new provider kind
  in a composition root.

## Out of Scope for This Phase

- Router does not consume capability flags yet (Phase 2).
- No YAML config support (deferred).
- No npm-based plugin auto-discovery — provider kinds are registered
  explicitly by the composition root (Phase "Plugin System" / #11 in the
  master roadmap is separate and later).
- No changes to `Router`, `AIGateway`, session stats, or the MCP tool
  surface (`health`, `get_session_stats`, `delegate_task`).
