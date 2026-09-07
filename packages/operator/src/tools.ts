import { randomUUID } from "node:crypto";

import type { ChatMessage, ChatResponse } from "@uag/sdk/provider";
import type { GatewayChatRequest, TaskType } from "@uag/core";

import { chatWithContinuation } from "./continuation.js";
import { screenPrompt } from "./moderation.js";
import { validateModel } from "./modelValidation.js";
import type { SessionStats } from "./sessionStats.js";
import type { TaskRegistry } from "./taskRegistry.js";
import { withTimeoutAndProgress } from "./timeout.js";
import {
  computeTokensSaved,
  TOKENS_SAVED_CALCULATION_METHOD,
  TOKENS_SAVED_EXPLANATION,
} from "./tokensSaved.js";

export interface DelegateTaskArgs {
  prompt: string;
  intent: TaskType;
  specific_model?: string;
  request_id?: string;
  /** Optional multi-turn history. When set, replaces the single-prompt message list. */
  messages?: ChatMessage[];
}

export interface DelegateTaskContext {
  reportProgress?: (progress: { progress: number; total?: number }) => Promise<void>;
  log?: {
    info: (message: string) => void;
  };
}

export interface DelegateTaskDeps {
  chat: (request: GatewayChatRequest, task: TaskType) => Promise<ChatResponse>;
  sessionStats: SessionStats;
  taskRegistry: TaskRegistry;
  knownModels: ReadonlySet<string>;
  timeoutMs: number;
  generateRequestId?: () => string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildMessages(args: DelegateTaskArgs): ChatMessage[] {
  if (args.messages && args.messages.length > 0) {
    return args.messages.map((message) => ({
      role: message.role,
      content: String(message.content ?? ""),
    }));
  }
  return [{ role: "user", content: args.prompt }];
}

function moderationText(args: DelegateTaskArgs, messages: ChatMessage[]): string {
  const userBits = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  return userBits || args.prompt;
}

export function createDelegateTaskHandler(deps: DelegateTaskDeps) {
  const generateId = deps.generateRequestId ?? randomUUID;

  return async function delegateTask(
    args: DelegateTaskArgs,
    ctx?: DelegateTaskContext
  ): Promise<string> {
    const messages = buildMessages(args);
    if (messages.length === 0 || !messages.some((m) => m.content.trim())) {
      return JSON.stringify({
        status: "error",
        message: "prompt or messages with content are required.",
      });
    }

    const moderation = screenPrompt(moderationText(args, messages));
    if (!moderation.allowed) {
      return JSON.stringify({
        status: "blocked",
        reason: moderation.reason,
        message: "Request blocked by the gateway's input moderation layer.",
      });
    }

    const modelCheck = validateModel(args.specific_model, deps.knownModels);
    if (!modelCheck.valid) {
      return JSON.stringify({ status: "error", message: modelCheck.error });
    }

    const requestId = args.request_id ?? generateId();
    const existing = deps.taskRegistry.get(requestId);

    if (existing?.status === "success") {
      return JSON.stringify({
        ...(existing.result as Record<string, unknown>),
        request_id: requestId,
        cached: true,
      });
    }

    if (existing?.status === "pending") {
      return JSON.stringify({
        status: "pending",
        request_id: requestId,
        message:
          "This request_id is already being processed. Call get_task_result to check on it.",
      });
    }

    const previewSource =
      args.prompt?.trim() ||
      [...messages].reverse().find((m) => m.role === "user")?.content ||
      "";

    deps.taskRegistry.create(requestId, {
      promptPreview: previewSource.slice(0, 200),
      intent: args.intent,
      model: args.specific_model,
    });

    const dispatched = chatWithContinuation(
      (req) => deps.chat({ messages: req.messages, model: req.model }, args.intent),
      { messages, model: args.specific_model }
    )
      .then((continuationResult) => {
        const tokensSaved = computeTokensSaved(continuationResult.response.usage);
        const stats = deps.sessionStats.recordSuccess(tokensSaved);

        const truncationWarning = continuationResult.truncated
          ? `\n⚠️ **Truncated:** The downstream response hit its output limit ` +
            `(${continuationResult.truncationReason}). Content may be incomplete even after automatic continuation.`
          : "";

        const footer =
          `\n\n---\n💡 **UAG Stats:** This delegation saved ~${tokensSaved} tokens. ` +
          `Session total: ${stats.totalTokensSaved} tokens saved over ${stats.totalRequestsDelegated} requests.` +
          truncationWarning;

        const payload = {
          status: "success" as const,
          request_id: requestId,
          provider_used: continuationResult.response.provider,
          model_used: continuationResult.response.model,
          tokens_saved: tokensSaved,
          calculation_method: TOKENS_SAVED_CALCULATION_METHOD,
          calculation_note: TOKENS_SAVED_EXPLANATION,
          truncated: continuationResult.truncated,
          ...(continuationResult.truncationReason
            ? { truncation_reason: continuationResult.truncationReason }
            : {}),
          result: continuationResult.response.content + footer,
        };

        deps.taskRegistry.markSuccess(requestId, payload);
        return payload;
      })
      .catch((error: unknown) => {
        deps.taskRegistry.markError(requestId, errorMessage(error));
        throw error;
      });

    try {
      const progressTotalSec = Math.ceil(deps.timeoutMs / 1000);

      const raced = await withTimeoutAndProgress(
        dispatched,
        deps.timeoutMs,
        async ({ elapsedMs }) => {
          const elapsedSec = Math.floor(elapsedMs / 1000);
          await ctx?.reportProgress?.({ progress: elapsedSec, total: progressTotalSec });
          if (elapsedSec === 0) {
            ctx?.log?.info(
              "[UAG] Delegating to downstream model. Free models may take 3-4 minutes — waiting for response..."
            );
            return;
          }

          ctx?.log?.info(
            `[UAG] Still processing downstream model (${elapsedSec}s elapsed, timeout ${progressTotalSec}s)...`
          );
        }
      );

      if (raced.timedOut) {
        deps.taskRegistry.markTimeout(requestId);
        ctx?.log?.info(
          `[UAG] Delegate call timed out after ${deps.timeoutMs}ms, but the downstream request may still finish. ` +
            `Use get_task_result with request_id "${requestId}".`
        );
        return JSON.stringify({
          status: "timeout",
          request_id: requestId,
          message:
            `The request timed out after ${deps.timeoutMs}ms but may still complete in the background. ` +
            `Free models can take 3-4 minutes. Call get_task_result with request_id "${requestId}" to check whether it succeeded.`,
        });
      }

      return JSON.stringify(raced.value);
    } catch (error: unknown) {
      return JSON.stringify({
        status: "error",
        request_id: requestId,
        message: errorMessage(error),
      });
    }
  };
}

export interface GetSessionStatsDeps {
  sessionStats: SessionStats;
}

export function createGetSessionStatsHandler(deps: GetSessionStatsDeps) {
  return async function getSessionStats(): Promise<string> {
    const stats = deps.sessionStats.snapshot();
    return JSON.stringify({
      status: "success",
      stats,
      calculation_method: TOKENS_SAVED_CALCULATION_METHOD,
      calculation_note: TOKENS_SAVED_EXPLANATION,
      message: `You have saved ${stats.totalTokensSaved} tokens over ${stats.totalRequestsDelegated} requests in this session.`,
    });
  };
}

export interface HealthCheckProvider {
  name: string;
  health(): Promise<boolean>;
  listModels(): Promise<string[]>;
}

export interface HealthCheckDeps {
  providers: HealthCheckProvider[];
}

export function createHealthHandler(deps: HealthCheckDeps) {
  return async function health(): Promise<string> {
    const checks = await Promise.all(
      deps.providers.map(async (provider) => {
        try {
          const healthy = await provider.health();
          const models = healthy ? await provider.listModels() : [];
          return {
            id: provider.name,
            healthy,
            model_count: models.length,
          };
        } catch {
          return {
            id: provider.name,
            healthy: false,
            model_count: 0,
          };
        }
      })
    );

    const healthyCount = checks.filter((check) => check.healthy).length;

    return JSON.stringify({
      status: healthyCount > 0 ? "ok" : "degraded",
      gateway: "Universal AI Gateway",
      providers: checks,
      message:
        healthyCount > 0
          ? `${healthyCount}/${checks.length} provider(s) healthy.`
          : "No providers are currently healthy.",
    });
  };
}

export interface GetTaskResultDeps {
  taskRegistry: TaskRegistry;
}

export function createGetTaskResultHandler(deps: GetTaskResultDeps) {
  return async function getTaskResult(requestId: string): Promise<string> {
    const record = deps.taskRegistry.get(requestId);
    if (!record) {
      return JSON.stringify({
        status: "not_found",
        request_id: requestId,
        message: "No task found for this request_id.",
      });
    }

    return JSON.stringify({
      status: record.status,
      request_id: requestId,
      elapsed_ms: Date.now() - record.createdAt,
      ...(record.status === "pending" || record.status === "timeout"
        ? {
            message:
              record.status === "pending"
                ? "Downstream model is still processing. Free models may take 3-4 minutes."
                : "The delegate call timed out, but the downstream request may still complete. Poll again with get_task_result.",
          }
        : {}),
      result: record.result,
      error: record.error,
    });
  };
}
