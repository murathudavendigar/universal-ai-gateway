import { config } from "dotenv";
import { FastMCP } from "fastmcp";
import { resolve } from "node:path";
import { env } from "node:process";
import { z } from "zod";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

// Load environment variables from the repository root.
config({ path: resolve(process.cwd(), "../../.env") });

// Register the providers used by the gateway.
const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));

// Wire the registry into the gateway router.
const gateway = new AIGateway(registry, new Router());

// Create the MCP server exposed to Claude Desktop and the inspector.
const server = new FastMCP({
  name: "Universal AI Gateway",
  version: "0.1.0",
});

// Health check tool.
server.addTool({
  name: "health",
  description: "Gateway sisteminin calisip calismadigini kontrol eder.",
  parameters: z.object({}),
  execute: async () => {
    return JSON.stringify({ status: "ok", gateway: "Universal AI Gateway" });
  },
});

// Task delegation tool.
server.addTool({
  name: "delegate_task",
  description:
    "Delegates coding or reasoning tasks through the gateway to save primary token usage.",

  parameters: z.object({
    prompt: z
      .string()
      .describe("Detailed task or coding instruction to send to the submodel."),
    intent: z
      .enum(["coding", "reasoning"])
      .describe("Task type. The router uses this to choose the model."),
  }),

  execute: async (args) => {
    try {
      const response = await gateway.chat(
        {
          messages: [{ role: "user", content: args.prompt }],
        },
        args.intent,
      );

      return JSON.stringify({
        status: "success",
        provider_used: response.provider,
        model_used: response.model,
        tokens_saved: response.usage?.totalTokens || 0,
        result: response.content,
      });
    } catch (error: any) {
      return JSON.stringify({
        status: "error",
        message: error.message || "The gateway could not handle the request.",
      });
    }
  },
});

// Start the server over stdio.
await server.start({
  transportType: "stdio",
});
