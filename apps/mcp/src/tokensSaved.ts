export const TOKENS_SAVED_CALCULATION_METHOD = "downstream_total_tokens_v1";

export const TOKENS_SAVED_EXPLANATION =
  "tokens_saved = usage.totalTokens reported by the downstream provider for " +
  "this request (prompt + completion tokens, counted with that model's own " +
  "tokenizer). It approximates how many tokens were NOT spent in the " +
  "primary assistant's context window because the work was delegated to a " +
  "sub-model. It is not measured against any specific baseline model, and " +
  "it is not converted into the primary model's tokenizer.";

export function computeTokensSaved(usage?: { totalTokens?: number }): number {
  return usage?.totalTokens ?? 0;
}
