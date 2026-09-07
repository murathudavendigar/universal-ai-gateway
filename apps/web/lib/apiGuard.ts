import { NextResponse } from "next/server";

import { requireAuth } from "./auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "./rateLimit";

/**
 * Shared gate for all /api/* routes: optional bearer auth + rate limit.
 */
export function guardApi(request: Request): NextResponse | null {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const limited = checkRateLimit(rateLimitKeyFromRequest(request), {
    limit: 40,
    windowMs: 60_000,
  });

  if (!limited.allowed) {
    return NextResponse.json(
      {
        status: "error",
        message: `Rate limit exceeded. Retry in ~${limited.retryAfterSec}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    );
  }

  return null;
}
