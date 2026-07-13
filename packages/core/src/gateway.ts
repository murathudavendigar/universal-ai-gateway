import type { ChatRequest, ChatResponse } from "@uag/sdk/provider";

import { ProviderRegistry } from "./registry.js";
import { Router } from "./router.js";
import type { TaskType } from "./types.js";

export type GatewayChatRequest = Omit<ChatRequest, "model"> & {
  model?: string;
};

export class AIGateway {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly router: Router
  ) {}

  async chat(
    request: GatewayChatRequest,
    task: TaskType = "chat"
  ): Promise<ChatResponse> {
    const route = this.router.route({ task });
    const provider = this.registry.get(route.provider);

    return provider.chat({
      ...request,
      model: request.model ?? route.model,
    });
  }
}
