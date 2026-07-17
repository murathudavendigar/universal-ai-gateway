import { describe, expect, it } from "vitest";

import { computeTokensSaved, TOKENS_SAVED_CALCULATION_METHOD, TOKENS_SAVED_EXPLANATION } from "./tokensSaved.js";

describe("computeTokensSaved", () => {
  it("returns usage.totalTokens when present", () => {
    expect(computeTokensSaved({ totalTokens: 42 })).toBe(42);
  });

  it("returns 0 when usage is missing", () => {
    expect(computeTokensSaved(undefined)).toBe(0);
  });

  it("returns 0 when totalTokens is missing", () => {
    expect(computeTokensSaved({})).toBe(0);
  });
});

describe("documentation constants", () => {
  it("are non-empty strings", () => {
    expect(TOKENS_SAVED_CALCULATION_METHOD.length).toBeGreaterThan(0);
    expect(TOKENS_SAVED_EXPLANATION.length).toBeGreaterThan(0);
  });
});
