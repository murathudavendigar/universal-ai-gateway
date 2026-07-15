import { describe, expect, it } from "vitest";

import { TaskRegistry } from "./taskRegistry.js";

describe("TaskRegistry", () => {
  it("a freshly created task is pending", () => {
    const registry = new TaskRegistry();
    registry.create("req-1");
    expect(registry.get("req-1")?.status).toBe("pending");
  });

  it("create() is idempotent — calling it twice keeps the first record", () => {
    const registry = new TaskRegistry();
    registry.create("req-1");
    registry.markSuccess("req-1", { ok: true });
    registry.create("req-1");
    expect(registry.get("req-1")?.status).toBe("success");
  });

  it("markSuccess after markTimeout still reflects success (background completion)", () => {
    const registry = new TaskRegistry();
    registry.create("req-1");
    registry.markTimeout("req-1");
    expect(registry.get("req-1")?.status).toBe("timeout");

    registry.markSuccess("req-1", { ok: true });
    expect(registry.get("req-1")?.status).toBe("success");
    expect(registry.get("req-1")?.result).toEqual({ ok: true });
  });

  it("markError never downgrades an already-successful task", () => {
    const registry = new TaskRegistry();
    registry.create("req-1");
    registry.markSuccess("req-1", { ok: true });
    registry.markError("req-1", "late failure");
    expect(registry.get("req-1")?.status).toBe("success");
  });

  it("markTimeout is a no-op once a task has already settled", () => {
    const registry = new TaskRegistry();
    registry.create("req-1");
    registry.markSuccess("req-1", { ok: true });
    registry.markTimeout("req-1");
    expect(registry.get("req-1")?.status).toBe("success");
  });

  it("get() on an unknown id returns undefined", () => {
    const registry = new TaskRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });
});
