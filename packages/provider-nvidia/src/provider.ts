import type { AIProvider, ChatRequest, ChatResponse } from "@uag/sdk/provider";

import { NvidiaClient } from "./client.js";
import { MODELS } from "./models.js";
import type { NvidiaResponse } from "./types.js";

export class NvidiaProvider implements AIProvider {
  readonly name = "nvidia";

  constructor(private readonly client: NvidiaClient) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = (await this.client.chat({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: request.stream ?? false,
    })) as NvidiaResponse;

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

export function createNvidiaProvider(apiKey: string) {
  return new NvidiaProvider(new NvidiaClient(apiKey));
}
