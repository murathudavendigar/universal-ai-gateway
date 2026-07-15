import { describe, expect, it, vi } from "vitest";

import { chatWithContinuation } from "./continuation.js";

function response(content: string, finishReason?: string, totalTokens = 10) {
  return {
    provider: "nvidia",
    model: "m",
    content,
    finishReason,
    usage: { totalTokens },
  };
}

describe("chatWithContinuation", () => {
  it("returns the response untouched when it isn't truncated", async () => {
    const chat = vi.fn().mockResolvedValue(response("full answer", "stop"));
    const result = await chatWithContinuation(chat, { messages: [{ role: "user", content: "hi" }] });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.truncated).toBe(false);
    expect(result.continuations).toBe(0);
    expect(result.response.content).toBe("full answer");
  });

  it("automatically continues once and merges content when the model finishes on retry", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(response("part one, ", "length", 10))
      .mockResolvedValueOnce(response("part two.", "stop", 5));

    const result = await chatWithContinuation(chat, { messages: [{ role: "user", content: "hi" }] });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.truncated).toBe(false);
    expect(result.continuations).toBe(1);
    expect(result.response.content).toBe("part one, part two.");
    expect(result.response.usage?.totalTokens).toBe(15);
  });

  it("stops after maxContinuations and reports truncated:true if still cut off", async () => {
    const chat = vi.fn().mockResolvedValue(response("still going, ", "length", 10));

    const result = await chatWithContinuation(
      chat,
      { messages: [{ role: "user", content: "hi" }] },
      2
    );

    expect(chat).toHaveBeenCalledTimes(3); // initial + 2 continuations
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("length");
    expect(result.continuations).toBe(2);
  });
});
