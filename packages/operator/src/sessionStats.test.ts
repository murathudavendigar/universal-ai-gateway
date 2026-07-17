import { describe, expect, it } from "vitest";

import { SessionStats } from "./sessionStats.js";

describe("SessionStats", () => {
  it("starts at zero", () => {
    const stats = new SessionStats();
    expect(stats.snapshot()).toEqual({
      totalRequestsDelegated: 0,
      totalTokensSaved: 0,
    });
  });

  it("recordSuccess increments both counters together and returns the new snapshot", () => {
    const stats = new SessionStats();

    const snap1 = stats.recordSuccess(100);
    expect(snap1).toEqual({ totalRequestsDelegated: 1, totalTokensSaved: 100 });

    const snap2 = stats.recordSuccess(50);
    expect(snap2).toEqual({ totalRequestsDelegated: 2, totalTokensSaved: 150 });
  });

  it("snapshot() always reflects the same state recordSuccess last returned", () => {
    const stats = new SessionStats();
    stats.recordSuccess(10);
    stats.recordSuccess(20);
    expect(stats.snapshot()).toEqual({ totalRequestsDelegated: 2, totalTokensSaved: 30 });
  });
});
