/**
 * Simple in-memory sliding-window rate limiter for personal operator APIs.
 * Resets per server instance (fine for single-region / low traffic).
 */

type Bucket = {
  timestamps: number[];
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __uagRateLimitBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalForRateLimit.__uagRateLimitBuckets) {
    globalForRateLimit.__uagRateLimitBuckets = new Map();
  }
  return globalForRateLimit.__uagRateLimitBuckets;
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: number; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  options: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const limit = options.limit ?? 30;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const store = buckets();
  const bucket = store.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    store.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, limit - bucket.timestamps.length) };
}

export function rateLimitKeyFromRequest(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.length > 10) {
    return `bearer:${auth.slice(0, 48)}`;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0]?.trim() ?? "unknown"}`;
  return "ip:anonymous";
}
