/**
 * Coding-focused model benchmark.
 *
 * Usage (repo root):
 *   pnpm exec tsx examples/coding-bench.ts
 *
 * Measures latency, success, token usage, and a light quality heuristic
 * for each candidate model on the same coding prompts.
 */
import "dotenv/config";
import { performance } from "node:perf_hooks";

import { createNvidiaProvider } from "@uag/provider-nvidia";
import { createOpenRouterProvider } from "@uag/provider-openrouter";
import type { AIProvider } from "@uag/sdk/provider";

type Candidate = {
  id: string;
  provider: AIProvider;
};

type Task = {
  id: string;
  prompt: string;
  /** Simple checks on the returned code text. */
  expect: RegExp[];
};

const TASKS: Task[] = [
  {
    id: "isEven",
    prompt:
      "Write a TypeScript function isEven(n: number): boolean. " +
      "Return ONLY the function source. No markdown fences, no explanation.",
    expect: [/function\s+isEven\s*\(/, /%\s*2/, /boolean/],
  },
  {
    id: "clamp",
    prompt:
      "Write a TypeScript function clamp(n: number, min: number, max: number): number. " +
      "Return ONLY the function source. No markdown fences, no explanation.",
    expect: [/function\s+clamp\s*\(/, /Math\.(min|max)/],
  },
  {
    id: "unique",
    prompt:
      "Write a TypeScript function uniqueStrings(items: string[]): string[] that returns unique values preserving order. " +
      "Return ONLY the function source. No markdown fences, no explanation.",
    expect: [/function\s+uniqueStrings\s*\(/, /\[\]|Set|filter|includes/],
  },
];

function scoreQuality(content: string, expect: RegExp[]): number {
  const text = content.replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ""));
  const hits = expect.filter((re) => re.test(text)).length;
  return Math.round((hits / expect.length) * 100);
}

async function runOne(
  candidate: Candidate,
  task: Task
): Promise<{
  model: string;
  provider: string;
  task: string;
  ok: boolean;
  ms: number;
  quality: number;
  tokens?: number;
  preview: string;
  error?: string;
}> {
  const t0 = performance.now();
  try {
    const res = await candidate.provider.chat({
      model: candidate.id,
      messages: [{ role: "user", content: task.prompt }],
      maxTokens: 400,
      temperature: 0.2,
    });
    const ms = Math.round(performance.now() - t0);
    const quality = scoreQuality(res.content, task.expect);
    return {
      model: candidate.id,
      provider: res.provider || candidate.provider.name,
      task: task.id,
      ok: true,
      ms,
      quality,
      tokens: res.usage?.totalTokens,
      preview: res.content.slice(0, 100).replace(/\n/g, " "),
    };
  } catch (error) {
    return {
      model: candidate.id,
      provider: candidate.provider.name,
      task: task.id,
      ok: false,
      ms: Math.round(performance.now() - t0),
      quality: 0,
      preview: "",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 160),
    };
  }
}

async function main() {
  const candidates: Candidate[] = [];

  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createNvidiaProvider(process.env.NVIDIA_API_KEY);
    for (const id of await nvidia.listModels()) {
      candidates.push({ id, provider: nvidia });
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenRouterProvider(process.env.OPENROUTER_API_KEY);
    for (const id of await openrouter.listModels()) {
      candidates.push({ id, provider: openrouter });
    }
  }

  if (candidates.length === 0) {
    throw new Error("No providers configured");
  }

  console.log(`Candidates: ${candidates.map((c) => c.id).join(", ")}`);
  console.log(`Tasks: ${TASKS.map((t) => t.id).join(", ")}\n`);

  const rows = [];
  for (const candidate of candidates) {
    for (const task of TASKS) {
      const row = await runOne(candidate, task);
      rows.push(row);
      const status = row.ok ? `ok q=${row.quality}%` : `FAIL`;
      console.log(
        `${row.model.padEnd(42)} ${task.id.padEnd(12)} ${String(row.ms).padStart(5)}ms  ${status}`
      );
    }
  }

  // Aggregate per model
  const byModel = new Map<
    string,
    { ok: number; fail: number; ms: number[]; quality: number[]; tokens: number }
  >();

  for (const row of rows) {
    const agg = byModel.get(row.model) ?? {
      ok: 0,
      fail: 0,
      ms: [],
      quality: [],
      tokens: 0,
    };
    if (row.ok) {
      agg.ok += 1;
      agg.ms.push(row.ms);
      agg.quality.push(row.quality);
      agg.tokens += row.tokens ?? 0;
    } else {
      agg.fail += 1;
    }
    byModel.set(row.model, agg);
  }

  const summary = [...byModel.entries()].map(([model, agg]) => {
    const avgMs =
      agg.ms.length === 0
        ? null
        : Math.round(agg.ms.reduce((a, b) => a + b, 0) / agg.ms.length);
    const avgQuality =
      agg.quality.length === 0
        ? null
        : Math.round(agg.quality.reduce((a, b) => a + b, 0) / agg.quality.length);
    return {
      model,
      success: `${agg.ok}/${agg.ok + agg.fail}`,
      avg_ms: avgMs,
      avg_quality_pct: avgQuality,
      tokens: agg.tokens || null,
      recommend:
        agg.fail === 0 && (avgQuality ?? 0) >= 66
          ? avgMs != null && avgMs < 5000
            ? "keep-primary"
            : "keep-fallback"
          : agg.ok > 0
            ? "optional"
            : "remove",
    };
  });

  summary.sort((a, b) => {
    const rank = (r: (typeof summary)[number]) =>
      r.recommend === "keep-primary" ? 0 : r.recommend === "keep-fallback" ? 1 : r.recommend === "optional" ? 2 : 3;
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return (a.avg_ms ?? 1e9) - (b.avg_ms ?? 1e9);
  });

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({ summary, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
