import { useMemo, useState } from "react";
import { openUrl } from "../api";
import { mergedFeed, refreshAllFeeds, refreshFeed } from "../services/feeds";
import { patch, remove, upsert, useStore } from "../store";
import { relTime, uid } from "../utils";

export default function NewsPage() {
  const feeds = useStore((s) => s.feeds);
  const cache = useStore((s) => s.cache.feeds);
  const [src, setSrc] = useState<string>("");
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState({ name: "", url: "" });

  const items = useMemo(() => mergedFeed(src ? feeds.filter((f) => f.id === src) : feeds, cache), [feeds, cache, src]);

  const refresh = async () => {
    setBusy(true);
    await refreshAllFeeds();
    setBusy(false);
  };

  const addFeed = () => {
    if (!nf.url.trim()) return;
    const f = { id: uid(), name: nf.name.trim() || new URL(nf.url).hostname, url: nf.url.trim(), enabled: true };
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
        <div className="side-list">
          <div className={"side-item" + (src === "" ? " on" : "")} onClick={() => setSrc("")}>
            全部
          </div>
          {feeds.map((f) => (
            <div key={f.id} className={"side-item" + (src === f.id ? " on" : "")} onClick={() => setSrc(f.id)}>
              <div className="row between">
                <span className={f.enabled ? "" : "muted"}>{f.name}</span>
                {manage ? (
                  <span className="row">
                    <input type="checkbox" checked={f.enabled} onClick={(e) => e.stopPropagation()} onChange={() => patch("feeds", f.id, { enabled: !f.enabled })} />
                    <button
                      className="icon-btn sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove("feeds", f.id);
                      }}
                    >
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
          <h3>{src ? feeds.find((f) => f.id === src)?.name : "全部资讯"}</h3>
          <button className="btn" onClick={refresh} disabled={busy}>
            {busy ? "刷新中…" : "刷新"}
          </button>
        </div>
        <div className="news-page-list">
          {items.length === 0 && <div className="placeholder">暂无内容，点「刷新」获取</div>}
          {items.map((it, i) => (
            <div key={it.link + i} className="news-page-item" onClick={() => openUrl(it.link)}>
              <div className="news-title">{it.title}</div>
              {it.summary && <div className="muted small clamp-2">{it.summary}</div>}
              <div className="news-meta">
                {it.source}
                {it.time ? ` · ${relTime(it.time)}` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
