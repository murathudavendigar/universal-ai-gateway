import type { RouteRequest, RouteResult } from "./types.js";

const OPENROUTER_NORTH_MINI = "cohere/north-mini-code";
const OPENROUTER_GPT_OSS = "openai/gpt-oss-120b";
const NVIDIA_NEMOTRON = "nvidia/llama-3.3-nemotron-super-49b-v1";

export class Router {
  route(request: RouteRequest): RouteResult {
    switch (request.task) {
      case "documentation":
        return { provider: "openrouter", model: OPENROUTER_NORTH_MINI };
      case "reasoning":
        return { provider: "nvidia", model: NVIDIA_NEMOTRON };
      case "coding":
      case "review":
      case "chat":
      default:
        return { provider: "openrouter", model: OPENROUTER_GPT_OSS };
    }
  }
}
