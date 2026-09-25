import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { mergedFeed, openReader, sourceColor, type MergedItem } from "../services/feeds";
import { useStore } from "../store";
import type { FeedSource } from "../types";
import { relTime } from "../utils";
import { Empty, stop, useNav, WHead, type WidgetProps } from "./common";

interface Group {
  source: FeedSource;
  items: MergedItem[];
}

function Section({ g, max, color }: { g: Group; max: number; color: string }) {
  const nav = useNav();
  return (
    <div className="news-sec">
      <button
        className="news-sec-h"
        style={{ color }}
        onClick={(e) => {
          stop(e);
          nav.open("news", g.source.id);
        }}
        title={`查看「${g.source.name}」的全部资讯`}
      >
        <i style={{ background: color }} />
        {g.source.name}
        <span className="news-sec-more">›</span>
      </button>
      {g.items.slice(0, max).map((it, i) => (
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
      {g.items.length === 0 && <div className="muted tiny">暂无内容</div>}
    </div>
  );
}

export default function NewsWidget({ w }: WidgetProps) {
  const feeds = useStore((s) => s.feeds);
  const cache = useStore((s) => s.cache.feeds);
  // 按小组件实际高度决定能完整放下几个来源，避免最后一组被截掉一半
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // 按资讯源分组，顺序与「管理」里的排序一致
  const groups = useMemo<Group[]>(() => {
    const src = feeds.filter((f) => f.enabled && (!w.config.sourceId || f.id === w.config.sourceId));
    return src.map((f) => ({ source: f, items: mergedFeed([f], cache) }));
  }, [feeds, cache, w.config.sourceId]);

  const withItems = groups.filter((g) => g.items.length > 0);
  const hasItems = withItems.length > 0;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasItems]);
  if (groups.length === 0) return <Empty>在资讯页面里添加资讯源</Empty>;
  if (!hasItems) {
    return (
      <div className="news-l">
        <WHead icon="news" title="资讯" color="var(--c-news)" />
        <Empty>暂无资讯，稍后自动刷新</Empty>
      </div>
    );
  }

  // 各尺寸显示几个来源、每个来源几条
  const layout = { s: { cols: 1, items: 3 }, m: { cols: 1, items: 3 }, l: { cols: 1, items: 3 }, xl: { cols: 3, items: 4 } }[w.size];
  const SEC_H = 26 + layout.items * 25 + 6; // 来源标题 + 条目 + 间距
  const rows = Math.max(1, Math.floor((height + 6) / SEC_H));
  const shown = withItems.slice(0, rows * layout.cols);

  return (
    <div ref={box} className={`news-groups cols-${layout.cols}`}>
      {shown.map((g) => (
        <Section key={g.source.id} g={g} max={layout.items} color={sourceColor(feeds, g.source.id)} />
      ))}
    </div>
  );
}
