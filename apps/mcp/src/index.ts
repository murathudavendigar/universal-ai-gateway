#!/usr/bin/env node
import { config } from "dotenv";
import { FastMCP } from "fastmcp";
import { env } from "node:process";
import { z } from "zod";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

import { buildKnownModelSet } from "./modelValidation.js";
import { SessionStats } from "./sessionStats.js";
import { TaskRegistry } from "./taskRegistry.js";
import {
  createDelegateTaskHandler,
  createGetSessionStatsHandler,
  createGetTaskResultHandler,
} from "./tools.js";

process.env.DOTENV_QUIET = "true";
process.env.DOTENVX_QUIET = "true";

// Fall back to a .env file in the user's current directory if the
// required keys are not already present in the environment.
if (!env.OPENROUTER_API_KEY || !env.NVIDIA_API_KEY) {
  config({
    path: `${process.cwd()}/.env`,
    quiet: true,
  } as any);
}

if (!env.OPENROUTER_API_KEY || !env.NVIDIA_API_KEY) {
  console.error(
    "Error: NVIDIA_API_KEY or OPENROUTER_API_KEY is missing. Please set them in your environment or a local .env file.",
  );
  process.exit(1);
}

// Register the providers used by the gateway.
const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));

// Wire the registry into the gateway router.
const gateway = new AIGateway(registry, new Router());

const sessionStats = new SessionStats();
const taskRegistry = new TaskRegistry();
const knownModels = await buildKnownModelSet(registry.list());
const timeoutMs = Number(env.UAG_DELEGATE_TIMEOUT_MS ?? 55000);

const delegateTask = createDelegateTaskHandler({
  chat: (request, task) => gateway.chat(request, task),
  sessionStats,
  taskRegistry,
  knownModels,
  timeoutMs,
});
const getSessionStats = createGetSessionStatsHandler({ sessionStats });
const getTaskResult = createGetTaskResultHandler({ taskRegistry });

const server = new FastMCP({
  name: "Universal AI Gateway",
  version: "0.1.0",
});

server.addTool({
  name: "health",
  description: "Gateway sisteminin calisip calismadigini kontrol eder.",
  parameters: z.object({}),
  execute: async () => {
    return JSON.stringify({ status: "ok", gateway: "Universal AI Gateway" });
  },
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
  description:
    "Delegates coding or reasoning tasks through the gateway to save primary token usage.",
  parameters: z.object({
    prompt: z
      .string()
      .describe("Detailed task or coding instruction to send to the submodel."),
    intent: z
      .enum(["coding", "reasoning"])
      .describe("Task type. The router uses this to choose the model."),
    specific_model: z
      .string()
      .optional()
      .describe(
        "Optional. Explicitly request a specific model (e.g., 'deepseek-ai/deepseek-v4-flash'). If omitted, the gateway will auto-route.",
      ),
    request_id: z
      .string()
      .optional()
      .describe(
        "Optional idempotency key. Reusing the same request_id from a prior call replays its cached result instead of dispatching a duplicate request.",
      ),
  }),
  execute: async (args) => delegateTask(args),
});

// Start the server over stdio.
await server.start({
  transportType: "stdio",
});
