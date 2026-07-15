import { describe, expect, it, vi } from "vitest";

import { OpenRouterProvider } from "./provider.js";

function makeClient(chatImpl: (body: unknown) => Promise<unknown>) {
  return { chat: vi.fn(chatImpl), chatStream: vi.fn() } as any;
}

describe("OpenRouterProvider.chat", () => {
  it("propagates finish_reason as finishReason", async () => {
    const client = makeClient(async () => ({
      model: "openai/gpt-oss-120b",
      choices: [{ message: { content: "hi" }, finish_reason: "length" }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    }));

    const provider = new OpenRouterProvider(client);
    const response = await provider.chat({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.finishReason).toBe("length");
  });

  it("leaves finishReason undefined when the provider omits it", async () => {
    const client = makeClient(async () => ({
      model: "m",
      choices: [{ message: { content: "hi" } }],
    }));

    const provider = new OpenRouterProvider(client);
    const response = await provider.chat({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.finishReason).toBeUndefined();
  });
});
