import type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
} from "@uag/sdk/provider";

import { OpenRouterClient } from "./client.js";
import { MODELS } from "./models.js";
import type { OpenRouterResponse, OpenRouterStreamChunk } from "./types.js";

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";

  constructor(private readonly client: OpenRouterClient) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = (await this.client.chat({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: request.stream ?? false,
    })) as OpenRouterResponse;

    return {
      provider: this.name,
      model: response.model,
      content: response.choices[0]?.message?.content ?? "",
      finishReason: response.choices[0]?.finish_reason ?? undefined,
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    };
  }

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const stream = this.client.chatStream({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });

    for await (const raw of stream) {
      let parsed: OpenRouterStreamChunk;

      try {
        parsed = JSON.parse(raw) as OpenRouterStreamChunk;
      } catch {
        continue;
      }

      const choice = parsed.choices?.[0];
      const finished = choice?.finish_reason != null;

      yield {
        provider: this.name,
        model: parsed.model ?? request.model,
        content: choice?.delta?.content ?? "",
        finishReason: choice?.finish_reason ?? undefined,
        done: finished,
        ...(finished && parsed.usage
          ? {
              usage: {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              },
            }
          : {}),
      };
    }
  }

  async listModels(): Promise<string[]> {
    return Object.values(MODELS);
  }

  async health(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
}

export function createOpenRouterProvider(apiKey: string) {
  return new OpenRouterProvider(new OpenRouterClient(apiKey));
}
