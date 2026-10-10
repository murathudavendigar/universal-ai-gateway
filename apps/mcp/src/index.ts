#!/usr/bin/env node
import { config } from "dotenv";
import { FastMCP } from "fastmcp";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import {
  buildKnownModelSet,
  createDelegateTaskHandler,
  createFileTaskPersistence,
  createGetSessionStatsHandler,
  createGetTaskResultHandler,
  createHealthHandler,
  createHealthMonitor,
  createListRoutingHandler,
  DELEGATE_TASK_TOOL_DESCRIPTION,
  MAX_OUTPUT_TOKENS,
  MAX_TEMPERATURE,
  SessionStats,
  TaskRegistry,
} from "@uag/operator";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

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

// Persist task history so get_task_result and request_id replay survive restarts.
// Disable with UAG_PERSIST_TASKS=0; relocate with UAG_DATA_DIR (default ~/.uag).
const taskPersistence =
  env.UAG_PERSIST_TASKS === "0"
    ? undefined
    : createFileTaskPersistence({
        filePath: join(env.UAG_DATA_DIR ?? join(homedir(), ".uag"), "tasks.json"),
        // stdout carries the MCP protocol; diagnostics must go to stderr.
        onError: (message, error) => console.error(`[UAG] ${message}:`, error),
      });
await taskPersistence?.attach(taskRegistry);

const healthMonitor = createHealthMonitor({ providers: registry.list() });
void healthMonitor.refresh();
const knownModels = await buildKnownModelSet(registry.list(), router);
const timeoutMs = Number(env.UAG_DELEGATE_TIMEOUT_MS ?? 300_000);

const delegateTask = createDelegateTaskHandler({
  chat: (request, task, options) =>
    gateway.chat(request, task, {
      ...options,
      skipProviderIds: healthMonitor.unhealthyProviders(),
    }),
  sessionStats,
  taskRegistry,
  knownModels,
  timeoutMs,
});
const getSessionStats = createGetSessionStatsHandler({ sessionStats });
const getTaskResult = createGetTaskResultHandler({ taskRegistry });
const health = createHealthHandler({ providers: registry.list() });
const listRouting = createListRoutingHandler({
  router,
  knownModels,
  unhealthyProviders: () => healthMonitor.unhealthyProviders(),
});

const pkgRequire = createRequire(import.meta.url);
const { version } = pkgRequire("../package.json") as { version: `${number}.${number}.${number}` };

const server = new FastMCP({
  name: "Universal AI Gateway",
  version,
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
      .optional()
      .describe(
        "Self-contained instruction for the submodel. Include all context inline — " +
          "the downstream model cannot read the repo. Required unless `messages` is provided.",
      ),
    system: z
      .string()
      .optional()
      .describe(
        "Optional system prompt (role, output format, constraints) prepended to the conversation.",
      ),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        }),
      )
      .optional()
      .describe(
        "Optional multi-turn history. When provided, it replaces `prompt`. " +
          "Use for few-shot examples or follow-ups on a prior delegation.",
      ),
    temperature: z
      .number()
      .min(0)
      .max(MAX_TEMPERATURE)
      .optional()
      .describe("Sampling temperature. Lower (0-0.3) for code, higher for brainstorming. Omit for the provider default."),
    max_tokens: z
      .number()
      .int()
      .min(1)
      .max(MAX_OUTPUT_TOKENS)
      .optional()
      .describe("Cap on output tokens per downstream call. Omit for the provider default."),
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

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await taskPersistence?.flush();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.stdin.once("close", () => void shutdown());

await server.start({
  transportType: "stdio",
});
