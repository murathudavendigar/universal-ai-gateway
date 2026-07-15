import { describe, expect, it } from "vitest";

import { buildKnownModelSet, validateModel } from "./modelValidation.js";

describe("validateModel", () => {
  const known = new Set(["nvidia/nemotron-3-super-120b-a12b", "openai/gpt-oss-120b"]);

  it("passes when no specific_model is requested", () => {
    expect(validateModel(undefined, known)).toEqual({ valid: true });
  });

  it("passes when the model is in the known set", () => {
    expect(validateModel("openai/gpt-oss-120b", known)).toEqual({ valid: true });
  });

  it("fails with a message listing valid models when the model is unknown", () => {
    const result = validateModel("made-up/model", known);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("made-up/model");
    expect(result.error).toContain("nvidia/nemotron-3-super-120b-a12b");
    expect(result.error).toContain("openai/gpt-oss-120b");
  });
});

describe("buildKnownModelSet", () => {
  it("unions listModels() across all providers", async () => {
    const providers = [
      { listModels: async () => ["a", "b"] },
      { listModels: async () => ["b", "c"] },
    ];
    const set = await buildKnownModelSet(providers);
    expect([...set].sort()).toEqual(["a", "b", "c"]);
  });

  it("also includes models exposed by the router", async () => {
    const providers = [{ listModels: async () => ["provider/model"] }];
    const router = { listRoutableModels: () => ["router/model", "provider/model"] };
    const set = await buildKnownModelSet(providers, router);
    expect([...set].sort()).toEqual(["provider/model", "router/model"]);
  });
});
