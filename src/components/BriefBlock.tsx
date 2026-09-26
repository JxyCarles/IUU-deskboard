import { isTauri, openUrl } from "../api";
import { closeBrief, openBrief, useBriefBusy, useOpenBrief } from "../services/brief";
import { useStore } from "../store";
import type { BriefPoint } from "../types";
import { relTime } from "../utils";
import { stop, useNav } from "../widgets/common";
import Sheet from "./Sheet";

const TAG_CLASS: Record<string, string> = { 关注: "b-focus", 热点: "b-hot", 好玩: "b-fun", 工具: "b-tool" };

function Point({ p, compact }: { p: BriefPoint; compact?: boolean }) {
  return (
    <div
      className={"brief-point" + (p.link ? " link" : "") + (compact ? " compact" : "")}
      onClick={(e) => {
        if (!p.link) return;
        stop(e);
        openUrl(p.link);
      }}
      title={p.text}
    >
      {p.tag && <span className={"brief-tag " + (TAG_CLASS[p.tag] ?? "")}>{p.tag}</span>}
      <span className="brief-text">{p.text}</span>
    </div>
  );
}

/** 小组件顶部的简报：一句话总览 + 前几条要点，点“全部”看完整版 */
export default function BriefBlock({ briefKey, title, max, regen }: { briefKey: string; title: string; max: number; regen: () => void }) {
  const brief = useStore((s) => s.cache.briefs?.[briefKey]);
  const busy = useBriefBusy(briefKey);
  const hasContent = !!brief && (brief.headline || brief.points.length > 0);

  return (
    <div className="brief" onClick={stop}>
      <div className="brief-h">
        <span className="brief-badge">✨ AI 简报</span>
        {brief?.ts ? <span className="muted tiny">{relTime(brief.ts)}</span> : null}
        <span className="grow" />
        {hasContent && (
          <button className="link-btn tiny" onClick={() => openBrief({ key: briefKey, title, regen })}>
            全部 ›
          </button>
        )}
        <button className={"icon-btn sm" + (busy ? " spin" : "")} title="重新生成" disabled={busy || !isTauri} onClick={regen}>
          ↻
        </button>
      </div>
      {busy && !hasContent && <div className="muted small">正在整理…</div>}
      {!busy && !hasContent && !brief?.error && <div className="muted small">{isTauri ? "点 ↻ 生成简报" : "需要桌面客户端"}</div>}
      {brief?.error && !hasContent && <div className="err tiny">{brief.error}</div>}
      {hasContent && (
        <>
          {brief!.headline && <div className="brief-headline">{brief!.headline}</div>}
          {brief!.points.slice(0, max).map((p, i) => (
            <Point key={i} p={p} compact />
          ))}
        </>
      )}
    </div>
  );
}

/** 完整简报（全局只挂一个） */
export function BriefSheet() {
  const o = useOpenBrief();
  const brief = useStore((s) => (o ? s.cache.briefs?.[o.key] : undefined));
  const busy = useBriefBusy(o?.key ?? "");
  const interests = useStore((s) => s.settings.brief.interests);
  const nav = useNav();
  if (!o) return null;
  return (
    <Sheet
      size="md"
      title={`✨ ${o.title}`}
      onClose={closeBrief}
      actions={
        <button className="btn sm" disabled={busy} onClick={o.regen}>
          {busy ? "生成中…" : "重新生成"}
        </button>
      }
    >
      <div className="brief-full">
        {brief?.headline && <h2>{brief.headline}</h2>}
        <div className="muted small">
          {brief?.ts ? `生成于 ${new Date(brief.ts).toLocaleString()}` : ""}
          {" · "}
          {interests ? `关注方向：${interests}` : "还没有填写关注方向"}{" "}
          <button
            className="link-btn"
            onClick={() => {
              closeBrief();
              nav.open("settings");
            }}
          >
            修改
          </button>
        </div>
        {brief?.error && <div className="err">{brief.error}</div>}
        <div className="brief-full-list">
          {brief?.points.map((p, i) => (
            <Point key={i} p={p} />
          ))}
        </div>
        <p className="muted tiny">点击要点打开对应的原文或仓库。简报由 AI 根据当前列表整理，可能有遗漏。</p>
      </div>
    </Sheet>
  );
}
