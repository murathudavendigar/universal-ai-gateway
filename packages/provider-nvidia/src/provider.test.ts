import { describe, expect, it, vi } from "vitest";

import { NvidiaProvider } from "./provider.js";

function makeClient(chatImpl: (body: unknown) => Promise<unknown>) {
  return { chat: vi.fn(chatImpl), chatStream: vi.fn() } as any;
}

describe("NvidiaProvider.chat", () => {
  it("propagates finish_reason as finishReason", async () => {
    const client = makeClient(async () => ({
      model: "nvidia/nemotron-3-super-120b-a12b",
      choices: [{ message: { content: "hi" }, finish_reason: "length" }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    }));

    const provider = new NvidiaProvider(client);
    const response = await provider.chat({
      model: "nvidia/nemotron-3-super-120b-a12b",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.finishReason).toBe("length");
  });

  it("leaves finishReason undefined when the provider omits it", async () => {
    const client = makeClient(async () => ({
      model: "m",
      choices: [{ message: { content: "hi" } }],
    }));

    const provider = new NvidiaProvider(client);
    const response = await provider.chat({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.finishReason).toBeUndefined();
  });
});
