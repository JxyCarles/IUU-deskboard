//! AI 简报：把资讯 / GitHub 热门交给 AI 总结成“一句话总览 + 若干要点”，
//! 优先挑出和用户关注方向相关的内容。要点通过编号引用原条目，链接来自原数据，AI 不会编造网址。

import { useSyncExternalStore } from "react";
import { isTauri } from "../api";
import { getState, setCache } from "../store";
import type { Brief, BriefPoint, GithubRepo } from "../types";
import { today } from "../utils";
import { aiJson } from "./ai";
import { mergedFeed } from "./feeds";

export interface SourceItem {
  title: string;
  detail?: string;
  source?: string;
  link: string;
}

export const newsBriefKey = (sourceId?: string) => `news:${sourceId || "all"}`;
export const githubBriefKey = (queryKey: string) => `github:${queryKey}`;

/** 资讯：按时间倒序，每个来源最多 15 条，总共最多 60 条 */
export function newsInput(sourceId?: string): SourceItem[] {
  const s = getState();
  const feeds = s.feeds.filter((f) => f.enabled && (!sourceId || f.id === sourceId));
  const per = new Map<string, number>();
  return mergedFeed(feeds, s.cache.feeds)
    .filter((it) => {
      const n = per.get(it.sourceId) ?? 0;
      per.set(it.sourceId, n + 1);
      return n < 15;
    })
    .slice(0, 60)
    .map((it) => ({ title: it.title, detail: it.summary?.slice(0, 120), source: it.source, link: it.link }));
}

export function githubInput(repos: GithubRepo[]): SourceItem[] {
  return repos.slice(0, 30).map((r) => ({
    title: r.name,
    detail: [r.description, r.language, r.period_stars != null ? `本期新增 ${r.period_stars} 星` : `${r.stars} 星`].filter(Boolean).join(" · "),
    link: r.url,
  }));
}

const KIND_TEXT = {
  news: "今天的资讯（来自多个 RSS 源）",
  github: "GitHub 当前的热门仓库",
};

const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const busy = new Set<string>();
const emit = () => listeners.forEach((l) => l());

export function useBriefBusy(key: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => busy.has(key),
  );
}

export function generateBrief(key: string, kind: "news" | "github", items: SourceItem[]): Promise<void> {
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    busy.add(key);
    emit();
    const interests = getState().settings.brief.interests.trim();
    const list = items.map((it, i) => `[${i + 1}] ${it.source ? `（${it.source}）` : ""}${it.title}${it.detail ? ` —— ${it.detail}` : ""}`).join("\n");
    const system = `你是用户的私人信息简报编辑。今天是 ${today()}。
下面是${KIND_TEXT[kind]}，每条前面有编号。请写一份简短的中文简报，只输出 JSON：
{"headline": "一句话总览，30 字以内", "points": [{"text": "要点，50 字以内，提到具体的项目名或事件", "tag": "关注 / 热点 / 好玩 / 工具 之一", "ref": 对应条目编号}]}
要求：
- points 最多 6 条，按重要程度排序；相同主题的多条合并成一条，ref 填最有代表性的那条。
- ${interests ? `用户关注：${interests}。与这些方向相关的内容优先写在前面，tag 标为「关注」。` : "用户没有填写关注方向，按普遍价值挑选。"}
- 有趣、新奇、适合动手玩的标为「好玩」；实用的开发工具或资源标为「工具」；其余重大事件标为「热点」。
- 只根据给出的条目写，不要编造。`;
    let next: Brief;
    try {
      const out = (await aiJson(system, list)) as { headline?: string; points?: { text?: string; tag?: string; ref?: number }[] };
      const points: BriefPoint[] = (out.points ?? [])
        .filter((x) => x?.text)
        .slice(0, 6)
        .map((x) => ({ text: String(x.text), tag: x.tag ? String(x.tag) : undefined, link: items[Number(x.ref) - 1]?.link }));
      next = { ts: Date.now(), headline: String(out.headline ?? ""), points };
    } catch (e) {
      const prev = getState().cache.briefs?.[key];
      next = { ...(prev ?? { headline: "", points: [] }), ts: prev?.ts ?? 0, error: e instanceof Error ? e.message : String(e) };
    }
    setCache({ briefs: { ...(getState().cache.briefs ?? {}), [key]: next } });
    busy.delete(key);
    emit();
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** 有数据、开了自动简报、且简报过期（或从没生成过）时自动生成一次 */
export function ensureBrief(key: string, kind: "news" | "github", items: SourceItem[]) {
  if (!isTauri || items.length === 0) return;
  const cfg = getState().settings.brief;
  if (!cfg.auto) return;
  const b = getState().cache.briefs?.[key];
  const stale = !b || Date.now() - b.ts > cfg.hours * 3600_000;
  // 上次失败的话 30 分钟内不自动重试，避免 Key 没配好时反复请求
  const recentlyFailed = b?.error && Date.now() - (b.ts || 0) < 30 * 60_000;
  if (stale && !recentlyFailed && !inflight.has(key)) generateBrief(key, kind, items);
}

// ---------- 完整简报弹窗 ----------

let open: { key: string; title: string; regen: () => void } | null = null;
const openListeners = new Set<() => void>();

export function openBrief(o: { key: string; title: string; regen: () => void }) {
  open = o;
  openListeners.forEach((l) => l());
}
export function closeBrief() {
  open = null;
  openListeners.forEach((l) => l());
}
export function useOpenBrief() {
  return useSyncExternalStore(
    (l) => {
      openListeners.add(l);
      return () => openListeners.delete(l);
    },
    () => open,
  );
}

/** 小组件里可排序的内容块：简报在最前，其余按默认顺序；config.order / config.hide 覆盖 */
export function orderSections(all: string[], order?: string, hide?: string): string[] {
  const hidden = new Set((hide ?? "").split(",").filter(Boolean));
  const pref = (order ?? "").split(",").filter((x) => all.includes(x));
  const rest = all.filter((x) => !pref.includes(x));
  return [...pref, ...rest].filter((x) => !hidden.has(x));
}
