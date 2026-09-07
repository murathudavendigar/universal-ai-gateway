/**
 * OpenRouter models exposed by this adapter.
 * Only IDs that currently resolve to live endpoints should live here.
 */
export const MODELS = {
  GPT_OSS: "openai/gpt-oss-120b",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
