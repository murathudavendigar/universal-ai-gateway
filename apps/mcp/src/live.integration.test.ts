import { config } from "dotenv";
import { env } from "node:process";
import { describe, expect, it } from "vitest";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import {
  buildKnownModelSet,
  createDelegateTaskHandler,
  createHealthHandler,
} from "@uag/operator";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

config({ path: `${process.cwd()}/.env`, quiet: true } as any);

const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY);
const hasNvidia = Boolean(env.NVIDIA_API_KEY);
const canRunLive = (hasOpenRouter || hasNvidia) && env.UAG_RUN_LIVE_TESTS === "1";

function buildLiveDeps() {
  const registry = new ProviderRegistry();
  const router = new Router();

  if (hasOpenRouter) {
    registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
  }

  if (hasNvidia) {
    registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));
  }

  const gateway = new AIGateway(registry, router);

  return {
    registry,
    router,
    gateway,
  };
}

describe.skipIf(!canRunLive)("live gateway integration", () => {
  it("health reports provider status", async () => {
    const { registry } = buildLiveDeps();
    const health = createHealthHandler({ providers: registry.list() });
    const result = JSON.parse(await health());

    expect(["ok", "degraded"]).toContain(result.status);
    expect(result.providers.length).toBeGreaterThan(0);
    expect(result.providers.some((provider: { healthy: boolean }) => provider.healthy)).toBe(true);
  });

  it("accepts router models in specific_model validation", async () => {
    const { registry, router } = buildLiveDeps();
    const knownModels = await buildKnownModelSet(registry.list(), router);

    expect(knownModels.has("nvidia/nemotron-3-super-120b-a12b")).toBe(true);
  });

  it("delegates a short reasoning task end-to-end", async () => {
    const { registry, router, gateway } = buildLiveDeps();
    const knownModels = await buildKnownModelSet(registry.list(), router);
    const delegateTask = createDelegateTaskHandler({
      chat: (request, task) => gateway.chat(request, task),
      sessionStats: { recordSuccess: () => ({ totalRequestsDelegated: 1, totalTokensSaved: 1 }), snapshot: () => ({ totalRequestsDelegated: 1, totalTokensSaved: 1 }) } as any,
      taskRegistry: { create: () => ({}), get: () => undefined, markSuccess: () => {}, markError: () => {}, markTimeout: () => {} } as any,
      knownModels,
      timeoutMs: 60_000,
    });

    const raw = await delegateTask({
      prompt: "What is 9 + 9? Reply with only the number.",
      intent: "reasoning",
      request_id: `live-integration-${Date.now()}`,
    });
    const result = JSON.parse(raw);

    expect(result.status).toBe("success");
    expect(String(result.result)).toContain("18");
  }, 90_000);
});
