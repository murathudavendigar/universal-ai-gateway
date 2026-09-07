import type { TaskType } from "@uag/core";

/** Task types the router knows about (MCP may expose a subset on delegate_task). */
export const ROUTABLE_TASK_TYPES: TaskType[] = [
  "chat",
  "coding",
  "reasoning",
  "documentation",
  "review",
];

/**
 * Human/agent-facing guidance embedded in MCP tool descriptions and list_routing.
 * Keep in sync with packages/core/src/router.ts.
 */
export const ROUTING_GUIDANCE = {
  intent_choice: {
    coding:
      "Code generation drafts: functions, snippets, algorithms, refactors that do not need live repo context.",
    reasoning:
      "Analysis, comparisons, trade-offs, debugging hypotheses, math — no file edits required.",
  },
  default_chains: {
    coding: [
      "openrouter:openai/gpt-oss-120b",
      "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia:nvidia/nemotron-3-super-120b-a12b",
    ],
    reasoning: [
      "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia:nvidia/nemotron-3-super-120b-a12b",
      "openrouter:openai/gpt-oss-120b",
    ],
    documentation: [
      "openrouter:openai/gpt-oss-120b",
      "nvidia:nvidia/nemotron-3-super-120b-a12b",
    ],
    review: [
      "nvidia:nvidia/nemotron-3-super-120b-a12b",
      "openrouter:openai/gpt-oss-120b",
      "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
    ],
    chat: [
      "nvidia:nvidia/nemotron-3-super-120b-a12b",
      "openrouter:openai/gpt-oss-120b",
      "nvidia:nvidia/nemotron-3-ultra-550b-a55b",
    ],
  },
  specific_model_policy:
    "Omit specific_model and let the gateway auto-route unless you have a clear reason. " +
    "Use specific_model to force a known-good ID from list_routing: " +
    "openai/gpt-oss-120b (fast coding via OpenRouter), " +
    "nvidia/nemotron-3-super-120b-a12b (balanced), " +
    "nvidia/nemotron-3-ultra-550b-a55b (hard reasoning). " +
    "Do not invent model IDs — only use models returned by list_routing.",
  latency_note:
    "Downstream free models are often slow on large prompts (can take minutes). " +
    "Prefer primary model for small or urgent work. On timeout, poll get_task_result with the returned request_id.",
} as const;

export const DELEGATE_TASK_TOOL_DESCRIPTION =
  "Delegate a self-contained coding or reasoning draft to a free downstream model to save primary tokens. " +
  "Do NOT use for repo-aware bug fixes, small edits, or anything needing live file context — handle those yourself. " +
  "Intent: coding = code/snippets/algorithms; reasoning = analysis/trade-offs/math. " +
  "Default: omit specific_model (auto-route). coding chain ≈ GPT-OSS 120B → Nemotron Ultra 550B → Super 120B; " +
  "reasoning chain ≈ Nemotron Ultra 550B → Super 120B → GPT-OSS 120B. " +
  "Call list_routing first if unsure which models exist or which chain applies. " +
  "On timeout poll get_task_result with request_id.";

export interface RoutingSource {
  route(request: { task: TaskType }): Array<{ providerId: string; model: string }>;
  listRoutableModels(): string[];
}

export interface ListRoutingDeps {
  router: RoutingSource;
  knownModels?: ReadonlySet<string>;
  /** Providers currently preferred-skipped (optional). */
  unhealthyProviders?: () => ReadonlySet<string>;
}

export function createListRoutingHandler(deps: ListRoutingDeps) {
  return async function listRouting(): Promise<string> {
    const unhealthy = deps.unhealthyProviders?.() ?? new Set<string>();

    const chains = ROUTABLE_TASK_TYPES.map((task) => ({
      task,
      plans: deps.router.route({ task }).map((plan) => ({
        providerId: plan.providerId,
        model: plan.model,
        deferred: unhealthy.has(plan.providerId),
      })),
      mcp_delegate_supported: task === "coding" || task === "reasoning",
    }));

    const models = deps.knownModels
      ? [...deps.knownModels].sort()
      : deps.router.listRoutableModels();

    return JSON.stringify({
      status: "success",
      guidance: ROUTING_GUIDANCE,
      chains,
      models,
      routable_models: deps.router.listRoutableModels(),
      unhealthy_providers: [...unhealthy],
      message:
        "Use intent coding|reasoning on delegate_task. Prefer auto-route; " +
        "set specific_model only from the models list when you need speed, strength, or a retry.",
    });
  };
}
