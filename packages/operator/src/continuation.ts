import type { ChatMessage, ChatResponse } from "@uag/sdk/provider";

export const TRUNCATION_FINISH_REASONS = new Set(["length", "max_tokens"]);

export interface ContinuationChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export type ChatFn = (request: ContinuationChatRequest) => Promise<ChatResponse>;

export interface ContinuationResult {
  response: ChatResponse;
  truncated: boolean;
  truncationReason?: string;
  continuations: number;
}

const DEFAULT_MAX_CONTINUATIONS = 2;

function isTruncated(response: ChatResponse): boolean {
  return response.finishReason != null && TRUNCATION_FINISH_REASONS.has(response.finishReason);
}

/**
 * Calls `chat` once, then — if the response was cut off by a length limit
 * — automatically asks the model to continue, up to `maxContinuations`
 * times, concatenating content and usage as it goes. `truncated` reflects
 * the FINAL delivered content: false if a continuation completed it,
 * true if the cap was hit while still truncated.
 */
export async function chatWithContinuation(
  chat: ChatFn,
  request: ContinuationChatRequest,
  maxContinuations = DEFAULT_MAX_CONTINUATIONS
): Promise<ContinuationResult> {
  let response = await chat(request);
  let messages = request.messages;
  let combinedContent = response.content;
  let combinedTokens = response.usage?.totalTokens ?? 0;
  let continuations = 0;

  while (isTruncated(response) && continuations < maxContinuations) {
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: "Continue exactly where you left off. Do not repeat earlier content." },
    ];

    response = await chat({ ...request, messages });
    continuations += 1;
    combinedContent += response.content;
    combinedTokens += response.usage?.totalTokens ?? 0;
  }

  return {
    response: {
      ...response,
      content: combinedContent,
      usage: { ...response.usage, totalTokens: combinedTokens },
    },
    truncated: isTruncated(response),
    truncationReason: isTruncated(response) ? response.finishReason : undefined,
    continuations,
  };
}
