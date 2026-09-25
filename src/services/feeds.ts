import { call } from "../api";
import { getState, setCache } from "../store";
import type { FeedItem, FeedSource } from "../types";

export async function refreshFeed(f: FeedSource) {
  const prev = getState().cache.feeds[f.id];
  let next;
  try {
    const items = await call<FeedItem[]>("fetch_feed", { url: f.url });
    next = { ts: Date.now(), items };
  } catch (e) {
    next = { ts: Date.now(), items: prev?.items ?? [], error: e instanceof Error ? e.message : String(e) };
  }
  setCache({ feeds: { ...getState().cache.feeds, [f.id]: next } });
}

export function refreshAllFeeds() {
  return Promise.all(getState().feeds.filter((f) => f.enabled).map(refreshFeed));
}

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
