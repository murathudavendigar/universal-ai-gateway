import { describe, expect, it } from "vitest";

import { withTimeout } from "./timeout.js";

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("withTimeout", () => {
  it("resolves with the value when the promise settles before the deadline", async () => {
    const result = await withTimeout(delay("done", 10), 200);
    expect(result).toEqual({ timedOut: false, value: "done" });
  });

  it("reports timedOut when the promise is slower than the deadline", async () => {
    const result = await withTimeout(delay("done", 200), 10);
    expect(result).toEqual({ timedOut: true });
  });

  it("propagates rejection when the promise rejects before the deadline", async () => {
    const rejected = Promise.reject(new Error("boom"));
    await expect(withTimeout(rejected, 200)).rejects.toThrow("boom");
  });
});
