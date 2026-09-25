import { useMemo, useState } from "react";
import { refreshAllProviders, rowCost, rowTokens } from "../services/providers";
import { useStore } from "../store";
import type { ClaudeCodeRow, ProviderConf, UsageSnap } from "../types";
import { addDays, fmtTokens, relTime, ymd } from "../utils";
import { Empty, levelColor, Ring, stop, WHead, type WidgetProps } from "./common";

export const PROVIDER_ICON: Record<ProviderConf["kind"], { icon: string; color: string }> = {
  deepseek: { icon: "D", color: "var(--c-tasks)" },
  glm: { icon: "G", color: "var(--c-project)" },
  claude: { icon: "C", color: "var(--c-agenda)" },
  claudecode: { icon: ">_", color: "var(--c-news)" },
};

function ProviderRow({ p, snap }: { p: ProviderConf; snap?: UsageSnap }) {
  const ic = PROVIDER_ICON[p.kind];
  return (
    <div className="ai-row">
      <span className="ai-ic" style={{ background: ic.color }}>
        {ic.icon}
      </span>
      <div className="ai-row-body">
        <div className="ai-row-name">
          {p.name}
          {snap && !snap.ok && (
            <span className="err-dot" title={snap.error}>
              !
            </span>
          )}
        </div>
        <div className="muted small ellipsis">{snap ? (snap.ok ? snap.headlineSub : snap.error) : "未获取"}</div>
      </div>
      <div className="ai-row-val" style={{ color: snap?.percent !== undefined ? levelColor(snap.percent) : undefined }}>
        {snap?.headline ?? "—"}
      </div>
    </div>
  );
}

/** 最近 14 天 Claude Code token 柱状图 */
export function CCBars({ rows, days = 14, height = 64 }: { rows: ClaudeCodeRow[]; days?: number; height?: number }) {
  const data = useMemo(() => {
    const list = Array.from({ length: days }, (_, i) => ymd(addDays(new Date(), i - days + 1)));
    return list.map((d) => {
      const rs = rows.filter((r) => r.date === d);
      return { d, tokens: rs.reduce((s, r) => s + rowTokens(r), 0), cost: rs.reduce((s, r) => s + rowCost(r), 0) };
    });
  }, [rows, days]);
  const max = Math.max(1, ...data.map((x) => x.tokens));
  return (
    <div className="cc-bars" style={{ height }}>
      {data.map((x) => (
        <div key={x.d} className="cc-bar-wrap" title={`${x.d}\n${fmtTokens(x.tokens)} tokens\n≈ $${x.cost.toFixed(2)}`}>
          <div className="cc-bar" style={{ height: `${(x.tokens / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function AIWidget({ w }: WidgetProps) {
  const providers = useStore((s) => s.providers);
  const usage = useStore((s) => s.cache.usage);
  const cc = useStore((s) => s.cache.claudeCode);
  const [spin, setSpin] = useState(false);
  const enabled = providers.filter((p) => p.enabled);

  const refresh = async (e: React.MouseEvent) => {
    stop(e);
    setSpin(true);
    await refreshAllProviders();
    setSpin(false);
  };
  const lastTs = Math.max(0, ...enabled.map((p) => usage[p.id]?.ts ?? 0));
  const refreshBtn = (
    <button className={"icon-btn sm" + (spin ? " spin" : "")} onClick={refresh} title="刷新">
      ↻
    </button>
  );

  if (w.size === "s") {
    const p = providers.find((x) => x.id === w.config.providerId) ?? enabled[0];
    if (!p) return <Empty>没有启用的平台</Empty>;
    const snap = usage[p.id];
    const ic = PROVIDER_ICON[p.kind];
    return (
      <div className="ai-s">
        <WHead icon={ic.icon} title={p.name} color={ic.color} right={refreshBtn} />
        {snap?.percent !== undefined ? (
          <div className="ai-s-ring">
            <Ring percent={snap.percent} size={64} color={levelColor(snap.percent)}>
              <b>{snap.headline}</b>
            </Ring>
          </div>
        ) : (
          <div className="ai-s-big">{snap?.headline ?? "—"}</div>
        )}
        <div className="muted small ellipsis">{snap ? (snap.ok ? snap.headlineSub : "⚠ " + snap.error) : "等待刷新"}</div>
        {snap?.metrics[0] && (
          <div className="small ellipsis">
            {snap.metrics[0].label} <b>{snap.metrics[0].value}</b>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ai-l">
      <WHead icon="ai" title="AI 额度" color="var(--c-ai)" right={<>{lastTs > 0 && <span className="muted small">{relTime(lastTs)}</span>} {refreshBtn}</>} />
      <div className={"ai-list" + (w.size === "xl" ? " two-col" : "") + (w.size === "m" ? " compact" : "")}>
        {enabled.length === 0 && <Empty>在设置里启用平台</Empty>}
        {enabled.map((p) => (
          <ProviderRow key={p.id} p={p} snap={usage[p.id]} />
        ))}
      </div>
      {(w.size === "l" || w.size === "xl") && cc && cc.rows.length > 0 && (
        <div className="ai-cc">
          <div className="muted small">Claude Code 近 14 天 token</div>
          <CCBars rows={cc.rows} />
        </div>
      )}
    </div>
  );
}
