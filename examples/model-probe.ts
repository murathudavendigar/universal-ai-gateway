import "dotenv/config";
import { performance } from "node:perf_hooks";

import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";

async function main() {
  const nvidia = process.env.NVIDIA_API_KEY
    ? createNvidiaProvider(process.env.NVIDIA_API_KEY)
    : null;
  const openrouter = process.env.OPENROUTER_API_KEY
    ? createOpenRouterProvider(process.env.OPENROUTER_API_KEY)
    : null;

  const probes: Array<{ provider: string; model: string; chat: (model: string) => Promise<{ content: string; provider: string; model: string }> }> = [];

  if (nvidia) {
    for (const model of await nvidia.listModels()) {
      probes.push({
        provider: "nvidia",
        model,
        chat: (m) =>
          nvidia.chat({
            model: m,
            messages: [{ role: "user", content: "Reply with only OK" }],
            maxTokens: 16,
          }),
      });
    }
  }

  if (openrouter) {
    for (const model of await openrouter.listModels()) {
      probes.push({
        provider: "openrouter",
        model,
        chat: (m) =>
          openrouter.chat({
            model: m,
            messages: [{ role: "user", content: "Reply with only OK" }],
            maxTokens: 16,
          }),
      });
    }
  }

  for (const probe of probes) {
    const t0 = performance.now();
    try {
      const res = await probe.chat(probe.model);
      console.log(
        JSON.stringify({
          provider: probe.provider,
          model: probe.model,
          ok: true,
          ms: Math.round(performance.now() - t0),
          content: res.content.slice(0, 40),
        })
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          provider: probe.provider,
          model: probe.model,
          ok: false,
          ms: Math.round(performance.now() - t0),
          error: (error instanceof Error ? error.message : String(error)).slice(0, 160),
        })
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
