export type TaskStatus = "pending" | "success" | "error" | "timeout";

export interface TaskMetadata {
  promptPreview?: string;
  intent?: string;
  model?: string;
}

export interface TaskRecord {
  status: TaskStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: TaskMetadata;
}

export interface TaskListItem extends TaskRecord {
  id: string;
}

export interface TaskRegistryOptions {
  /** Maximum retained tasks. Oldest entries are dropped first. Default: 200. */
  maxSize?: number;
  /** Called after any mutating operation (create / mark* / hydrate / clear). */
  onChange?: () => void;
}

/**
 * Tracks delegate_task lifecycles by request_id, independent of whether
 * the original caller is still waiting. A request that times out from the
 * caller's perspective keeps running; when it eventually settles, the
 * registry is updated so get_task_result can report the real outcome.
 */
export class TaskRegistry {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly maxSize: number;
  private onChange?: () => void;

  constructor(options: TaskRegistryOptions = {}) {
    this.maxSize = options.maxSize ?? 200;
    this.onChange = options.onChange;
  }

  /** Replaces the change listener (used by persistence after construction). */
  setOnChange(listener: (() => void) | undefined): void {
    this.onChange = listener;
  }

  create(requestId: string, metadata?: TaskMetadata): TaskRecord {
    const existing = this.tasks.get(requestId);
    if (existing) return existing;

    const record: TaskRecord = {
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(metadata ? { metadata } : {}),
    };
    this.tasks.set(requestId, record);
    this.trimToMaxSize();
    this.notify();
    return record;
  }

  get(requestId: string): TaskRecord | undefined {
    return this.tasks.get(requestId);
  }

  /**
   * Returns tasks newest-first. Optionally limit the number of rows.
   */
  list(limit?: number): TaskListItem[] {
    const items: TaskListItem[] = [...this.tasks.entries()].map(([id, record]) => ({
      id,
      ...record,
    }));

    items.sort((a, b) => b.createdAt - a.createdAt);
    return limit == null ? items : items.slice(0, limit);
  }

  /**
   * Replace in-memory state with persisted records (e.g. file load on boot).
   * Does not invoke onChange (caller is responsible for any follow-up).
   */
  hydrate(items: TaskListItem[]): void {
    this.tasks.clear();
    const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
    for (const item of sorted) {
      const { id, ...record } = item;
      this.tasks.set(id, record);
    }
    this.trimToMaxSize();
  }

  markSuccess(requestId: string, result: unknown): void {
    const record = this.tasks.get(requestId);
    if (!record) return;
    record.status = "success";
    record.result = result;
    record.updatedAt = Date.now();
    this.notify();
  }

  markError(requestId: string, error: string): void {
    const record = this.tasks.get(requestId);
    if (!record || record.status === "success") return;
    record.status = "error";
    record.error = error;
    record.updatedAt = Date.now();
    this.notify();
  }

  markTimeout(requestId: string): void {
    const record = this.tasks.get(requestId);
    if (!record || record.status !== "pending") return;
    record.status = "timeout";
    record.updatedAt = Date.now();
    this.notify();
  }

  private trimToMaxSize(): void {
    if (this.tasks.size <= this.maxSize) return;

    const ordered = [...this.tasks.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );
    const toRemove = ordered.length - this.maxSize;
    for (let i = 0; i < toRemove; i++) {
      this.tasks.delete(ordered[i]![0]);
    }
  }

  private notify(): void {
    this.onChange?.();
  }
}
