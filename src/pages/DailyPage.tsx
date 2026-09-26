import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import { isTauri, openUrl } from "../api";
import { bodyOf, DAILY_SITE, groupBySection, issueLabel, refreshDaily } from "../services/daily";
import { useStore } from "../store";
import type { DailyIssue, DailyItem } from "../types";
import { relTime } from "../utils";

const clean = (html: string) => DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "script", "iframe", "form"], FORBID_ATTR: ["style", "onclick"] });

/** 正文里的链接用系统浏览器打开 */
const openLinks = (e: React.MouseEvent) => {
  const a = (e.target as HTMLElement).closest("a");
  if (a?.href) {
    e.preventDefault();
    openUrl(a.href);
  }
};

function Item({ date, it, open, onToggle }: { date: string; it: DailyItem; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const body = open ? bodyOf(date, it.n) : undefined;
  return (
    <div ref={ref} className={"daily-card" + (open ? " open" : "")}>
      <div className="daily-card-h" onClick={onToggle}>
        <span className="daily-n">{it.n}</span>
        <div className="daily-row-body">
          <div className="daily-card-title">{it.title}</div>
          {it.summary && <div className="daily-sum">{it.summary}</div>}
        </div>
        <span className="daily-caret">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="daily-card-body">
          {body ? (
            <div className="md reader-body" dangerouslySetInnerHTML={{ __html: clean(body) }} onClick={openLinks} />
          ) : (
            <div className="muted small">正文还没加载，点右上角「刷新」获取</div>
          )}
          {it.link && (
            <button className="btn sm" onClick={() => openUrl(it.link!)}>
              打开来源
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Issue({ issue, focus }: { issue: DailyIssue; focus?: number }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(focus ? [focus] : []));
  const toggle = (n: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const allOpen = open.size === issue.items.length;
  return (
    <>
      <div className="row between daily-head">
        <h3>{issueLabel(issue.date)}</h3>
        <div className="row daily-actions">
          {issue.videos?.map((v) => (
            <button key={v.url} className="btn sm" onClick={() => openUrl(v.url)} title="视频版">
              ▶ {v.name}
            </button>
          ))}
          <button className="btn sm" onClick={() => setOpen(allOpen ? new Set() : new Set(issue.items.map((x) => x.n)))}>
            {allOpen ? "全部收起" : "全部展开"}
          </button>
          <button className="btn sm" onClick={() => openUrl(issue.link)}>
            网页全文
          </button>
        </div>
      </div>
      {groupBySection(issue.items).map((g) => (
        <section key={g.name} className="daily-group">
          <h4>
            {g.name} <span className="muted">{g.items.length}</span>
          </h4>
          {g.items.map((it) => (
            <Item key={it.n} date={issue.date} it={it} open={open.has(it.n)} onToggle={() => toggle(it.n)} />
          ))}
        </section>
      ))}
      <div className="muted tiny daily-foot">
        内容来自
        <a href={DAILY_SITE} onClick={openLinks}>
          橘鸦 AI 早报
        </a>
        ，由 AI 辅助创作，可能存在错误。
      </div>
    </>
  );
}

/** arg：`2026-09-26` 或 `2026-09-26#3`（从小组件点进来时定位到那一条） */
export default function DailyPage({ arg }: { arg?: string }) {
  const data = useStore((s) => s.cache.daily);
  const [argDate, argN] = (arg ?? "").split("#");
  const [date, setDate] = useState(argDate || data?.issues[0]?.date || "");
  const [busy, setBusy] = useState(false);
  const issues = data?.issues ?? [];
  const issue = issues.find((x) => x.date === date) ?? issues[0];

  const refresh = async () => {
    setBusy(true);
    await refreshDaily();
    setBusy(false);
  };

  // 正文只在内存里，重启后第一次打开时补抓一次
  useEffect(() => {
    if (isTauri && (!issue || (issue.items[0] && !bodyOf(issue.date, issue.items[0].n)))) refresh();
  }, []);

  return (
    <div className="split">
      <aside className="split-side">
        <div className="side-tools">
          <b className="grow">往期</b>
          <button className="btn" onClick={refresh} disabled={busy}>
            {busy ? "刷新中…" : "刷新"}
          </button>
        </div>
        <div className="side-list">
          {issues.map((x) => (
            <div key={x.date} className={"side-item" + (x.date === issue?.date ? " on" : "")} onClick={() => setDate(x.date)}>
              <div className="row between">
                <span className="side-item-title">{issueLabel(x.date)}</span>
                <span className="muted small">{x.items.length} 条</span>
              </div>
              {x.items[0] && <div className="side-item-sub">{x.items[0].title}</div>}
            </div>
          ))}
        </div>
        {data && (
          <div className="muted tiny">
            {data.error ? <span className="err">{data.error}</span> : `${relTime(data.ts)}更新`}
          </div>
        )}
      </aside>
      <section className="split-main">
        {issue ? (
          <Issue key={issue.date} issue={issue} focus={issue.date === argDate && argN ? Number(argN) : undefined} />
        ) : (
          <div className="placeholder">{data?.error ?? (isTauri ? "加载中…" : "需要桌面客户端")}</div>
        )}
      </section>
    </div>
  );
}
