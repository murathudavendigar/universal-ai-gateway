import type { RouteRequest, RoutePlan } from "./types.js";

const OPENROUTER_GPT_OSS = "openai/gpt-oss-120b";
const OPENROUTER_NORTH_MINI = "cohere/north-mini-code";
const NVIDIA_NEMOTRON_SUPER = "nvidia/llama-3.3-nemotron-super-49b-v1";
const NVIDIA_NEMOTRON_NANO = "nvidia/nemotron-3-nano-30b-a3b";

export class Router {
  route(request: RouteRequest): RoutePlan[] {
    switch (request.task) {
      case "documentation":
        return [{ providerId: "openrouter", model: OPENROUTER_NORTH_MINI }];

      case "reasoning":
        return [
          { providerId: "nvidia", model: NVIDIA_NEMOTRON_SUPER },
          { providerId: "nvidia", model: NVIDIA_NEMOTRON_NANO },
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
        ];

      case "coding":
        return [
          { providerId: "openrouter", model: OPENROUTER_GPT_OSS },
          { providerId: "nvidia", model: NVIDIA_NEMOTRON_NANO },
        ];

      case "review":
      case "chat":
      default:
        return [{ providerId: "openrouter", model: OPENROUTER_GPT_OSS }];
    }
  }
}
