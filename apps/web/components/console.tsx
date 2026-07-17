"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { MarkdownResult } from "./markdown";
import styles from "./console.module.css";

const TOKEN_KEY = "uag_web_token";
const INTENTS = ["chat", "coding", "reasoning", "documentation", "review"] as const;

type Intent = (typeof INTENTS)[number];

type HealthResponse = {
  status?: string;
  message?: string;
  providers?: Array<{ id: string; healthy: boolean; model_count: number }>;
};

type StatsResponse = {
  stats?: { totalRequestsDelegated: number; totalTokensSaved: number };
  message?: string;
};

type RoutingResponse = {
  chains?: Array<{
    task: string;
    plans: Array<{ providerId: string; model: string }>;
  }>;
  models?: string[];
};

type TaskListItem = {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  metadata?: { promptPreview?: string; intent?: string; model?: string };
  result?: unknown;
};

type DelegateResult = {
  status?: string;
  request_id?: string;
  message?: string;
  result?: unknown;
  error?: string;
  provider_used?: string;
  model_used?: string;
  tokens_saved?: number;
  elapsed_ms?: number;
  cached?: boolean;
};

function authHeaders(token: string): HeadersInit {
  if (!token.trim()) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token.trim()}`,
  };
}

async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...authHeaders(token),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function extractResultText(payload: DelegateResult | null): string {
  if (!payload) return "";
  if (typeof payload.result === "string") return payload.result;
  if (payload.result && typeof payload.result === "object") {
    const nested = payload.result as { result?: unknown };
    if (typeof nested.result === "string") return nested.result;
    return JSON.stringify(payload.result, null, 2);
  }
  if (payload.message) return payload.message;
  if (payload.error) return payload.error;
  return JSON.stringify(payload, null, 2);
}

/** Flatten nested get_task_result payloads so meta fields surface correctly. */
function displayResult(payload: DelegateResult | null): DelegateResult | null {
  if (!payload) return null;
  if (!payload.result || typeof payload.result !== "object") return payload;

  const nested = payload.result as DelegateResult & { result?: unknown };
  if (typeof nested.result !== "string" && !nested.provider_used && !nested.model_used) {
    return payload;
  }

  return {
    ...payload,
    status: nested.status ?? payload.status,
    request_id: payload.request_id ?? nested.request_id,
    provider_used: nested.provider_used ?? payload.provider_used,
    model_used: nested.model_used ?? payload.model_used,
    tokens_saved: nested.tokens_saved ?? payload.tokens_saved,
    cached: nested.cached ?? payload.cached,
    message: nested.message ?? payload.message,
    error: nested.error ?? payload.error,
    result: typeof nested.result === "string" ? nested.result : payload.result,
  };
}

export function OperatorConsole() {
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [intent, setIntent] = useState<Intent>("coding");
  const [model, setModel] = useState("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [result, setResult] = useState<DelegateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }, [token]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshMeta = useCallback(async () => {
    const [healthRes, statsRes, routingRes, tasksRes] = await Promise.all([
      apiFetch<HealthResponse>("/api/health", token),
      apiFetch<StatsResponse>("/api/stats", token),
      apiFetch<RoutingResponse>("/api/routing", token),
      apiFetch<{ tasks?: TaskListItem[] }>("/api/tasks", token),
    ]);

    if (healthRes.data.status === "error" && !healthRes.ok) {
      setError(
        (healthRes.data as { message?: string }).message ??
          "Failed to reach gateway."
      );
    } else {
      setError(null);
    }

    setHealth(healthRes.data);
    setStats(statsRes.data);
    setRouting(routingRes.data);
    setTasks(tasksRes.data.tasks ?? []);
  }, [token]);

  useEffect(() => {
    void refreshMeta();
    const id = setInterval(() => void refreshMeta(), 30_000);
    return () => clearInterval(id);
  }, [refreshMeta]);

  const pollTask = useCallback(
    async (requestId: string) => {
      const res = await apiFetch<DelegateResult>(
        `/api/tasks/${encodeURIComponent(requestId)}`,
        token
      );
      setResult(res.data);
      setActiveRequestId(requestId);

      const status = res.data.status;
      if (status === "success" || status === "error" || status === "not_found") {
        stopPolling();
        setBusy(false);
        void refreshMeta();
      }
    },
    [token, stopPolling, refreshMeta]
  );

  const startPolling = useCallback(
    (requestId: string) => {
      stopPolling();
      setActiveRequestId(requestId);
      pollRef.current = setInterval(() => void pollTask(requestId), 3000);
    },
    [pollTask, stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);
    stopPolling();

    try {
      const res = await apiFetch<DelegateResult>("/api/delegate", token, {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.trim(),
          intent,
          specific_model: model || undefined,
        }),
      });

      setResult(res.data);
      const requestId = res.data.request_id;

      if (
        requestId &&
        (res.data.status === "pending" || res.data.status === "timeout")
      ) {
        startPolling(requestId);
        return;
      }

      setBusy(false);
      if (requestId) setActiveRequestId(requestId);
      void refreshMeta();
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSelectTask = async (task: TaskListItem) => {
    setBusy(true);
    setError(null);
    stopPolling();
    await pollTask(task.id);
    if (task.status === "pending" || task.status === "timeout") {
      startPolling(task.id);
    } else {
      setBusy(false);
    }
  };

  const healthLabel = useMemo(() => {
    if (!health) return "…";
    if (health.status === "ok") return "healthy";
    if (health.status === "degraded") return "degraded";
    return health.status ?? "unknown";
  }, [health]);

  const models = routing?.models ?? [];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>Universal AI Gateway</p>
          <h1 className={styles.title}>Operator Console</h1>
        </div>
        <div className={styles.meta}>
          <span
            className={`${styles.badge} ${
              health?.status === "ok"
                ? styles.badgeOk
                : health?.status === "degraded"
                  ? styles.badgeWarn
                  : styles.badgeBad
            }`}
          >
            {healthLabel}
          </span>
          <span className={styles.chip}>
            delegated {stats?.stats?.totalRequestsDelegated ?? 0}
          </span>
          <span className={styles.chip}>
            ~{stats?.stats?.totalTokensSaved ?? 0} tokens saved
          </span>
        </div>
      </header>

      <label className={styles.tokenRow}>
        <span>Bearer token</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Only needed if UAG_WEB_TOKEN is set"
          autoComplete="off"
        />
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Playground</h2>
          <form className={styles.form} onSubmit={onSubmit}>
            <label>
              Intent
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as Intent)}
              >
                {INTENTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Model (optional)
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Auto-route</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.promptLabel}>
              Prompt
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={10}
                placeholder="Describe the task for a downstream model…"
                required
              />
            </label>

            <button type="submit" disabled={busy || !prompt.trim()}>
              {busy ? "Running…" : "Delegate"}
            </button>
          </form>
        </section>

        <section className={styles.panel}>
          <h2>Result</h2>
          {(() => {
            const shown = displayResult(result);
            return (
              <>
                {shown ? (
                  <div className={styles.resultMeta}>
                    <div>
                      <span className={styles.muted}>status</span>
                      <strong>{shown.status}</strong>
                    </div>
                    <div>
                      <span className={styles.muted}>request_id</span>
                      <code>{shown.request_id ?? activeRequestId ?? "—"}</code>
                    </div>
                    <div>
                      <span className={styles.muted}>provider / model</span>
                      <code>
                        {shown.provider_used ?? "—"} / {shown.model_used ?? "—"}
                      </code>
                    </div>
                    {typeof shown.elapsed_ms === "number" ? (
                      <div>
                        <span className={styles.muted}>elapsed</span>
                        <strong>{Math.round(shown.elapsed_ms / 1000)}s</strong>
                      </div>
                    ) : null}
                    {typeof shown.tokens_saved === "number" ? (
                      <div>
                        <span className={styles.muted}>tokens saved</span>
                        <strong>~{shown.tokens_saved}</strong>
                      </div>
                    ) : null}
                    {shown.cached ? (
                      <div>
                        <span className={styles.muted}>cache</span>
                        <strong>hit</strong>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className={styles.muted}>Submit a task to see output here.</p>
                )}
                {shown ? (
                  <MarkdownResult content={extractResultText(shown)} />
                ) : null}
              </>
            );
          })()}
        </section>
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>History</h2>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => void refreshMeta()}
            >
              Refresh
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className={styles.muted}>No tasks yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Intent</th>
                    <th>Preview</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className={
                        activeRequestId === task.id ? styles.rowActive : undefined
                      }
                      onClick={() => void onSelectTask(task)}
                    >
                      <td>
                        <code>{task.status}</code>
                      </td>
                      <td>{task.metadata?.intent ?? "—"}</td>
                      <td className={styles.preview}>
                        {task.metadata?.promptPreview ?? task.id}
                      </td>
                      <td>{formatTime(task.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <h2>Routing</h2>
          {!routing?.chains?.length ? (
            <p className={styles.muted}>Routing unavailable.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Intent</th>
                    <th>Fallback chain</th>
                  </tr>
                </thead>
                <tbody>
                  {routing.chains.map((chain) => (
                    <tr key={chain.task}>
                      <td>
                        <code>{chain.task}</code>
                      </td>
                      <td>
                        {chain.plans
                          .map((plan) => `${plan.providerId}:${plan.model}`)
                          .join(" → ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {health?.providers?.length ? (
            <ul className={styles.providerList}>
              {health.providers.map((provider) => (
                <li key={provider.id}>
                  <span
                    className={
                      provider.healthy ? styles.dotOk : styles.dotBad
                    }
                  />
                  {provider.id} · {provider.model_count} models
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
