export const MODELS = {
  GPT_OSS: "openai/gpt-oss-120b",

  NORTH_MINI: "cohere/north-mini-code",

  LAGUNA_XS: "poolside/laguna-xs-2.1",

  LAGUNA_M1: "poolside/laguna-m1",

  HY3: "tencent/hy3",

  GEMMA: "google/gemma-4-31b",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
