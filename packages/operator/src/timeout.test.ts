import { describe, expect, it } from "vitest";

import { withTimeout, withTimeoutAndProgress } from "./timeout.js";

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

describe("withTimeoutAndProgress", () => {
  it("emits progress ticks while waiting and still resolves on time", async () => {
    const ticks: number[] = [];

    const result = await withTimeoutAndProgress(
      delay("done", 35),
      200,
      ({ elapsedMs }) => {
        ticks.push(elapsedMs);
      },
      10
    );

    expect(result).toEqual({ timedOut: false, value: "done" });
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBe(0);
  });
});
