import "dotenv/config";
import { env } from "node:process";

import { ProviderRegistry, Router, AIGateway } from "@uag/core";
import { createOpenRouterProvider, MODELS } from "@uag/provider-openrouter";

const registry = new ProviderRegistry();

registry.register(createOpenRouterProvider(env.OPENROUTER_API_KEY!));

const gateway = new AIGateway(registry, new Router());

async function main() {
  const response = await gateway.chat({
    model: MODELS.GPT_OSS,
    messages: [
      {
        role: "user",
        content: "Reply only with: Gateway Registry Works!",
      },
    ],
  });

  console.log(response);
}

main();
