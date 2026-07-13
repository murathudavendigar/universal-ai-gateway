export const MODELS = {
  NEMOTRON: "nvidia/llama-3.3-nemotron-super-49b-v1",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
