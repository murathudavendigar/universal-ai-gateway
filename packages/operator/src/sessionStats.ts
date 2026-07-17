export interface SessionStatsSnapshot {
  totalRequestsDelegated: number;
  totalTokensSaved: number;
}

/**
 * Single source of truth for session counters. The only way to mutate
 * state is `recordSuccess`, which increments both counters in one
 * synchronous statement — callers MUST only invoke it after a delegated
 * request has genuinely completed successfully. Errors and timeouts must
 * never call this method.
 */
export class SessionStats {
  private totalRequestsDelegated = 0;
  private totalTokensSaved = 0;

  recordSuccess(tokensSaved: number): SessionStatsSnapshot {
    this.totalRequestsDelegated += 1;
    this.totalTokensSaved += tokensSaved;
    return this.snapshot();
  }

  snapshot(): SessionStatsSnapshot {
    return {
      totalRequestsDelegated: this.totalRequestsDelegated,
      totalTokensSaved: this.totalTokensSaved,
    };
  }
}
