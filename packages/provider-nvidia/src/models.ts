export const MODELS = {
  NEMOTRON_SUPER: "nvidia/llama-3.3-nemotron-super-49b-v1",
  NEMOTRON_NANO: "nvidia/nemotron-3-nano-30b-a3b",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS];
