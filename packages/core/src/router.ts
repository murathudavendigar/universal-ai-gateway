import type { RoutePlan, RouteRequest, TaskType } from "./types.js";

const ALL_TASK_TYPES: TaskType[] = [
  "chat",
  "documentation",
  "coding",
  "review",
  "reasoning",
];

const OPENROUTER_GPT_OSS = "openai/gpt-oss-120b";
const OPENROUTER_NORTH_MINI = "cohere/north-mini-code";

const NVIDIA_ULTRA_550B = "nvidia/nemotron-3-ultra-550b-a55b";
const NVIDIA_SUPER_120B = "nvidia/nemotron-3-super-120b-a12b";
const NVIDIA_DEEPSEEK_FLASH = "deepseek-ai/deepseek-v4-flash";
const NVIDIA_LLAMA_70B = "meta/llama-3.3-70b-instruct";
const NVIDIA_QWEN_397B = "qwen/qwen3.5-397b-a17b";

export class Router {
  listRoutableModels(): string[] {
    const models = new Set<string>();

    for (const task of ALL_TASK_TYPES) {
      for (const plan of this.route({ task })) {
        models.add(plan.model);
      }
    }

    return [...models].sort();
  }

  route(request: RouteRequest): RoutePlan[] {
    switch (request.task) {
      case "documentation":
        return [{ providerId: "openrouter", model: OPENROUTER_NORTH_MINI }];

      case "reasoning":
        return [
          { providerId: "nvidia", model: NVIDIA_ULTRA_550B },
          { providerId: "nvidia", model: NVIDIA_SUPER_120B },
          { providerId: "nvidia", model: NVIDIA_LLAMA_70B },
        ];

      case "coding":
        return [
          { providerId: "nvidia", model: NVIDIA_DEEPSEEK_FLASH },
          { providerId: "nvidia", model: NVIDIA_QWEN_397B },
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
        ];

      case "review":
      case "chat":
      default:
        return [{ providerId: "nvidia", model: NVIDIA_SUPER_120B }];
    }
  }
}
