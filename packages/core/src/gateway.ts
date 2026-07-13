import type { ChatChunk, ChatRequest, ChatResponse } from "@uag/sdk/provider";

import { ProviderRegistry } from "./registry.js";
import { Router } from "./router.js";
import type { TaskType } from "./types.js";

export type GatewayChatRequest = Omit<ChatRequest, "model"> & {
  model?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AIGateway {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly router: Router
  ) {}

  async chat(
    request: GatewayChatRequest,
    task: TaskType = "chat"
  ): Promise<ChatResponse> {
    const plans = this.router.route({ task });

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
    task: TaskType = "chat"
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const plans = this.router.route({ task });

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
