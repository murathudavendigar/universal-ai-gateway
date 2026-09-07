import type { RoutePlan, RouteRequest, TaskType } from "./types.js";

const ALL_TASK_TYPES: TaskType[] = [
  "chat",
  "documentation",
  "coding",
  "review",
  "reasoning",
];

/** Live-verified OpenRouter model (2026-09 probe). */
const OPENROUTER_GPT_OSS = "openai/gpt-oss-120b";

/** Live-verified NVIDIA models (2026-09 probe). */
const NVIDIA_SUPER_120B = "nvidia/nemotron-3-super-120b-a12b";
const NVIDIA_ULTRA_550B = "nvidia/nemotron-3-ultra-550b-a55b";

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
        return [
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
          { providerId: "nvidia", model: NVIDIA_SUPER_120B },
        ];

      case "reasoning":
        return [
          { providerId: "nvidia", model: NVIDIA_ULTRA_550B },
          { providerId: "nvidia", model: NVIDIA_SUPER_120B },
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
        ];

      case "coding":
        return [
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
          { providerId: "nvidia", model: NVIDIA_ULTRA_550B },
          { providerId: "nvidia", model: NVIDIA_SUPER_120B },
        ];

      case "review":
      case "chat":
      default:
        return [
          { providerId: "nvidia", model: NVIDIA_SUPER_120B },
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
          { providerId: "nvidia", model: NVIDIA_ULTRA_550B },
        ];
    }
  }
}
