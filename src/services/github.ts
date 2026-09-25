import { call } from "../api";
import { getState, setCache } from "../store";
import type { GithubRepo } from "../types";

export interface TrendingQuery {
  since: "daily" | "weekly" | "monthly";
  language: string;
  mode: "web" | "api";
}

export const DEFAULT_QUERY: TrendingQuery = { since: "daily", language: "", mode: "web" };

export const SINCE_LABEL = { daily: "今日", weekly: "本周", monthly: "本月" } as const;

export const LANGUAGES = ["", "python", "typescript", "javascript", "rust", "go", "java", "c++", "c#", "swift", "kotlin", "vue", "shell", "jupyter-notebook"];

export const keyOf = (q: TrendingQuery) => `${q.mode}|${q.since}|${q.language.trim().toLowerCase()}`;

/** 小组件配置 → 查询条件 */
export function queryOf(cfg: Record<string, string | undefined>): TrendingQuery {
  return {
    since: (cfg.since as TrendingQuery["since"]) || "daily",
    language: cfg.language ?? "",
    mode: (cfg.mode as TrendingQuery["mode"]) || "web",
  };
}

const inflight = new Map<string, Promise<void>>();

export function refreshTrending(q: TrendingQuery): Promise<void> {
  const key = keyOf(q);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const prev = getState().cache.github?.[key];
    let next;
    try {
      const items = await call<GithubRepo[]>("github_trending", { since: q.since, language: q.language || null, mode: q.mode });
      next = { ts: Date.now(), items };
    } catch (e) {
      next = { ts: Date.now(), items: prev?.items ?? [], error: e instanceof Error ? e.message : String(e) };
    }
    setCache({ github: { ...(getState().cache.github ?? {}), [key]: next } });
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** 刷新所有 GitHub 小组件用到的查询 */
export function refreshAllTrending() {
  const qs = new Map<string, TrendingQuery>();
  for (const w of getState().widgets) {
    if (w.type === "github") {
      const q = queryOf(w.config);
      qs.set(keyOf(q), q);
    }
  }
  return Promise.all([...qs.values()].map(refreshTrending));
}

export function fmtStars(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
}
