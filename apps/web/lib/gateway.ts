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
  unhealthyProviders: () => ReadonlySet<string>;
  refreshHealthCache: () => Promise<void>;
  delegateTask: ReturnType<typeof createDelegateTaskHandler>;
  getSessionStats: ReturnType<typeof createGetSessionStatsHandler>;
  getTaskResult: ReturnType<typeof createGetTaskResultHandler>;
  health: ReturnType<typeof createHealthHandler>;
};

const globalForGateway = globalThis as typeof globalThis & {
  __uagGatewayPromise?: Promise<GatewayRuntime>;
  __uagUnhealthyProviders?: Set<string>;
  __uagHealthCheckedAt?: number;
};

function loadEnv(): void {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "../../.env"),
  ];

  for (const filePath of candidates) {
    config({ path: filePath, quiet: true } as Parameters<typeof config>[0]);
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
  const health = createHealthHandler({ providers: registry.list() });

  const refreshHealthCache = async () => {
    try {
      const payload = JSON.parse(await health()) as {
        providers?: Array<{ id: string; healthy: boolean }>;
      };
      const unhealthy = new Set<string>();
      for (const provider of payload.providers ?? []) {
        if (!provider.healthy) unhealthy.add(provider.id);
      }
      globalForGateway.__uagUnhealthyProviders = unhealthy;
      globalForGateway.__uagHealthCheckedAt = Date.now();
    } catch {
      /* keep previous cache */
    }
  };

  const unhealthyProviders = () =>
    globalForGateway.__uagUnhealthyProviders ?? new Set<string>();

  // Warm health cache without blocking startup forever.
  void refreshHealthCache();

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
    chat: async (request, task) => {
      const checkedAt = globalForGateway.__uagHealthCheckedAt ?? 0;
      if (Date.now() - checkedAt > 60_000) {
        void refreshHealthCache();
      }
      return gateway.chat(request, task, {
        skipProviderIds: unhealthyProviders(),
      });
    },
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
    unhealthyProviders,
    refreshHealthCache,
    delegateTask,
    getSessionStats: createGetSessionStatsHandler({ sessionStats }),
    getTaskResult: createGetTaskResultHandler({ taskRegistry }),
    health,
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
