import "dotenv/config";
import { performance } from "node:perf_hooks";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import {
  buildKnownModelSet,
  createDelegateTaskHandler,
  createGetSessionStatsHandler,
  createHealthHandler,
  createListRoutingHandler,
  SessionStats,
  TaskRegistry,
} from "@uag/operator";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

function ms(start: number) {
  return Math.round(performance.now() - start);
}

async function time<T>(label: string, fn: () => Promise<T>) {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { label, ok: true as const, ms: ms(t0), value };
  } catch (error) {
    return {
      label,
      ok: false as const,
      ms: ms(t0),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const registry = new ProviderRegistry();
  const router = new Router();
  if (process.env.OPENROUTER_API_KEY) {
    registry.register(createOpenRouterProvider(process.env.OPENROUTER_API_KEY));
  }
  if (process.env.NVIDIA_API_KEY) {
    registry.register(createNvidiaProvider(process.env.NVIDIA_API_KEY));
  }

  if (registry.list().length === 0) {
    throw new Error("No providers registered — set OPENROUTER_API_KEY and/or NVIDIA_API_KEY");
  }

  const gateway = new AIGateway(registry, router);
  const sessionStats = new SessionStats();
  const taskRegistry = new TaskRegistry();
  const knownModels = await buildKnownModelSet(registry.list(), router);
  const timeoutMs = Number(process.env.UAG_DELEGATE_TIMEOUT_MS ?? 300_000);

  const health = createHealthHandler({ providers: registry.list() });
  const listRouting = createListRoutingHandler({ router, knownModels });
  const getSessionStats = createGetSessionStatsHandler({ sessionStats });
  const delegateTask = createDelegateTaskHandler({
    chat: (request, task) => gateway.chat(request, task),
    sessionStats,
    taskRegistry,
    knownModels,
    timeoutMs,
  });

  const stamp = Date.now();
  const results = [];

  results.push(await time("health", async () => JSON.parse(await health())));
  results.push(await time("list_routing", async () => JSON.parse(await listRouting())));

  results.push(
    await time("delegate_coding_auto", async () =>
      JSON.parse(
        await delegateTask({
          prompt:
            "Write a tiny TypeScript function isEven(n: number): boolean. Return only the function, no markdown.",
          intent: "coding",
          request_id: `perf-coding-auto-${stamp}`,
        })
      )
    )
  );

  results.push(
    await time("delegate_coding_gptoss", async () =>
      JSON.parse(
        await delegateTask({
          prompt:
            "Write a tiny TypeScript function clamp(n: number, min: number, max: number): number. Return only the function, no markdown.",
          intent: "coding",
          specific_model: "openai/gpt-oss-120b",
          request_id: `perf-coding-gptoss-${stamp}`,
        })
      )
    )
  );

  results.push(
    await time("delegate_reasoning_auto", async () =>
      JSON.parse(
        await delegateTask({
          prompt:
            "In one short paragraph, compare mutex vs semaphore for protecting a shared counter. Max 60 words.",
          intent: "reasoning",
          request_id: `perf-reasoning-auto-${stamp}`,
        })
      )
    )
  );

  results.push(
    await time("get_session_stats", async () => JSON.parse(await getSessionStats()))
  );

  const summary = results.map((r) => {
    const base = { label: r.label, ok: r.ok, ms: r.ms };
    if (!r.ok) return { ...base, error: r.error };
    const v = r.value as Record<string, unknown>;
    return {
      ...base,
      status: v.status,
      provider: v.provider_used,
      model: v.model_used,
      tokens_saved: v.tokens_saved,
      cached: v.cached,
      preview:
        typeof v.result === "string"
          ? v.result.slice(0, 140).replace(/\n/g, " ")
          : v.message,
    };
  });

  console.log(
    JSON.stringify(
      {
        summary,
        total_ms: summary.reduce((a, b) => a + b.ms, 0),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
