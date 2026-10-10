export interface MonitoredProvider {
  name: string;
  health(): Promise<boolean>;
}

export interface HealthMonitorOptions {
  providers: MonitoredProvider[];
  /** Cache lifetime before a background refresh is triggered. Default: 60s. */
  ttlMs?: number;
  now?: () => number;
}

export interface HealthMonitor {
  /**
   * Providers currently considered unhealthy. Returns the cached view
   * immediately and kicks off a background refresh when the cache is stale.
   */
  unhealthyProviders(): ReadonlySet<string>;
  /** Re-checks every provider. Concurrent calls share one in-flight check. */
  refresh(): Promise<void>;
}

/**
 * Caches provider health so routing can defer unhealthy providers without
 * paying a health round-trip on every delegation.
 */
export function createHealthMonitor(options: HealthMonitorOptions): HealthMonitor {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;

  let unhealthy: ReadonlySet<string> = new Set();
  let checkedAt = 0;
  let inFlight: Promise<void> | undefined;

  const refresh = (): Promise<void> => {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const results = await Promise.all(
        options.providers.map(async (provider) => {
          try {
            return { name: provider.name, healthy: await provider.health() };
          } catch {
            return { name: provider.name, healthy: false };
          }
        })
      );
      unhealthy = new Set(results.filter((r) => !r.healthy).map((r) => r.name));
      checkedAt = now();
    })().finally(() => {
      inFlight = undefined;
    });

    return inFlight;
  };

  return {
    unhealthyProviders() {
      if (now() - checkedAt > ttlMs) {
        void refresh();
      }
      return unhealthy;
    },
    refresh,
  };
}
