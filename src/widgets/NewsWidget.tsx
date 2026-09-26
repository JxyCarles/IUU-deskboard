import { useEffect, useMemo } from "react";
import BriefBlock from "../components/BriefBlock";
import { ensureBrief, generateBrief, newsBriefKey, newsInput, orderSections } from "../services/brief";
import { mergedFeed, openReader, sourceColor, type MergedItem } from "../services/feeds";
import { useStore } from "../store";
import type { FeedSource } from "../types";
import { relTime } from "../utils";
import { Empty, stop, useNav, WHead, type WidgetProps } from "./common";

function Section({ source, items, max, color }: { source: FeedSource; items: MergedItem[]; max: number; color: string }) {
  const nav = useNav();
  return (
    <div className="news-sec">
      <button
        className="news-sec-h"
        style={{ color }}
        onClick={(e) => {
          stop(e);
          nav.open("news", source.id);
        }}
        title={`查看「${source.name}」的全部资讯`}
      >
        <i style={{ background: color }} />
        {source.name}
        <span className="news-sec-more">›</span>
      </button>
      {items.slice(0, max).map((it, i) => (
        <div
          key={it.link + i}
          className="news-item"
          onClick={(e) => {
            stop(e);
            openReader(it);
          }}
          title={it.title}
        >
          <span className="news-title">{it.title}</span>
          {it.time > 0 && <span className="news-time">{relTime(it.time)}</span>}
        </div>
      ))}
      {items.length === 0 && <div className="muted tiny">暂无内容</div>}
    </div>
  );
}

/** 小组件里的内容块：AI 简报 + 各资讯来源。顺序和显示在小组件设置里调整 */
export function newsSections(feeds: FeedSource[], sourceId?: string) {
  return [
    { id: "brief", name: "✨ AI 简报" },
    ...feeds.filter((f) => f.enabled && (!sourceId || f.id === sourceId)).map((f) => ({ id: f.id, name: f.name })),
  ];
}

export default function NewsWidget({ w }: WidgetProps) {
  const feeds = useStore((s) => s.feeds);
  const cache = useStore((s) => s.cache.feeds);
  const sourceId = w.config.sourceId;
  const key = newsBriefKey(sourceId);

  const sections = useMemo(
    () => orderSections(newsSections(feeds, sourceId).map((x) => x.id), w.config.order, w.config.hide),
    [feeds, sourceId, w.config.order, w.config.hide],
  );
  const hasItems = feeds.some((f) => f.enabled && (!sourceId || f.id === sourceId) && (cache[f.id]?.items.length ?? 0) > 0);
  const showBrief = sections.includes("brief");

  // 资讯到了、简报过期就自动整理一次（设置里可关）
  useEffect(() => {
    if (showBrief && hasItems) ensureBrief(key, "news", newsInput(sourceId));
  }, [showBrief, hasItems, key, cache]);

  if (!feeds.some((f) => f.enabled)) return <Empty>在资讯页面里添加资讯源</Empty>;
  if (!hasItems) {
    return (
      <div className="news-l">
        <WHead icon="news" title="资讯" color="var(--c-news)" />
        <Empty>暂无资讯，稍后自动刷新</Empty>
      </div>
    );
  }

  const per = { s: 3, m: 4, l: 6, xl: 6 }[w.size];
  const briefMax = { s: 1, m: 2, l: 3, xl: 4 }[w.size];
  const regen = () => generateBrief(key, "news", newsInput(sourceId));

  return (
    <div className={"w-scroll news-scroll" + (w.size === "xl" ? " cols-2" : "")}>
      {sections.map((id) => {
        if (id === "brief") return <BriefBlock key="brief" briefKey={key} title={sourceId ? `${feeds.find((f) => f.id === sourceId)?.name ?? "资讯"} 简报` : "资讯简报"} max={briefMax} regen={regen} />;
        const f = feeds.find((x) => x.id === id);
        if (!f) return null;
        return <Section key={id} source={f} items={mergedFeed([f], cache)} max={per} color={sourceColor(feeds, f.id)} />;
      })}
    </div>
  );
}
