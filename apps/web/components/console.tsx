"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  analyticsFromHistory,
  loadLocalHistory,
  mergeServerAndLocalHistory,
  saveLocalHistory,
  upsertLocalHistory,
  type LocalHistoryItem,
} from "../lib/clientHistory";
import { PROMPT_TEMPLATES } from "../lib/templates";
import { CopyResultButton } from "./copyButton";
import { MarkdownResult, splitResultContent } from "./markdown";
import styles from "./console.module.css";

const TOKEN_KEY = "uag_web_token";
const MODE_KEY = "uag_console_mode";
const INTENTS = ["chat", "coding", "reasoning", "documentation", "review"] as const;

type Intent = (typeof INTENTS)[number];
type Mode = "single" | "thread" | "compare";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type HealthResponse = {
  status?: string;
  message?: string;
  providers?: Array<{ id: string; healthy: boolean; model_count: number }>;
};

type StatsResponse = {
  stats?: { totalRequestsDelegated: number; totalTokensSaved: number };
};

type RoutingResponse = {
  chains?: Array<{
    task: string;
    plans: Array<{ providerId: string; model: string; deferred?: boolean }>;
  }>;
  models?: string[];
  unhealthy_providers?: string[];
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

function toHistoryItem(
  shown: DelegateResult,
  meta: { intent: Intent; promptPreview: string; model?: string }
): LocalHistoryItem {
  const text = extractResultText(shown);
  return {
    id: shown.request_id ?? `local-${Date.now()}`,
    status: shown.status ?? "unknown",
    createdAt: Date.now() - (shown.elapsed_ms ?? 0),
    updatedAt: Date.now(),
    intent: meta.intent,
    model: meta.model,
    promptPreview: meta.promptPreview.slice(0, 200),
    provider_used: shown.provider_used,
    model_used: shown.model_used,
    tokens_saved: shown.tokens_saved,
    resultText: text,
    error: shown.error,
  };
}

async function waitForTask(
  token: string,
  requestId: string,
  onTick: (payload: DelegateResult) => void
): Promise<DelegateResult> {
  for (;;) {
    const res = await apiFetch<DelegateResult>(
      `/api/tasks/${encodeURIComponent(requestId)}`,
      token
    );
    onTick(res.data);
    const status = res.data.status;
    if (status === "success" || status === "error" || status === "not_found") {
      return res.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export function OperatorConsole() {
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [intent, setIntent] = useState<Intent>("coding");
  const [model, setModel] = useState("");
  const [compareModelB, setCompareModelB] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [history, setHistory] = useState<LocalHistoryItem[]>([]);
  const [result, setResult] = useState<DelegateResult | null>(null);
  const [compareResultB, setCompareResultB] = useState<DelegateResult | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copyFlash, setCopyFlash] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY) ?? "");
      const savedMode = localStorage.getItem(MODE_KEY);
      if (savedMode === "single" || savedMode === "thread" || savedMode === "compare") {
        setMode(savedMode);
      }
      setHistory(loadLocalHistory());
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

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    if (!busy || startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy, startedAt]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const rememberResult = useCallback(
    (payload: DelegateResult, promptPreview: string, usedModel?: string) => {
      const shown = displayResult(payload);
      if (!shown?.request_id) return;
      if (shown.status !== "success" && shown.status !== "error") return;
      setHistory((prev) =>
        upsertLocalHistory(
          prev,
          toHistoryItem(shown, {
            intent,
            promptPreview,
            model: usedModel || model || undefined,
          })
        )
      );
    },
    [intent, model]
  );

  const refreshMeta = useCallback(async () => {
    const [healthRes, statsRes, routingRes, tasksRes] = await Promise.all([
      apiFetch<HealthResponse>("/api/health", token),
      apiFetch<StatsResponse>("/api/stats", token),
      apiFetch<RoutingResponse>("/api/routing", token),
      apiFetch<{ tasks?: Parameters<typeof mergeServerAndLocalHistory>[0] }>(
        "/api/tasks",
        token
      ),
    ]);

    if (healthRes.data.status === "error" && !healthRes.ok) {
      setError(
        (healthRes.data as { message?: string }).message ??
          "Failed to reach gateway."
      );
    } else if (healthRes.status === 429) {
      setError((healthRes.data as { message?: string }).message ?? "Rate limited.");
    } else {
      setError(null);
    }

    setHealth(healthRes.data);
    setStats(statsRes.data);
    setRouting(routingRes.data);

    const local = loadLocalHistory();
    const merged = mergeServerAndLocalHistory(tasksRes.data.tasks ?? [], local);
    saveLocalHistory(merged);
    setHistory(merged);
  }, [token]);

  useEffect(() => {
    void refreshMeta();
    const id = setInterval(() => void refreshMeta(), 30_000);
    return () => clearInterval(id);
  }, [refreshMeta]);

  const pollTask = useCallback(
    async (requestId: string, promptPreview: string) => {
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
        setStartedAt(null);
        rememberResult(res.data, promptPreview);
        void refreshMeta();
      }
    },
    [token, stopPolling, refreshMeta, rememberResult]
  );

  const startPolling = useCallback(
    (requestId: string, promptPreview: string) => {
      stopPolling();
      setActiveRequestId(requestId);
      pollRef.current = setInterval(
        () => void pollTask(requestId, promptPreview),
        3000
      );
    },
    [pollTask, stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const runDelegate = async (opts: {
    promptText: string;
    specificModel?: string;
    messages?: ChatMessage[];
    onUpdate: (payload: DelegateResult) => void;
  }) => {
    const res = await apiFetch<DelegateResult>("/api/delegate", token, {
      method: "POST",
      body: JSON.stringify({
        prompt: opts.promptText,
        intent,
        specific_model: opts.specificModel || undefined,
        messages: opts.messages,
      }),
    });

    opts.onUpdate(res.data);
    const requestId = res.data.request_id;

    if (
      requestId &&
      (res.data.status === "pending" || res.data.status === "timeout")
    ) {
      return waitForTask(token, requestId, opts.onUpdate);
    }

    return res.data;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setCompareResultB(null);
    setStartedAt(Date.now());
    setNow(Date.now());
    stopPolling();

    const promptText = prompt.trim();

    try {
      if (mode === "compare") {
        if (!model || !compareModelB || model === compareModelB) {
          setBusy(false);
          setStartedAt(null);
          setError("Compare mode needs two different models.");
          return;
        }

        const [a, b] = await Promise.all([
          runDelegate({
            promptText,
            specificModel: model,
            onUpdate: setResult,
          }),
          runDelegate({
            promptText,
            specificModel: compareModelB,
            onUpdate: setCompareResultB,
          }),
        ]);

        rememberResult(a, promptText, model);
        rememberResult(b, promptText, compareModelB);
        setBusy(false);
        setStartedAt(null);
        void refreshMeta();
        return;
      }

      if (mode === "thread") {
        const nextMessages: ChatMessage[] = [
          ...thread,
          { role: "user", content: promptText },
        ];
        const final = await runDelegate({
          promptText,
          specificModel: model || undefined,
          messages: nextMessages,
          onUpdate: (payload) => {
            setResult(payload);
            if (payload.request_id) setActiveRequestId(payload.request_id);
          },
        });

        const shown = displayResult(final);
        const assistantText = splitResultContent(extractResultText(shown)).body;
        setThread([
          ...nextMessages,
          { role: "assistant", content: assistantText || "(empty response)" },
        ]);
        setPrompt("");
        rememberResult(final, promptText);
        setBusy(false);
        setStartedAt(null);
        void refreshMeta();
        return;
      }

      // single
      const final = await runDelegate({
        promptText,
        specificModel: model || undefined,
        onUpdate: (payload) => {
          setResult(payload);
          if (payload.request_id) setActiveRequestId(payload.request_id);
        },
      });

      const requestId = final.request_id;
      if (
        requestId &&
        (final.status === "pending" || final.status === "timeout")
      ) {
        // waitForTask already resolved above in runDelegate
      }

      rememberResult(final, promptText);
      setBusy(false);
      setStartedAt(null);
      if (requestId) setActiveRequestId(requestId);
      void refreshMeta();
    } catch (err: unknown) {
      setBusy(false);
      setStartedAt(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSelectHistory = (item: LocalHistoryItem) => {
    stopPolling();
    setActiveRequestId(item.id);
    setBusy(false);
    setStartedAt(null);
    setCompareResultB(null);
    setResult({
      status: item.status,
      request_id: item.id,
      provider_used: item.provider_used,
      model_used: item.model_used,
      tokens_saved: item.tokens_saved,
      result: item.resultText,
      error: item.error,
    });
    if (item.status === "pending" || item.status === "timeout") {
      setBusy(true);
      setStartedAt(Date.now());
      startPolling(item.id, item.promptPreview ?? item.id);
    }
  };

  const applyTemplate = (id: string) => {
    const template = PROMPT_TEMPLATES.find((item) => item.id === id);
    if (!template) return;
    setIntent(template.intent);
    setPrompt(template.prompt);
  };

  const healthLabel = useMemo(() => {
    if (!health) return "…";
    if (health.status === "ok") return "healthy";
    if (health.status === "degraded") return "degraded";
    return health.status ?? "unknown";
  }, [health]);

  const models = routing?.models ?? [];
  const analytics = useMemo(() => analyticsFromHistory(history), [history]);
  const elapsedSec =
    busy && startedAt != null ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null;

  const shown = displayResult(result);
  const shownB = displayResult(compareResultB);
  const resultText = extractResultText(shown);

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
            session {stats?.stats?.totalRequestsDelegated ?? 0}
          </span>
          <span className={styles.chip}>
            ~{stats?.stats?.totalTokensSaved ?? 0} tok
          </span>
          {elapsedSec != null ? (
            <span className={`${styles.chip} ${styles.chipPulse}`}>
              running {elapsedSec}s
            </span>
          ) : null}
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

      <div className={styles.modeRow}>
        {(["single", "thread", "compare"] as Mode[]).map((value) => (
          <button
            key={value}
            type="button"
            className={mode === value ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode(value)}
            disabled={busy}
          >
            {value}
          </button>
        ))}
        {mode === "thread" ? (
          <button
            type="button"
            className={styles.ghost}
            disabled={busy || thread.length === 0}
            onClick={() => setThread([])}
          >
            Clear thread
          </button>
        ) : null}
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Playground</h2>
          <form className={styles.form} onSubmit={onSubmit}>
            <label>
              Template
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyTemplate(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Choose a preset…</option>
                {PROMPT_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

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
              {mode === "compare" ? "Model A" : "Model (optional)"}
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {mode === "compare" ? null : <option value="">Auto-route</option>}
                {mode === "compare" && !model ? (
                  <option value="">Select model A</option>
                ) : null}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            {mode === "compare" ? (
              <label>
                Model B
                <select
                  value={compareModelB}
                  onChange={(e) => setCompareModelB(e.target.value)}
                >
                  <option value="">Select model B</option>
                  {models.map((m) => (
                    <option key={`b-${m}`} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {mode === "thread" && thread.length > 0 ? (
              <div className={styles.threadPreview}>
                {thread.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={styles.threadItem}>
                    <strong>{message.role}</strong>
                    <span>{message.content.slice(0, 180)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <label className={styles.promptLabel}>
              Prompt
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={10}
                placeholder={
                  mode === "thread"
                    ? "Continue the conversation…"
                    : "Describe the task for a downstream model…"
                }
                required
              />
            </label>

            <button type="submit" disabled={busy || !prompt.trim()}>
              {busy
                ? elapsedSec != null
                  ? `Running… ${elapsedSec}s`
                  : "Running…"
                : mode === "compare"
                  ? "Compare"
                  : mode === "thread"
                    ? "Send"
                    : "Delegate"}
            </button>
            {mode === "compare" ? (
              <p className={styles.muted}>
                Compare runs two models (uses 2 free-model calls). Prefer fast models.
              </p>
            ) : null}
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Result</h2>
            {resultText ? (
              <button
                type="button"
                className={styles.ghost}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      splitResultContent(resultText).body
                    );
                    setCopyFlash(true);
                    setTimeout(() => setCopyFlash(false), 1200);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {copyFlash ? "Copied" : "Copy"}
              </button>
            ) : null}
          </div>

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
            </div>
          ) : (
            <p className={styles.muted}>Submit a task to see output here.</p>
          )}

          {mode === "compare" ? (
            <div className={styles.compareGrid}>
              <div>
                <p className={styles.compareLabel}>A · {model || "—"}</p>
                {shown ? <MarkdownResult content={extractResultText(shown)} /> : null}
              </div>
              <div>
                <p className={styles.compareLabel}>B · {compareModelB || "—"}</p>
                {shownB ? (
                  <MarkdownResult content={extractResultText(shownB)} />
                ) : (
                  <p className={styles.muted}>Waiting…</p>
                )}
              </div>
            </div>
          ) : shown ? (
            <>
              <CopyResultButton content={resultText} />
              <MarkdownResult content={resultText} />
            </>
          ) : null}
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
          <p className={styles.muted}>
            Merged server + browser history (survives Vercel cold starts in this browser).
          </p>
          {history.length === 0 ? (
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
                  {history.map((task) => (
                    <tr
                      key={task.id}
                      className={
                        activeRequestId === task.id ? styles.rowActive : undefined
                      }
                      onClick={() => onSelectHistory(task)}
                    >
                      <td>
                        <code>{task.status}</code>
                      </td>
                      <td>{task.intent ?? "—"}</td>
                      <td className={styles.preview}>
                        {task.promptPreview ?? task.id}
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
          <h2>Analytics</h2>
          <div className={styles.analyticsGrid}>
            <div>
              <span className={styles.muted}>local tasks</span>
              <strong>{analytics.total}</strong>
            </div>
            <div>
              <span className={styles.muted}>success rate</span>
              <strong>{analytics.successRate}%</strong>
            </div>
            <div>
              <span className={styles.muted}>tokens saved</span>
              <strong>~{analytics.tokensSaved}</strong>
            </div>
            <div>
              <span className={styles.muted}>top intent</span>
              <strong>{analytics.topIntent}</strong>
            </div>
            <div>
              <span className={styles.muted}>top model</span>
              <code>{analytics.topModel}</code>
            </div>
            <div>
              <span className={styles.muted}>errors</span>
              <strong>{analytics.errors}</strong>
            </div>
          </div>

          <h2 className={styles.subhead}>Routing</h2>
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
                          .map(
                            (plan) =>
                              `${plan.providerId}:${plan.model}${
                                plan.deferred ? " (deferred)" : ""
                              }`
                          )
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
                    className={provider.healthy ? styles.dotOk : styles.dotBad}
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
