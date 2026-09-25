import { useMemo, useState } from "react";
import { mergedFeed, moveFeed, openReader, refreshAllFeeds, refreshFeed, sourceColor } from "../services/feeds";
import { patch, remove, upsert, useStore } from "../store";
import { relTime, uid } from "../utils";

export default function NewsPage({ arg }: { arg?: string }) {
  const feeds = useStore((s) => s.feeds);
  const cache = useStore((s) => s.cache.feeds);
  const [src, setSrc] = useState<string>(arg ?? "");
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState({ name: "", url: "" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const items = useMemo(() => mergedFeed(src ? feeds.filter((f) => f.id === src) : feeds, cache), [feeds, cache, src]);
  const current = feeds.find((f) => f.id === src);

  const refresh = async () => {
    setBusy(true);
    if (current) await refreshFeed(current);
    else await refreshAllFeeds();
    setBusy(false);
  };

  const addFeed = () => {
    const url = nf.url.trim();
    if (!url) return;
    let name = nf.name.trim();
    if (!name) {
      try {
        name = new URL(url).hostname;
      } catch {
        name = url;
      }
    }
    const f = { id: uid(), name, url, enabled: true };
    upsert("feeds", f);
    refreshFeed(f);
    setNf({ name: "", url: "" });
  };

  return (
    <div className="split">
      <aside className="split-side">
        <div className="side-tools">
          <b className="grow">资讯源</b>
          <button className="btn" onClick={() => setManage(!manage)}>
            {manage ? "完成" : "管理"}
          </button>
        </div>
        {manage && <div className="muted tiny">拖动或用 ↑↓ 调整顺序，小组件按这个顺序显示</div>}
        <div className="side-list">
          {!manage && (
            <div className={"side-item" + (src === "" ? " on" : "")} onClick={() => setSrc("")}>
              全部
            </div>
          )}
          {feeds.map((f, i) => (
            <div
              key={f.id}
              className={"side-item" + (src === f.id && !manage ? " on" : "") + (dragId === f.id ? " dragging-src" : "") + (overIdx === i && dragId && dragId !== f.id ? " drop-before" : "")}
              onClick={() => !manage && setSrc(f.id)}
              draggable={manage}
              onDragStart={(e) => {
                setDragId(f.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverIdx(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) {
                  const from = feeds.findIndex((x) => x.id === dragId);
                  moveFeed(dragId, from < i ? i - 1 : i);
                }
                setDragId(null);
                setOverIdx(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverIdx(null);
              }}
            >
              <div className="row between">
                <span className="row src-name">
                  {manage && <span className="drag-grip">⠿</span>}
                  <i className="src-dot" style={{ background: sourceColor(feeds, f.id) }} />
                  <span className={f.enabled ? "" : "muted"}>{f.name}</span>
                </span>
                {manage ? (
                  <span className="row src-tools" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn sm" disabled={i === 0} title="上移" onClick={() => moveFeed(f.id, i - 1)}>
                      ↑
                    </button>
                    <button className="icon-btn sm" disabled={i === feeds.length - 1} title="下移" onClick={() => moveFeed(f.id, i + 1)}>
                      ↓
                    </button>
                    <input type="checkbox" title="启用" checked={f.enabled} onChange={() => patch("feeds", f.id, { enabled: !f.enabled })} />
                    <button className="icon-btn sm" title="删除" onClick={() => remove("feeds", f.id)}>
                      ✕
                    </button>
                  </span>
                ) : (
                  <span className="muted small">{cache[f.id]?.error ? "⚠" : cache[f.id]?.items.length ?? 0}</span>
                )}
              </div>
              {manage && <div className="muted tiny ellipsis">{f.url}</div>}
              {cache[f.id]?.error && <div className="err tiny">{cache[f.id].error}</div>}
            </div>
          ))}
          {manage && (
            <div className="form pad">
              <input className="input" placeholder="名称（可选）" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
              <input className="input" placeholder="RSS / Atom 地址" value={nf.url} onChange={(e) => setNf({ ...nf, url: e.target.value })} />
              <button className="btn primary" onClick={addFeed}>
                添加资讯源
              </button>
            </div>
          )}
        </div>
      </aside>
      <section className="split-main">
        <div className="row between">
          <h3 style={current ? { color: sourceColor(feeds, current.id) } : undefined}>{current ? current.name : "全部资讯"}</h3>
          <button className="btn" onClick={refresh} disabled={busy}>
            {busy ? "刷新中…" : "刷新"}
          </button>
        </div>
        <div className="news-page-list">
          {items.length === 0 && <div className="placeholder">暂无内容，点「刷新」获取</div>}
          {items.map((it, i) => (
            <div key={it.link + i} className="news-page-item" onClick={() => openReader(it)}>
              <div className="news-title">{it.title}</div>
              {it.summary && <div className="muted small clamp-2">{it.summary}</div>}
              <div className="news-meta">
                {!current && (
                  <span className="src-tag" style={{ color: sourceColor(feeds, it.sourceId) }}>
                    {it.source}
                  </span>
                )}
                {it.time ? ` ${relTime(it.time)}` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
