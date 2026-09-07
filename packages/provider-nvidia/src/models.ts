/**
 * NVIDIA NIM models exposed by this adapter.
 * Keep this list limited to IDs that currently accept chat requests —
 * retired catalog entries (410 Gone) confuse agents via list_routing.
 */
export const MODELS = {
  NEMOTRON_SUPER_120B: "nvidia/nemotron-3-super-120b-a12b",
  NEMOTRON_ULTRA: "nvidia/nemotron-3-ultra-550b-a55b",
} as const;

export type ModelName = (typeof MODELS)[keyof typeof MODELS] | (string & {});
