import { describe, expect, it } from "vitest";

import { rejectLowQualityResponse } from "./responseQuality.js";

const base = { provider: "p", model: "m" };

describe("rejectLowQualityResponse", () => {
  it("rejects empty and whitespace-only content", () => {
    expect(rejectLowQualityResponse({ ...base, content: "" })).toBe("empty response");
    expect(rejectLowQualityResponse({ ...base, content: " \n\t" })).toBe("empty response");
  });

  it("rejects content-filtered completions", () => {
    expect(
      rejectLowQualityResponse({ ...base, content: "partial", finishReason: "content_filter" })
    ).toMatch(/content filter/);
  });

  it("accepts normal and truncated responses", () => {
    expect(rejectLowQualityResponse({ ...base, content: "hi", finishReason: "stop" })).toBeNull();
    expect(rejectLowQualityResponse({ ...base, content: "hi", finishReason: "length" })).toBeNull();
  });
});
