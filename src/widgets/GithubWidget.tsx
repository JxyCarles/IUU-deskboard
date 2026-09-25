import { useEffect, useState } from "react";
import { isTauri, openUrl } from "../api";
import { fmtStars, keyOf, queryOf, refreshTrending, SINCE_LABEL } from "../services/github";
import { useStore } from "../store";
import type { GithubRepo } from "../types";
import { relTime } from "../utils";
import { Empty, stop, WHead, type WidgetProps } from "./common";

export function LangDot({ r }: { r: GithubRepo }) {
  if (!r.language) return null;
  return (
    <span className="gh-lang">
      <i style={{ background: r.color ?? "var(--text-3)" }} />
      {r.language}
    </span>
  );
}

function Row({ r, rank, compact }: { r: GithubRepo; rank: number; compact?: boolean }) {
  const [owner, name] = r.name.split("/");
  return (
    <div
      className="gh-row"
      onClick={(e) => {
        stop(e);
        openUrl(r.url);
      }}
    >
      <span className="gh-rank">{rank}</span>
      <div className="gh-body">
        <div className="gh-name">
          <span className="muted">{owner}/</span>
          {name}
        </div>
        {!compact && r.description && <div className="gh-desc">{r.description}</div>}
      </div>
      <div className="gh-stat">
        {r.period_stars !== undefined && r.period_stars !== null ? <b>+{fmtStars(r.period_stars)}</b> : <b>★{fmtStars(r.stars)}</b>}
      </div>
    </div>
  );
}

export default function GithubWidget({ w }: WidgetProps) {
  const q = queryOf(w.config);
  const key = keyOf(q);
  const data = useStore((s) => s.cache.github?.[key]);
  const [spin, setSpin] = useState(false);

  // 新加的小组件或改了筛选条件，立刻拉一次
  useEffect(() => {
    if (isTauri && !data) refreshTrending(q);
  }, [key]);

  const items = data?.items ?? [];
  const title = `GitHub ${SINCE_LABEL[q.since]}热门${q.language ? " · " + q.language : ""}`;
  const refresh = async (e: React.MouseEvent) => {
    stop(e);
    setSpin(true);
    await refreshTrending(q);
    setSpin(false);
  };
  const right = (
    <>
      {data && <span className="muted small">{relTime(data.ts)}</span>}
      <button className={"icon-btn sm" + (spin ? " spin" : "")} onClick={refresh} title="刷新">
        ↻
      </button>
    </>
  );

  if (w.size === "s") {
    const r = items[0];
    return (
      <div className="gh-s">
        <WHead icon="github" title="GitHub" color="var(--c-github)" />
        {r ? (
          <div
            className="gh-s-main"
            onClick={(e) => {
              stop(e);
              openUrl(r.url);
            }}
          >
            <div className="gh-s-name">{r.name.split("/")[1]}</div>
            <div className="gh-desc clamp-2">{r.description}</div>
            <div className="gh-s-foot">
              <LangDot r={r} />
              <b>{r.period_stars != null ? `+${fmtStars(r.period_stars)}` : `★${fmtStars(r.stars)}`}</b>
            </div>
          </div>
        ) : (
          <Empty>{data?.error ?? (isTauri ? "加载中…" : "需要桌面客户端")}</Empty>
        )}
      </div>
    );
  }

  const max = w.size === "m" ? 3 : w.size === "l" ? 6 : 12;
  return (
    <div className="gh-l">
      <WHead icon="github" title={title} color="var(--c-github)" right={right} />
      {data?.error && items.length === 0 && <div className="err tiny">{data.error}</div>}
      {items.length === 0 && !data?.error && <Empty>{isTauri ? "加载中…" : "需要桌面客户端"}</Empty>}
      <div className={"gh-list" + (w.size === "xl" ? " two-col" : "")}>
        {items.slice(0, max).map((r, i) => (
          <Row key={r.name} r={r} rank={i + 1} compact={w.size === "m"} />
        ))}
      </div>
    </div>
  );
}
