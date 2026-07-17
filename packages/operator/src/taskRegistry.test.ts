import { describe, expect, it, vi } from "vitest";

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

  it("stores metadata on create", () => {
    const registry = new TaskRegistry();
    registry.create("req-1", {
      promptPreview: "hello",
      intent: "coding",
      model: "some/model",
    });
    expect(registry.get("req-1")?.metadata).toEqual({
      promptPreview: "hello",
      intent: "coding",
      model: "some/model",
    });
  });

  it("list() returns newest first", () => {
    const registry = new TaskRegistry();
    registry.create("old");
    const older = registry.get("old")!;
    older.createdAt = 1000;
    registry.create("new");
    const newer = registry.get("new")!;
    newer.createdAt = 2000;

    expect(registry.list().map((t) => t.id)).toEqual(["new", "old"]);
    expect(registry.list(1).map((t) => t.id)).toEqual(["new"]);
  });

  it("trims oldest tasks when maxSize is exceeded", () => {
    const registry = new TaskRegistry({ maxSize: 2 });
    registry.create("a");
    registry.get("a")!.createdAt = 1;
    registry.create("b");
    registry.get("b")!.createdAt = 2;
    registry.create("c");
    registry.get("c")!.createdAt = 3;

    expect(registry.get("a")).toBeUndefined();
    expect(registry.get("b")?.status).toBe("pending");
    expect(registry.get("c")?.status).toBe("pending");
  });

  it("hydrate restores records", () => {
    const registry = new TaskRegistry();
    registry.hydrate([
      {
        id: "persisted",
        status: "success",
        result: { ok: true },
        createdAt: 50,
        updatedAt: 60,
        metadata: { intent: "reasoning" },
      },
    ]);
    expect(registry.get("persisted")?.status).toBe("success");
    expect(registry.list()[0]?.id).toBe("persisted");
  });

  it("calls onChange after mutations", () => {
    const onChange = vi.fn();
    const registry = new TaskRegistry({ onChange });
    registry.create("req-1");
    registry.markTimeout("req-1");
    registry.markSuccess("req-1", { ok: true });
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
