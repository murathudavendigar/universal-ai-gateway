import type { ChatResponse } from "@uag/sdk/provider";

/**
 * Default quality gate for delegated responses. Free downstream models
 * sometimes return HTTP 200 with an empty body or a filtered completion; those
 * should fall through to the next model in the chain rather than be reported
 * to the caller as a success.
 *
 * Returns a human-readable rejection reason, or `null` when acceptable.
 */
export function rejectLowQualityResponse(response: ChatResponse): string | null {
  if (!response.content || response.content.trim().length === 0) {
    return "empty response";
  }
  if (response.finishReason === "content_filter") {
    return "blocked by provider content filter";
  }
  return null;
}
