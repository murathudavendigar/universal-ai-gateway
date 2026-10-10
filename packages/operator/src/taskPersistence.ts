import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { TaskListItem, TaskRegistry } from "./taskRegistry.js";

export const INTERRUPTED_TASK_ERROR =
  "The server restarted before this task finished. Its downstream result was lost; re-delegate it.";

export interface TaskPersistenceOptions {
  filePath: string;
  /** Debounce window for coalescing rapid registry changes. Default: 250ms. */
  debounceMs?: number;
  onError?: (message: string, error: unknown) => void;
}

export interface TaskPersistence {
  /** Loads persisted tasks into the registry and starts saving on change. */
  attach(registry: TaskRegistry): Promise<void>;
  /** Writes pending changes immediately (call on shutdown). */
  flush(): Promise<void>;
}

/**
 * A task that was pending/timed-out when the process died can never complete;
 * surface it as an error rather than leaving it pending forever.
 */
export function reconcileLoadedTasks(items: TaskListItem[], now = Date.now()): TaskListItem[] {
  return items.map((item) =>
    item.status === "pending" || item.status === "timeout"
      ? { ...item, status: "error", error: INTERRUPTED_TASK_ERROR, updatedAt: now }
      : item
  );
}

function isTaskListItem(value: unknown): value is TaskListItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.status === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.updatedAt === "number"
  );
}

export function createFileTaskPersistence(options: TaskPersistenceOptions): TaskPersistence {
  const debounceMs = options.debounceMs ?? 250;
  const report = options.onError ?? (() => {});

  let registry: TaskRegistry | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();

  async function load(): Promise<TaskListItem[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(options.filePath, "utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isTaskListItem);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        report(`Failed to load task history from ${options.filePath}`, error);
      }
      return [];
    }
  }

  function write(): Promise<void> {
    if (!registry) return Promise.resolve();
    const payload = JSON.stringify(registry.list(), null, 2);
    // Serialize writes and use tmp+rename so a crash never leaves a torn file.
    writing = writing
      .then(async () => {
        await mkdir(dirname(options.filePath), { recursive: true, mode: 0o700 });
        const tmp = `${options.filePath}.${process.pid}.tmp`;
        await writeFile(tmp, payload, { encoding: "utf8", mode: 0o600 });
        await rename(tmp, options.filePath);
      })
      .catch((error) => report(`Failed to persist task history to ${options.filePath}`, error));
    return writing;
  }

  return {
    async attach(target) {
      registry = target;
      const loaded = reconcileLoadedTasks(await load());
      if (loaded.length > 0) target.hydrate(loaded);
      target.setOnChange(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          void write();
        }, debounceMs);
        timer.unref?.();
      });
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await write();
    },
  };
}
