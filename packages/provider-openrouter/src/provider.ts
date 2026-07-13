import type { AIProvider, ChatRequest, ChatResponse } from "@uag/sdk/provider";

import { OpenRouterClient } from "./client.js";
import { MODELS } from "./models.js";
import type { OpenRouterResponse } from "./types.js";

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
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    };
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
