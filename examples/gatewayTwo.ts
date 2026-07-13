import "dotenv/config";
import { env } from "node:process";

import { AIGateway, ProviderRegistry, Router } from "@uag/core";
import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));

const gateway = new AIGateway(registry, new Router());

async function main() {
  console.log("Gateway real-world test starting...\n");

  // Test 1: coding, routed to OpenRouter.
  console.log("Test 1: processing the coding route...");
  const codingStartTime = Date.now();

  const coding = await gateway.chat(
    {
      messages: [
        {
          role: "user",
          content:
            "Write a reusable React Button component using TypeScript, Tailwind CSS, and cva (class-variance-authority). It should have 'primary', 'secondary', and 'destructive' variants, plus 'sm', 'md', 'lg' sizes. Return only the code.",
        },
      ],
    },
    "coding",
  );

  const codingDuration = Date.now() - codingStartTime;
  console.log(`Completed in ${codingDuration}ms`);
  console.log(`Provider: ${coding.provider} | Model: ${coding.model}`);
  console.log(`Token usage: ${coding.usage?.totalTokens ?? 0} tokens`);
  console.log(
    "Response preview:\n",
    coding.content.substring(0, 350) + "\n... [truncated]\n",
  );
  console.log("-".repeat(50) + "\n");

  // Test 2: reasoning, routed to Nvidia.
  console.log("Test 2: processing the reasoning route...");
  const reasoningStartTime = Date.now();

  const reasoning = await gateway.chat(
    {
      messages: [
        {
          role: "user",
          content:
            "I have a monorepo with multiple microservices. Two of them need to share real-time state. Should I use Redis Pub/Sub, direct WebSockets, or a message broker like RabbitMQ? Think step-by-step, weigh the pros and cons, and give a definitive final recommendation.",
        },
      ],
    },
    "reasoning",
  );

  const reasoningDuration = Date.now() - reasoningStartTime;
  console.log(`Completed in ${reasoningDuration}ms`);
  console.log(`Provider: ${reasoning.provider} | Model: ${reasoning.model}`);
  console.log(`Token usage: ${reasoning.usage?.totalTokens ?? 0} tokens`);
  console.log(
    "Response preview:\n",
    reasoning.content.substring(0, 450) + "\n... [truncated]\n",
  );
}

main().catch(console.error);
