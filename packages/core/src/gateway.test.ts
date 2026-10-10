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

describe("AIGateway response validation", () => {
  function fakeProvider(name: string, content: string) {
    return {
      name,
      chat: vi.fn(async () => ({
        provider: name,
        model: `${name}-model`,
        content,
        finishReason: "stop",
      })),
      async *streamChat() {},
      async listModels() {
        return [];
      },
      async health() {
        return true;
      },
    };
  }

  it("falls through to the next plan when validateResponse rejects", async () => {
    const registry = new ProviderRegistry();
    const openrouter = fakeProvider("openrouter", "   ");
    const nvidia = fakeProvider("nvidia", "real answer");
    registry.register(openrouter as any);
    registry.register(nvidia as any);

    const gateway = new AIGateway(registry, new Router());
    const response = await gateway.chat(
      { messages: [{ role: "user", content: "hi" }] },
      "coding",
      { validateResponse: (r) => (r.content.trim() ? null : "empty") }
    );

    expect(response.content).toBe("real answer");
    expect(openrouter.chat).toHaveBeenCalledTimes(1);
    expect(nvidia.chat).toHaveBeenCalled();
  });

  it("throws with the rejection reason when every plan is rejected", async () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("openrouter", "") as any);
    registry.register(fakeProvider("nvidia", "") as any);

    const gateway = new AIGateway(registry, new Router());
    await expect(
      gateway.chat({ messages: [{ role: "user", content: "hi" }] }, "coding", {
        validateResponse: () => "empty",
      })
    ).rejects.toThrow(/Response rejected: empty/);
  });
});

describe("AIGateway with partially registered providers", () => {
  it("skips plans for unregistered providers and surfaces the real provider error", async () => {
    const registry = new ProviderRegistry();
    registry.register({
      name: "openrouter",
      chat: async () => {
        throw new Error("401 Missing Authentication header");
      },
      async *streamChat() {},
      async listModels() {
        return [];
      },
      async health() {
        return true;
      },
    } as any);

    const gateway = new AIGateway(registry, new Router());
    await expect(
      gateway.chat({ messages: [{ role: "user", content: "hi" }] }, "coding")
    ).rejects.toThrow(/401 Missing Authentication header/);
  });
});
