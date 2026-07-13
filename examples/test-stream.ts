import "dotenv/config";
import { env } from "node:process";

import { ProviderRegistry, Router, AIGateway } from "@uag/core";
import type { TaskType } from "@uag/core";
import { createOpenRouterProvider } from "@uag/provider-openrouter";
import { createNvidiaProvider } from "@uag/provider-nvidia";

const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));

const gateway = new AIGateway(registry, new Router());

async function streamTask(label: string, task: TaskType, prompt: string) {
  console.log(`\n--- ${label} (${task}) ---`);

  for await (const chunk of gateway.streamChat(
    { messages: [{ role: "user", content: prompt }] },
    task
  )) {
    process.stdout.write(chunk.content);

    if (chunk.done && chunk.usage) {
      console.log(`\n[usage] ${JSON.stringify(chunk.usage)}`);
    }
  }

  console.log();
}

async function main() {
  await streamTask(
    "OpenRouter",
    "coding",
    "Count from 1 to 5, one number per line."
  );

  await streamTask(
    "NVIDIA",
    "reasoning",
    "Explain briefly why the sky is blue."
  );
}

main();
