import { useEffect, useState } from "react";
import { isTauri } from "../api";
import { groupBySection, issueLabel, refreshDaily } from "../services/daily";
import { useStore } from "../store";
import type { DailyItem } from "../types";
import { Empty, stop, useNav, WHead, type WidgetProps } from "./common";

function Row({ date, it, summary }: { date: string; it: DailyItem; summary?: boolean }) {
  const nav = useNav();
  return (
    <div
      className="daily-row"
      onClick={(e) => {
        stop(e);
        nav.open("daily", `${date}#${it.n}`);
      }}
      title={it.summary ?? it.title}
    >
      <span className="daily-n">{it.n}</span>
      <div className="daily-row-body">
        <div className="daily-title">{it.title}</div>
        {summary && it.summary && <div className="daily-sum clamp-2">{it.summary}</div>}
      </div>
    </div>
  );
}

export default function DailyWidget({ w }: WidgetProps) {
  const data = useStore((s) => s.cache.daily);
  const [spin, setSpin] = useState(false);

  // 新加的小组件立刻拉一次，之后跟资讯一起定时刷新
  useEffect(() => {
    if (isTauri && !data) refreshDaily();
  }, []);

  const issue = data?.issues[0];
  const refresh = async (e: React.MouseEvent) => {
    stop(e);
    setSpin(true);
    await refreshDaily();
    setSpin(false);
  };
  const right = (
    <>
      {issue && <span className="muted small">{issueLabel(issue.date).split(" ")[0]}</span>}
      {w.size !== "s" && (
        <button className={"icon-btn sm" + (spin ? " spin" : "")} onClick={refresh} title="刷新">
          ↻
        </button>
      )}
    </>
  );

  if (!issue) {
    return (
      <div className="daily-w">
        <WHead icon="daily" title="AI 早报" color="var(--c-daily)" />
        <Empty>{data?.error ?? (isTauri ? "加载中…" : "需要桌面客户端")}</Empty>
      </div>
    );
  }

  // 小尺寸：只列前几条要闻
  if (w.size === "s") {
    return (
      <div className="daily-w">
        <WHead icon="daily" title="AI 早报" color="var(--c-daily)" right={right} />
        <div className="w-scroll">
          {issue.items.map((it) => (
            <Row key={it.n} date={issue.date} it={it} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="daily-w">
      <WHead icon="daily" title={`AI 早报 · ${issue.items.length} 条`} color="var(--c-daily)" right={right} />
      <div className={"w-scroll daily-scroll" + (w.size === "xl" ? " cols-2" : "")}>
        {groupBySection(issue.items).map((g) => (
          <div key={g.name} className="daily-sec">
            <div className="daily-sec-h">
              {g.name}
              <span className="muted">{g.items.length}</span>
            </div>
            {g.items.map((it) => (
              <Row key={it.n} date={issue.date} it={it} summary={w.size !== "m" && g.name === "要闻"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
