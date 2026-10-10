import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFileTaskPersistence,
  INTERRUPTED_TASK_ERROR,
  reconcileLoadedTasks,
} from "./taskPersistence.js";
import { TaskRegistry } from "./taskRegistry.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "uag-tasks-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("file task persistence", () => {
  it("round-trips completed tasks across a simulated restart", async () => {
    const filePath = join(dir, "nested", "tasks.json");

    const first = new TaskRegistry();
    const p1 = createFileTaskPersistence({ filePath, debounceMs: 5 });
    await p1.attach(first);
    first.create("req-1", { intent: "coding" });
    first.markSuccess("req-1", { status: "success", result: "done" });
    await p1.flush();

    const second = new TaskRegistry();
    await createFileTaskPersistence({ filePath }).attach(second);
    expect(second.get("req-1")?.status).toBe("success");
    expect(second.get("req-1")?.result).toEqual({ status: "success", result: "done" });
  });

  it("marks tasks that were in flight at shutdown as interrupted errors", async () => {
    const filePath = join(dir, "tasks.json");

    const first = new TaskRegistry();
    const p1 = createFileTaskPersistence({ filePath, debounceMs: 5 });
    await p1.attach(first);
    first.create("pending-1");
    first.create("timeout-1");
    first.markTimeout("timeout-1");
    await p1.flush();

    const second = new TaskRegistry();
    await createFileTaskPersistence({ filePath }).attach(second);
    for (const id of ["pending-1", "timeout-1"]) {
      expect(second.get(id)?.status).toBe("error");
      expect(second.get(id)?.error).toBe(INTERRUPTED_TASK_ERROR);
    }
  });

  it("starts empty on a missing, corrupt, or malformed file without throwing", async () => {
    const errors: string[] = [];
    const filePath = join(dir, "tasks.json");

    const missing = new TaskRegistry();
    await createFileTaskPersistence({ filePath, onError: (m) => errors.push(m) }).attach(missing);
    expect(missing.list()).toEqual([]);
    expect(errors).toEqual([]);

    await writeFile(filePath, "{not json");
    const corrupt = new TaskRegistry();
    await createFileTaskPersistence({ filePath, onError: (m) => errors.push(m) }).attach(corrupt);
    expect(corrupt.list()).toEqual([]);
    expect(errors).toHaveLength(1);

    await writeFile(filePath, JSON.stringify([{ nope: true }, null]));
    const malformed = new TaskRegistry();
    await createFileTaskPersistence({ filePath }).attach(malformed);
    expect(malformed.list()).toEqual([]);
  });

  it("writes atomically with owner-only permissions", async () => {
    const filePath = join(dir, "tasks.json");
    const registry = new TaskRegistry();
    const persistence = createFileTaskPersistence({ filePath });
    await persistence.attach(registry);
    registry.create("req-1");
    await persistence.flush();

    expect(JSON.parse(await readFile(filePath, "utf8"))).toHaveLength(1);
    const { mode } = await (await import("node:fs/promises")).stat(filePath);
    expect(mode & 0o077).toBe(0);
  });
});

describe("reconcileLoadedTasks", () => {
  it("leaves terminal states untouched", () => {
    const item = { id: "a", status: "success" as const, createdAt: 1, updatedAt: 1 };
    expect(reconcileLoadedTasks([item])).toEqual([item]);
  });
});
