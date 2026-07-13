export const MODELS = {
  MISTRAL_LARGE: "mistralai/mistral-large-3-675b",
  GPT_OSS: "openai/gpt-oss-120b",
  MINIMAX: "minimaxai/minimax-m2.5",
  KIMI_K2: "moonshotai/kimi-k2-instruct-0905",
  NORTH_MINI: "cohere/north-mini-code",
  LAGUNA_M1: "poolside/laguna-m1",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
