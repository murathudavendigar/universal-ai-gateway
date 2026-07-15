export const MODELS = {
  NEMOTRON_SUPER: "nvidia/llama-3.3-nemotron-super-49b-v1",
  NEMOTRON_SUPER_120B: "nvidia/nemotron-3-super-120b-a12b",
  NEMOTRON_NANO: "nvidia/nemotron-3-nano-30b-a3b",
  NEMOTRON_ULTRA: "nvidia/nemotron-3-ultra-550b-a55b",
  DEEPSEEK_FLASH: "deepseek-ai/deepseek-v4-flash",
  LLAMA_70B: "meta/llama-3.3-70b-instruct",
  QWEN_397B: "qwen/qwen3.5-397b-a17b",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS] | (string & {});
