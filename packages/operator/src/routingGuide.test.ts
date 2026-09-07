import { describe, expect, it } from "vitest";

import { Router } from "@uag/core";

import { createListRoutingHandler } from "./routingGuide.js";

describe("createListRoutingHandler", () => {
  it("returns chains, models, and agent guidance", async () => {
    const router = new Router();
    const listRouting = createListRoutingHandler({
      router,
      knownModels: new Set(["openai/gpt-oss-120b", "extra/model"]),
    });

    const payload = JSON.parse(await listRouting());

    expect(payload.status).toBe("success");
    expect(payload.guidance.specific_model_policy).toContain("Omit specific_model");
    expect(payload.chains.find((c: { task: string }) => c.task === "coding")?.plans[0]?.model).toBe(
      "openai/gpt-oss-120b"
    );
    expect(
      payload.chains.find((c: { task: string }) => c.task === "coding")?.mcp_delegate_supported
    ).toBe(true);
    expect(
      payload.chains.find((c: { task: string }) => c.task === "documentation")
        ?.mcp_delegate_supported
    ).toBe(false);
    expect(payload.models).toContain("openai/gpt-oss-120b");
    expect(payload.models).toContain("extra/model");
  });
});
