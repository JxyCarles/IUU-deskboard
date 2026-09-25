import { useMemo } from "react";
import { openUrl } from "../api";
import { mergedFeed } from "../services/feeds";
import { useStore } from "../store";
import { relTime } from "../utils";
import { Empty, stop, WHead, type WidgetProps } from "./common";

export default function NewsWidget({ w }: WidgetProps) {
  const feeds = useStore((s) => s.feeds);
  const cache = useStore((s) => s.cache.feeds);
  const items = useMemo(() => {
    const src = w.config.sourceId ? feeds.filter((f) => f.id === w.config.sourceId) : feeds;
    return mergedFeed(src, cache);
  }, [feeds, cache, w.config.sourceId]);
  const title = w.config.sourceId ? feeds.find((f) => f.id === w.config.sourceId)?.name ?? "资讯" : "资讯";

  if (w.size === "s") {
    const it = items[0];
    return (
      <div className="news-s">
        <WHead icon="news" title={title} color="var(--c-news)" />
        {it ? (
          <div
            className="news-s-item"
            onClick={(e) => {
              stop(e);
              openUrl(it.link);
            }}
          >
            <div className="news-s-title">{it.title}</div>
            <div className="muted small">
              {it.source} · {it.time ? relTime(it.time) : ""}
            </div>
          </div>
        ) : (
          <Empty>暂无资讯</Empty>
        )}
      </div>
    );
  }

  const max = w.size === "m" ? 4 : w.size === "l" ? 9 : 16;
  return (
    <div className="news-l">
      <WHead icon="news" title={title} color="var(--c-news)" right={`${items.length} 条`} />
      <div className={"news-list" + (w.size === "xl" ? " two-col" : "")}>
        {items.length === 0 && <Empty>暂无资讯，稍后自动刷新</Empty>}
        {items.slice(0, max).map((it, i) => (
          <div
            key={it.link + i}
            className="news-item"
            onClick={(e) => {
              stop(e);
              openUrl(it.link);
            }}
          >
            <div className="news-title">{it.title}</div>
            <div className="news-meta">
              {it.source}
              {it.time ? ` · ${relTime(it.time)}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
