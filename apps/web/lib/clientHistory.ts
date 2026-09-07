export type LocalHistoryItem = {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  intent?: string;
  model?: string;
  promptPreview?: string;
  provider_used?: string;
  model_used?: string;
  tokens_saved?: number;
  resultText?: string;
  error?: string;
};

const HISTORY_KEY = "uag_local_history_v1";
const MAX_ITEMS = 200;

export function loadLocalHistory(): LocalHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as LocalHistoryItem[];
  } catch {
    return [];
  }
}

export function saveLocalHistory(items: LocalHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota / private mode */
  }
}

export function upsertLocalHistory(
  items: LocalHistoryItem[],
  next: LocalHistoryItem
): LocalHistoryItem[] {
  const without = items.filter((item) => item.id !== next.id);
  const merged = [next, ...without]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS);
  saveLocalHistory(merged);
  return merged;
}

export function mergeServerAndLocalHistory(
  server: Array<{
    id: string;
    status: string;
    createdAt: number;
    updatedAt: number;
    error?: string;
    metadata?: { promptPreview?: string; intent?: string; model?: string };
    result?: unknown;
  }>,
  local: LocalHistoryItem[]
): LocalHistoryItem[] {
  const map = new Map<string, LocalHistoryItem>();

  for (const item of local) {
    map.set(item.id, item);
  }

  for (const task of server) {
    const existing = map.get(task.id);
    const nested =
      task.result && typeof task.result === "object"
        ? (task.result as Record<string, unknown>)
        : null;

    map.set(task.id, {
      id: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      intent: task.metadata?.intent ?? existing?.intent,
      model: task.metadata?.model ?? existing?.model,
      promptPreview: task.metadata?.promptPreview ?? existing?.promptPreview,
      provider_used:
        (typeof nested?.provider_used === "string"
          ? nested.provider_used
          : undefined) ?? existing?.provider_used,
      model_used:
        (typeof nested?.model_used === "string" ? nested.model_used : undefined) ??
        existing?.model_used,
      tokens_saved:
        (typeof nested?.tokens_saved === "number"
          ? nested.tokens_saved
          : undefined) ?? existing?.tokens_saved,
      resultText:
        (typeof nested?.result === "string" ? nested.result : undefined) ??
        existing?.resultText,
      error: task.error ?? existing?.error,
    });
  }

  return [...map.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS);
}

export function analyticsFromHistory(items: LocalHistoryItem[]) {
  const total = items.length;
  const success = items.filter((item) => item.status === "success").length;
  const errors = items.filter((item) => item.status === "error").length;
  const tokens = items.reduce((sum, item) => sum + (item.tokens_saved ?? 0), 0);

  const byIntent = new Map<string, number>();
  const byModel = new Map<string, number>();
  for (const item of items) {
    if (item.intent) byIntent.set(item.intent, (byIntent.get(item.intent) ?? 0) + 1);
    const model = item.model_used ?? item.model;
    if (model) byModel.set(model, (byModel.get(model) ?? 0) + 1);
  }

  const topIntent = [...byIntent.entries()].sort((a, b) => b[1] - a[1])[0];
  const topModel = [...byModel.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    total,
    success,
    errors,
    successRate: total === 0 ? 0 : Math.round((success / total) * 100),
    tokensSaved: tokens,
    topIntent: topIntent?.[0] ?? "—",
    topModel: topModel?.[0] ?? "—",
  };
}
