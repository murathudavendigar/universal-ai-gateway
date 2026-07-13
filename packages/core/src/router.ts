import type { RouteRequest } from "./types.js";

export class Router {
  route(request: RouteRequest): string {
    switch (request.task) {
      case "documentation":
      case "coding":
      case "review":
      case "reasoning":
      case "chat":
      default:
        return "openrouter";
    }
  }
}
