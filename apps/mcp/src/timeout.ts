export type TimeoutRace<T> = { timedOut: true } | { timedOut: false; value: T };

export interface ProgressTick {
  elapsedMs: number;
  timeoutMs: number;
}

/**
 * Races `promise` against a deadline WITHOUT cancelling it — the caller
 * keeps running in the background even if this function returns
 * `{ timedOut: true }` first. This is what makes post-timeout resolution
 * (get_task_result) possible: losing the race here does not mean the
 * underlying work stopped.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<TimeoutRace<T>> {
  const TIMEOUT = Symbol("timeout");
  let timer: ReturnType<typeof setTimeout>;

  const deadline = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });

  try {
    const result = await Promise.race([promise, deadline]);
    return result === TIMEOUT ? { timedOut: true } : { timedOut: false, value: result as T };
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Same as `withTimeout`, but emits progress ticks while waiting. Useful for
 * long-running free-model requests where the MCP client should show activity.
 */
export async function withTimeoutAndProgress<T>(
  promise: Promise<T>,
  ms: number,
  onProgress?: (tick: ProgressTick) => void | Promise<void>,
  progressIntervalMs = 15_000
): Promise<TimeoutRace<T>> {
  const startedAt = Date.now();

  await onProgress?.({ elapsedMs: 0, timeoutMs: ms });

  const interval = setInterval(() => {
    void onProgress?.({ elapsedMs: Date.now() - startedAt, timeoutMs: ms });
  }, progressIntervalMs);

  try {
    return await withTimeout(promise, ms);
  } finally {
    clearInterval(interval);
  }
}
