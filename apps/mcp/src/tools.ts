import { randomUUID } from "node:crypto";

import type { ChatResponse } from "@uag/sdk/provider";
import type { GatewayChatRequest, TaskType } from "@uag/core";

import { chatWithContinuation } from "./continuation.js";
import { screenPrompt } from "./moderation.js";
import { validateModel } from "./modelValidation.js";
import type { SessionStats } from "./sessionStats.js";
import type { TaskRegistry } from "./taskRegistry.js";
import { withTimeout } from "./timeout.js";
import { computeTokensSaved, TOKENS_SAVED_CALCULATION_METHOD, TOKENS_SAVED_EXPLANATION } from "./tokensSaved.js";

export interface DelegateTaskArgs {
  prompt: string;
  intent: TaskType;
  specific_model?: string;
  request_id?: string;
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

export function createDelegateTaskHandler(deps: DelegateTaskDeps) {
  const generateId = deps.generateRequestId ?? randomUUID;

  return async function delegateTask(args: DelegateTaskArgs): Promise<string> {
    const moderation = screenPrompt(args.prompt);
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
      return JSON.stringify({ ...(existing.result as Record<string, unknown>), request_id: requestId, cached: true });
    }

    if (existing?.status === "pending") {
      return JSON.stringify({
        status: "pending",
        request_id: requestId,
        message: "This request_id is already being processed. Call get_task_result to check on it.",
      });
    }

    deps.taskRegistry.create(requestId);

    const dispatched = chatWithContinuation(
      (req) => deps.chat({ messages: req.messages, model: req.model }, args.intent),
      { messages: [{ role: "user", content: args.prompt }], model: args.specific_model }
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
      const raced = await withTimeout(dispatched, deps.timeoutMs);

      if (raced.timedOut) {
        return JSON.stringify({
          status: "timeout",
          request_id: requestId,
          message:
            `The request timed out after ${deps.timeoutMs}ms but may still complete in the background. ` +
            `Call get_task_result with request_id "${requestId}" to check whether it succeeded.`,
        });
      }

      return JSON.stringify(raced.value);
    } catch (error: unknown) {
      return JSON.stringify({ status: "error", request_id: requestId, message: errorMessage(error) });
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
      result: record.result,
      error: record.error,
    });
  };
}
