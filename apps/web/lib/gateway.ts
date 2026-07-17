import "server-only";

import { config } from "dotenv";
import { env } from "node:process";
import path from "node:path";

import { AIGateway, ProviderRegistry, Router, type TaskType } from "@uag/core";
import {
  buildKnownModelSet,
  createDelegateTaskHandler,
  createGetSessionStatsHandler,
  createGetTaskResultHandler,
  createHealthHandler,
  SessionStats,
  TaskRegistry,
} from "@uag/operator";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

import { loadTasksFromDisk, saveTasksToDisk } from "./taskStore";

export const TASK_TYPES: TaskType[] = [
  "chat",
  "coding",
  "reasoning",
  "documentation",
  "review",
];

type GatewayRuntime = {
  router: Router;
  registry: ProviderRegistry;
  taskRegistry: TaskRegistry;
  sessionStats: SessionStats;
  knownModels: ReadonlySet<string>;
  timeoutMs: number;
  delegateTask: ReturnType<typeof createDelegateTaskHandler>;
  getSessionStats: ReturnType<typeof createGetSessionStatsHandler>;
  getTaskResult: ReturnType<typeof createGetTaskResultHandler>;
  health: ReturnType<typeof createHealthHandler>;
};

const globalForGateway = globalThis as typeof globalThis & {
  __uagGatewayPromise?: Promise<GatewayRuntime>;
};

function loadEnv(): void {
  if (env.OPENROUTER_API_KEY || env.NVIDIA_API_KEY) return;

  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "../../.env"),
  ];

  for (const filePath of candidates) {
    config({ path: filePath, quiet: true } as Parameters<typeof config>[0]);
    if (env.OPENROUTER_API_KEY || env.NVIDIA_API_KEY) return;
  }
}

async function createRuntime(): Promise<GatewayRuntime> {
  loadEnv();

  if (!env.OPENROUTER_API_KEY && !env.NVIDIA_API_KEY) {
    throw new Error(
      "At least one of OPENROUTER_API_KEY or NVIDIA_API_KEY is required. " +
        "Set them in the environment or a local .env file."
    );
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
    throw new Error("No providers could be registered.");
  }

  const gateway = new AIGateway(registry, router);
  const sessionStats = new SessionStats();

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  const schedulePersist = (taskRegistry: TaskRegistry) => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void saveTasksToDisk(taskRegistry);
    }, 250);
  };

  const taskRegistry = new TaskRegistry({
    maxSize: 200,
    onChange: () => schedulePersist(taskRegistry),
  });

  const persisted = await loadTasksFromDisk();
  if (persisted.length > 0) {
    taskRegistry.hydrate(persisted);
  }

  const knownModels = await buildKnownModelSet(registry.list(), router);
  const timeoutMs = Number(env.UAG_DELEGATE_TIMEOUT_MS ?? 300_000);

  const delegateTask = createDelegateTaskHandler({
    chat: (request, task) => gateway.chat(request, task),
    sessionStats,
    taskRegistry,
    knownModels,
    timeoutMs,
  });

  return {
    router,
    registry,
    taskRegistry,
    sessionStats,
    knownModels,
    timeoutMs,
    delegateTask,
    getSessionStats: createGetSessionStatsHandler({ sessionStats }),
    getTaskResult: createGetTaskResultHandler({ taskRegistry }),
    health: createHealthHandler({ providers: registry.list() }),
  };
}

export function getGateway(): Promise<GatewayRuntime> {
  if (!globalForGateway.__uagGatewayPromise) {
    globalForGateway.__uagGatewayPromise = createRuntime().catch((error) => {
      globalForGateway.__uagGatewayPromise = undefined;
      throw error;
    });
  }
  return globalForGateway.__uagGatewayPromise;
}

/** Map operator handler status strings to HTTP status codes. */
export function httpStatusForPayload(payload: { status?: string }): number {
  switch (payload.status) {
    case "success":
    case "ok":
      return 200;
    case "pending":
    case "timeout":
      return 202;
    case "blocked":
    case "error":
    case "not_found":
      return payload.status === "not_found" ? 404 : 400;
    case "degraded":
      return 200;
    default:
      return 200;
  }
}

export function jsonFromHandler(raw: string): Response {
  const payload = JSON.parse(raw) as { status?: string };
  return Response.json(payload, { status: httpStatusForPayload(payload) });
}
