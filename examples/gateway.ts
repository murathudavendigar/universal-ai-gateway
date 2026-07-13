import "dotenv/config";
import { env } from "node:process";

import { ProviderRegistry, Router, AIGateway } from "@uag/core";
import { createOpenRouterProvider } from "@uag/provider-openrouter";
import { createNvidiaProvider } from "@uag/provider-nvidia";

const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));
registry.register(createNvidiaProvider(env.NVIDIA_API_KEY!));

const gateway = new AIGateway(registry, new Router());

async function main() {
  const coding = await gateway.chat(
    {
      messages: [
        {
          role: "user",
          content: "Reply only with: Gateway Registry Works!",
        },
      ],
    },
    "coding"
  );

  console.log(coding);

  const reasoning = await gateway.chat(
    {
      messages: [
        {
          role: "user",
          content: "Reply only with: Nemotron Routing Works!",
        },
      ],
    },
    "reasoning"
  );

  console.log(reasoning);
}

main();
