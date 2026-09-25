import { useSyncExternalStore } from "react";
import { call } from "../api";
import { getState, setCache, setState } from "../store";
import type { FeedItem, FeedSource } from "../types";

// 正文只放在内存里：全文可能有几 MB，不写进 data.json（重启后下一次刷新会补上）
const contents = new Map<string, string>();
export const contentOf = (link: string) => contents.get(link);

export async function refreshFeed(f: FeedSource) {
  const prev = getState().cache.feeds[f.id];
  let next;
  try {
    const raw = await call<FeedItem[]>("fetch_feed", { url: f.url });
    const items = raw.map(({ content, ...it }) => {
      if (content) contents.set(it.link, content);
      return it;
    });
    next = { ts: Date.now(), items };
  } catch (e) {
    next = { ts: Date.now(), items: prev?.items ?? [], error: e instanceof Error ? e.message : String(e) };
  }
  setCache({ feeds: { ...getState().cache.feeds, [f.id]: next } });
}

export function refreshAllFeeds() {
  return Promise.all(getState().feeds.filter((f) => f.enabled).map(refreshFeed));
}

/** 调整资讯源顺序（小组件和资讯页都按这个顺序显示） */
export function moveFeed(id: string, to: number) {
  setState((s) => {
    const list = [...s.feeds];
    const from = list.findIndex((f) => f.id === id);
    if (from < 0) return s;
    const [f] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, f);
    return { ...s, feeds: list };
  });
}

/** 每个资讯源一个颜色，取自主题配色 */
const SOURCE_COLORS = ["var(--c-news)", "var(--c-tasks)", "var(--c-project)", "var(--c-ai)", "var(--c-calendar)", "var(--c-notes)", "var(--c-agenda)", "var(--c-github)"];
export const sourceColor = (feeds: FeedSource[], id: string) => SOURCE_COLORS[Math.max(0, feeds.findIndex((f) => f.id === id)) % SOURCE_COLORS.length];

export interface MergedItem extends FeedItem {
  source: string;
  sourceId: string;
  time: number;
}

/** 把所有启用的资讯源合并，按时间倒序 */
export function mergedFeed(feeds: FeedSource[], cache: Record<string, { items: FeedItem[] }>): MergedItem[] {
  const out: MergedItem[] = [];
  for (const f of feeds) {
    if (!f.enabled) continue;
    for (const it of cache[f.id]?.items ?? []) {
      out.push({ ...it, source: f.name, sourceId: f.id, time: it.published ? Date.parse(it.published) : 0 });
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

// ---------- 快速浏览 ----------

let reading: MergedItem | null = null;
const listeners = new Set<() => void>();

export function openReader(item: MergedItem) {
  reading = item;
  listeners.forEach((l) => l());
}

export function closeReader() {
  reading = null;
  listeners.forEach((l) => l());
}

export function useReader() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => reading,
  );
}
