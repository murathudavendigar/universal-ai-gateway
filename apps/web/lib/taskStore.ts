import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TaskListItem, TaskRegistry } from "@uag/operator";

const DATA_DIR = path.join(process.cwd(), ".data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

export async function loadTasksFromDisk(): Promise<TaskListItem[]> {
  try {
    const raw = await readFile(TASKS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as TaskListItem[];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[uag/web] Failed to load task history:", error);
    return [];
  }
}

export async function saveTasksToDisk(registry: TaskRegistry): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const payload = JSON.stringify(registry.list(), null, 2);
    await writeFile(TASKS_FILE, payload, "utf8");
  } catch (error: unknown) {
    console.error("[uag/web] Failed to persist task history:", error);
  }
}
