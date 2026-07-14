#!/usr/bin/env node
import { config } from "dotenv";
import { FastMCP } from "fastmcp";
import { env } from "node:process";
import { z } from "zod";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

process.env.DOTENV_QUIET = "true";
process.env.DOTENVX_QUIET = "true";

// Fall back to a .env file in the user's current directory if the
// required keys are not already present in the environment.
if (!env.OPENROUTER_API_KEY || !env.NVIDIA_API_KEY) {
  config({
    path: `${process.cwd()}/.env`,
    quiet: true,
  } as any);
}

if (!env.OPENROUTER_API_KEY || !env.NVIDIA_API_KEY) {
  console.error(
    "Error: NVIDIA_API_KEY or OPENROUTER_API_KEY is missing. Please set them in your environment or a local .env file.",
  );
  process.exit(1);
}

// Register the providers used by the gateway.
const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));

// Wire the registry into the gateway router.
const gateway = new AIGateway(registry, new Router());

//- Session stats for the current runtime.
const sessionStats = {
  totalRequestsDelegated: 0,
  totalTokensSaved: 0,
};

const server = new FastMCP({
  name: "Universal AI Gateway",
  version: "0.1.0",
});

server.addTool({
  name: "health",
  description: "Gateway sisteminin calisip calismadigini kontrol eder.",
  parameters: z.object({}),
  execute: async () => {
    return JSON.stringify({ status: "ok", gateway: "Universal AI Gateway" });
  },
});

server.addTool({
  name: "get_session_stats",
  description:
    "Returns the total tokens saved and requests delegated during the current session.",
  parameters: z.object({}),
  execute: async () => {
    return JSON.stringify({
      status: "success",
      stats: sessionStats,
      message: `You have saved ${sessionStats.totalTokensSaved} tokens over ${sessionStats.totalRequestsDelegated} requests in this session.`,
    });
  },
});

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
    specific_model: z
      .string()
      .optional()
      .describe(
        "Optional. Explicitly request a specific model (e.g., 'deepseek-ai/deepseek-v4-flash'). If omitted, the gateway will auto-route.",
      ),
  }),

  execute: async (args) => {
    try {
      const response = await gateway.chat(
        {
          messages: [{ role: "user", content: args.prompt }],
          ...(args.specific_model ? { model: args.specific_model } : {}),
        },
        args.intent,
      );

      const tokensSaved = response.usage?.totalTokens || 0;
      sessionStats.totalTokensSaved += tokensSaved;
      sessionStats.totalRequestsDelegated += 1;

      const footer = `\n\n---\n💡 **UAG Stats:** This delegation saved ~${tokensSaved} tokens. Session total: ${sessionStats.totalTokensSaved} tokens saved over ${sessionStats.totalRequestsDelegated} requests.`;

      return JSON.stringify({
        status: "success",
        provider_used: response.provider,
        model_used: response.model,
        tokens_saved: tokensSaved,
        result: response.content + footer,
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
