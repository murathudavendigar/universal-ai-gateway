import "dotenv/config";
import { env } from "node:process";

import { createOpenRouterProvider, MODELS } from "@uag/provider-openrouter";

const provider = createOpenRouterProvider(env.OPENROUTER_API_KEY!);

async function main() {
  const response = await provider.chat({
    model: MODELS.GPT_OSS,

    messages: [
      {
        role: "user",
        content: "Reply with exactly: Universal AI Gateway is working!",
      },
    ],
  });

  console.log(response);
}

main();
