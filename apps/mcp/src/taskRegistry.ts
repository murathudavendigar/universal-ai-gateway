export type TaskStatus = "pending" | "success" | "error" | "timeout";

export interface TaskRecord {
  status: TaskStatus;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Tracks delegate_task lifecycles by request_id, independent of whether
 * the original caller is still waiting. A request that times out from the
 * caller's perspective keeps running; when it eventually settles, the
 * registry is updated so get_task_result can report the real outcome.
 */
export class TaskRegistry {
  private readonly tasks = new Map<string, TaskRecord>();

  create(requestId: string): TaskRecord {
    const existing = this.tasks.get(requestId);
    if (existing) return existing;

    const record: TaskRecord = {
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(requestId, record);
    return record;
  }

  get(requestId: string): TaskRecord | undefined {
    return this.tasks.get(requestId);
  }

  markSuccess(requestId: string, result: unknown): void {
    const record = this.tasks.get(requestId);
    if (!record) return;
    record.status = "success";
    record.result = result;
    record.updatedAt = Date.now();
  }

  markError(requestId: string, error: string): void {
    const record = this.tasks.get(requestId);
    if (!record || record.status === "success") return;
    record.status = "error";
    record.error = error;
    record.updatedAt = Date.now();
  }

  markTimeout(requestId: string): void {
    const record = this.tasks.get(requestId);
    if (!record || record.status !== "pending") return;
    record.status = "timeout";
    record.updatedAt = Date.now();
  }
}
