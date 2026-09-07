import type { ChatChunk, ChatRequest, ChatResponse } from "@uag/sdk/provider";

import { ProviderRegistry } from "./registry.js";
import { Router } from "./router.js";
import type { TaskType } from "./types.js";

export type GatewayChatRequest = Omit<ChatRequest, "model"> & {
  model?: string;
};

export interface GatewayChatOptions {
  /** Prefer skipping these providers when healthier alternatives remain. */
  skipProviderIds?: ReadonlySet<string>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function orderPlans(
  plans: ReturnType<Router["route"]>,
  skipProviderIds?: ReadonlySet<string>
) {
  if (!skipProviderIds?.size) return plans;
  const preferred = plans.filter((plan) => !skipProviderIds.has(plan.providerId));
  const deferred = plans.filter((plan) => skipProviderIds.has(plan.providerId));
  // Keep unhealthy providers as last-resort fallbacks so we don't hard-fail
  // when every registered provider is temporarily marked unhealthy.
  return preferred.length > 0 ? [...preferred, ...deferred] : plans;
}

export class AIGateway {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly router: Router
  ) {}

  async chat(
    request: GatewayChatRequest,
    task: TaskType = "chat",
    options?: GatewayChatOptions
  ): Promise<ChatResponse> {
    const plans = orderPlans(this.router.route({ task }), options?.skipProviderIds);

    let lastError: unknown;

    for (const plan of plans) {
      const provider = this.registry.get(plan.providerId);

      try {
        return await provider.chat({
          ...request,
          model: request.model ?? plan.model,
        });
      } catch (error) {
        lastError = error;
        console.warn(
          `[Gateway Fallback] Model ${plan.model} (${plan.providerId}) failed, trying next...`
        );
      }
    }

    throw new Error(
      `All providers failed for task '${task}'. Last error: ${errorMessage(lastError)}`
    );
  }

  async *streamChat(
    request: GatewayChatRequest,
    task: TaskType = "chat",
    options?: GatewayChatOptions
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const plans = orderPlans(this.router.route({ task }), options?.skipProviderIds);

    let lastError: unknown;

    for (const plan of plans) {
      const provider = this.registry.get(plan.providerId);
      const iterator = provider.streamChat({
        ...request,
        model: request.model ?? plan.model,
      });

      let first: IteratorResult<ChatChunk, void>;

      try {
        first = await iterator.next();
      } catch (error) {
        lastError = error;
        console.warn(
          `[Gateway Fallback] Model ${plan.model} (${plan.providerId}) failed, trying next...`
        );
        continue;
      }

      if (!first.done) {
        yield first.value;
      }

      yield* iterator;
      return;
    }

    throw new Error(
      `All providers failed for task '${task}'. Last error: ${errorMessage(lastError)}`
    );
  }
}
