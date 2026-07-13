import type { ChatRequest, ChatResponse } from "@uag/sdk/provider";

import { ProviderRegistry } from "./registry.js";
import { Router } from "./router.js";

export class AIGateway {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly router: Router
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const providerName = this.router.route({ task: "chat" });
    const provider = this.registry.get(providerName);

    return provider.chat(request);
  }
}
