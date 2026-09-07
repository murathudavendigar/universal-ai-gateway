#!/usr/bin/env node
import { config } from "dotenv";
import { FastMCP } from "fastmcp";
import { dirname, resolve } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import {
  buildKnownModelSet,
  createDelegateTaskHandler,
  createGetSessionStatsHandler,
  createGetTaskResultHandler,
  createHealthHandler,
  createListRoutingHandler,
  DELEGATE_TASK_TOOL_DESCRIPTION,
  SessionStats,
  TaskRegistry,
} from "@uag/operator";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

process.env.DOTENV_QUIET = "true";
process.env.DOTENVX_QUIET = "true";

process.env.DOTENV_QUIET = "true";
process.env.DOTENVX_QUIET = "true";

// Prefer env already set by the MCP host; otherwise load repo / cwd .env files.
if (!env.OPENROUTER_API_KEY && !env.NVIDIA_API_KEY) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(here, "../../../.env"),
    resolve(here, "../../../../.env"),
  ];
  for (const path of candidates) {
    config({ path, quiet: true } as any);
    if (env.OPENROUTER_API_KEY || env.NVIDIA_API_KEY) break;
  }
}

if (!env.OPENROUTER_API_KEY && !env.NVIDIA_API_KEY) {
  console.error(
    "Error: At least one of OPENROUTER_API_KEY or NVIDIA_API_KEY is required. " +
      "Set them in your environment or a local .env file.",
  );
  process.exit(1);
}

const registry = new ProviderRegistry();
const router = new Router();

if (env.OPENROUTER_API_KEY) {
  registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY));
}

if (env.NVIDIA_API_KEY) {
  registry.register(createNvidiaProvider(env.NVIDIA_API_KEY));
}

if (registry.list().length === 0) {
  console.error("Error: No providers could be registered.");
  process.exit(1);
}

const gateway = new AIGateway(registry, router);

const sessionStats = new SessionStats();
const taskRegistry = new TaskRegistry();
const knownModels = await buildKnownModelSet(registry.list(), router);
const timeoutMs = Number(env.UAG_DELEGATE_TIMEOUT_MS ?? 300_000);

const delegateTask = createDelegateTaskHandler({
  chat: (request, task) => gateway.chat(request, task),
  sessionStats,
  taskRegistry,
  knownModels,
  timeoutMs,
});
const getSessionStats = createGetSessionStatsHandler({ sessionStats });
const getTaskResult = createGetTaskResultHandler({ taskRegistry });
const health = createHealthHandler({ providers: registry.list() });
const listRouting = createListRoutingHandler({ router, knownModels });

const server = new FastMCP({
  name: "Universal AI Gateway",
  version: "0.1.0",
});

server.addTool({
  name: "health",
  description:
    "Checks whether the gateway and its registered providers are healthy. " +
    "Call before heavy delegation if a previous request failed with provider errors.",
  parameters: z.object({}),
  execute: async () => health(),
});

server.addTool({
  name: "list_routing",
  description:
    "Returns intent→model fallback chains, known model IDs, and guidance for when to use " +
    "coding vs reasoning and when (rarely) to set specific_model. " +
    "Call this when unsure which model or intent to pick before delegate_task.",
  parameters: z.object({}),
  execute: async () => listRouting(),
});

server.addTool({
  name: "get_session_stats",
  description:
    "Returns the total tokens saved and requests delegated during the current session.",
  parameters: z.object({}),
  execute: async () => getSessionStats(),
});

server.addTool({
  name: "get_task_result",
  description:
    "Given a request_id returned by delegate_task, returns the current status " +
    "(pending/success/error/timeout) and the result if available. Use this after " +
    "a delegate_task call times out to check whether the downstream request actually completed.",
  parameters: z.object({
    request_id: z.string().describe("The request_id returned by a prior delegate_task call."),
  }),
  execute: async (args) => getTaskResult(args.request_id),
});

server.addTool({
  name: "delegate_task",
  description: DELEGATE_TASK_TOOL_DESCRIPTION,
  parameters: z.object({
    prompt: z
      .string()
      .describe(
        "Self-contained instruction for the submodel. Include all context inline — " +
          "the downstream model cannot read the repo.",
      ),
    intent: z
      .enum(["coding", "reasoning"])
      .describe(
        "coding = generate/transform code drafts; reasoning = analysis, comparisons, trade-offs, math. " +
          "Router picks the fallback chain from this intent.",
      ),
    specific_model: z
      .string()
      .optional()
      .describe(
        "Optional override. Prefer omitting (auto-route). Only set to a model ID from list_routing " +
          "(e.g. openai/gpt-oss-120b for coding speed, nvidia/nemotron-3-ultra-550b-a55b for hard reasoning). " +
          "Do not invent IDs.",
      ),
    request_id: z
      .string()
      .optional()
      .describe(
        "Optional idempotency key. Reusing the same request_id from a prior call replays its cached result instead of dispatching a duplicate request.",
      ),
  }),
  timeoutMs: timeoutMs + 30_000,
  execute: async (args, ctx) =>
    delegateTask(args, {
      reportProgress: ctx.reportProgress,
      log: ctx.log,
    }),
});

await server.start({
  transportType: "stdio",
});
