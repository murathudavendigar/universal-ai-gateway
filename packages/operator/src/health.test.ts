import { describe, expect, it } from "vitest";

import { createHealthHandler } from "./tools.js";

describe("health", () => {
  it("reports ok when at least one provider is healthy", async () => {
    const health = createHealthHandler({
      providers: [
        {
          name: "nvidia",
          health: async () => true,
          listModels: async () => ["model-a"],
        },
        {
          name: "openrouter",
          health: async () => false,
          listModels: async () => ["model-b"],
        },
      ],
    });

    const result = JSON.parse(await health());

    expect(result.status).toBe("ok");
    expect(result.providers).toEqual([
      { id: "nvidia", healthy: true, model_count: 1 },
      { id: "openrouter", healthy: false, model_count: 0 },
    ]);
  });

  it("reports degraded when every provider fails", async () => {
    const health = createHealthHandler({
      providers: [
        {
          name: "nvidia",
          health: async () => {
            throw new Error("down");
          },
          listModels: async () => [],
        },
      ],
    });

    const result = JSON.parse(await health());

    expect(result.status).toBe("degraded");
    expect(result.providers[0]).toEqual({ id: "nvidia", healthy: false, model_count: 0 });
  });
});
