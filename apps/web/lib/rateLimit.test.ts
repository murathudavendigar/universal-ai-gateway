import { describe, expect, it } from "vitest";

import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  it("allows traffic under the limit and blocks after", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });
});
