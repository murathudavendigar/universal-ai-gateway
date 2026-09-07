import { describe, expect, it, vi } from "vitest";

import { AIGateway } from "./gateway.js";
import { ProviderRegistry } from "./registry.js";
import { Router } from "./router.js";

describe("AIGateway health-aware ordering", () => {
  it("prefers healthy providers before deferred unhealthy ones", async () => {
    const registry = new ProviderRegistry();
    const healthy = {
      name: "openrouter",
      async chat() {
        return {
          provider: "openrouter",
          model: "openai/gpt-oss-120b",
          content: "from-openrouter",
          finishReason: "stop",
        };
      },
      async *streamChat() {},
      async listModels() {
        return [];
      },
      async health() {
        return true;
      },
    };
    const unhealthy = {
      name: "nvidia",
      async chat() {
        throw new Error("should be deferred");
      },
      async *streamChat() {},
      async listModels() {
        return [];
      },
      async health() {
        return false;
      },
    };

    registry.register(healthy as any);
    registry.register(unhealthy as any);

    const gateway = new AIGateway(registry, new Router());
    const chatSpy = vi.spyOn(healthy, "chat");

    const response = await gateway.chat(
      { messages: [{ role: "user", content: "hi" }] },
      "coding",
      { skipProviderIds: new Set(["nvidia"]) }
    );

    expect(response.content).toBe("from-openrouter");
    expect(chatSpy).toHaveBeenCalled();
  });
});
