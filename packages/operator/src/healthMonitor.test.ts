import { describe, expect, it } from "vitest";

import { createHealthMonitor } from "./healthMonitor.js";

describe("createHealthMonitor", () => {
  it("reports unhealthy providers after refresh, treating throws as unhealthy", async () => {
    const monitor = createHealthMonitor({
      providers: [
        { name: "a", health: async () => true },
        { name: "b", health: async () => false },
        { name: "c", health: async () => { throw new Error("boom"); } },
      ],
    });

    await monitor.refresh();
    expect([...monitor.unhealthyProviders()].sort()).toEqual(["b", "c"]);
  });

  it("shares one in-flight check and refreshes in the background when stale", async () => {
    let calls = 0;
    let clock = 0;
    const monitor = createHealthMonitor({
      ttlMs: 100,
      now: () => clock,
      providers: [{ name: "a", health: async () => (++calls, true) }],
    });

    await Promise.all([monitor.refresh(), monitor.refresh()]);
    expect(calls).toBe(1);

    clock = 50;
    monitor.unhealthyProviders();
    expect(calls).toBe(1);

    clock = 500;
    monitor.unhealthyProviders();
    await monitor.refresh();
    expect(calls).toBe(2);
  });
});
