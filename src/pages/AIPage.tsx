import { useEffect, useMemo, useState } from "react";
import { call, isTauri } from "../api";
import { PROVIDER_META, refreshProvider, rowCost, rowTokens, secretName } from "../services/providers";
import { patch, useStore } from "../store";
import type { ClaudeCodeRow, ProviderConf } from "../types";
import { fmtTokens, relTime } from "../utils";
import { CCBars, PROVIDER_ICON } from "../widgets/AIWidget";
import { Bar, levelColor } from "../widgets/common";

function KeyInput({ p, onSaved }: { p: ProviderConf; onSaved: () => void }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (isTauri) call<boolean>("has_secret", { name: secretName(p) }).then(setHas);
  }, [p]);
  const save = async (value: string) => {
    try {
      await call("set_secret", { name: secretName(p), value });
      setHas(!!value.trim());
      setVal("");
      setMsg(value.trim() ? "已保存到 Windows 凭据管理器" : "已删除");
      if (value.trim()) onSaved();
    } catch (e) {
      setMsg("保存失败：" + String(e));
    }
  };
  return (
    <div className="field">
      <span>
        API Key {has === true && <b className="ok">● 已配置</b>} {has === false && <b className="warn">● 未配置</b>}
      </span>
      <div className="row">
        <input
          type="password"
          className="input grow"
          placeholder={has ? "已保存（输入新值可替换）" : PROVIDER_META[p.kind].keyHint}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && val && save(val)}
        />
        <button className="btn primary" disabled={!val} onClick={() => save(val)}>
          保存
        </button>
        {has && (
          <button className="btn" onClick={() => save("")}>
            清除
          </button>
        )}
      </div>
      {msg && <small className="muted">{msg}</small>}
    </div>
  );
}

function ProviderCard({ p }: { p: ProviderConf }) {
  const snap = useStore((s) => s.cache.usage[p.id]);
  const [busy, setBusy] = useState(false);
  const meta = PROVIDER_META[p.kind];
  const ic = PROVIDER_ICON[p.kind];
  const refresh = async () => {
    setBusy(true);
    await refreshProvider(p);
    setBusy(false);
  };
  return (
    <div className={"card pv" + (p.enabled ? "" : " disabled")}>
      <div className="pv-head">
        <span className="ai-ic big" style={{ background: ic.color }}>
          {ic.icon}
        </span>
        <div className="grow">
          <b>{p.name}</b>
          <div className="muted small">{meta.desc}</div>
        </div>
        <label className="switch" title="启用">
          <input type="checkbox" checked={p.enabled} onChange={() => patch("providers", p.id, { enabled: !p.enabled })} />
          <span />
        </label>
      </div>

      <div className="pv-now">
        <div>
          <div className="pv-headline" style={{ color: snap?.percent !== undefined ? levelColor(snap.percent) : undefined }}>
            {snap?.headline ?? "—"}
          </div>
          <div className="muted small">{snap?.headlineSub ?? "尚未获取"}</div>
        </div>
        <div className="pv-metrics">
          {snap?.metrics.map((m) => (
            <div key={m.label} className="pv-metric">
              <div className="row between small">
                <span className="muted">{m.label}</span>
                <b>{m.value}</b>
              </div>
              {m.percent !== undefined && <Bar percent={m.percent} color={levelColor(m.percent)} />}
              {m.sub && <div className="muted tiny">{m.sub}</div>}
            </div>
          ))}
        </div>
      </div>
      {snap && !snap.ok && <div className="err">⚠ {snap.error}</div>}
      <div className="row between">
        <span className="muted small">{snap ? `更新于 ${relTime(snap.ts)}` : ""}</span>
        <button className="btn" onClick={refresh} disabled={busy || !isTauri}>
          {busy ? "刷新中…" : "立即刷新"}
        </button>
      </div>

      {meta.needsKey && (
        <details className="pv-config" open={!snap}>
          <summary>配置</summary>
          <KeyInput p={p} onSaved={refresh} />
          {p.kind === "glm" && (
            <label className="field">
              <span>接口地址</span>
              <select className="input" value={p.host ?? "https://open.bigmodel.cn"} onChange={(e) => patch("providers", p.id, { host: e.target.value })}>
                <option value="https://open.bigmodel.cn">国内版 open.bigmodel.cn</option>
                <option value="https://api.z.ai">国际版 api.z.ai</option>
              </select>
            </label>
          )}
          {p.kind === "claude" && (
            <label className="field">
              <span>月预算（美元，可选）</span>
              <input
                type="number"
                className="input"
                placeholder="例如 100"
                value={p.budget ?? ""}
                onChange={(e) => patch("providers", p.id, { budget: e.target.value ? Number(e.target.value) : undefined })}
              />
            </label>
          )}
        </details>
      )}
    </div>
  );
}

function groupBy(rows: ClaudeCodeRow[], key: "model" | "project") {
  const m = new Map<string, { tokens: number; cost: number; req: number }>();
  for (const r of rows) {
    const g = m.get(r[key]) ?? { tokens: 0, cost: 0, req: 0 };
    g.tokens += rowTokens(r);
    g.cost += rowCost(r);
    g.req += r.requests;
    m.set(r[key], g);
  }
  return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
}

function ClaudeCodeStats() {
  const cc = useStore((s) => s.cache.claudeCode);
  const rows = cc?.rows ?? [];
  const byModel = useMemo(() => groupBy(rows, "model"), [rows]);
  const byProject = useMemo(() => groupBy(rows, "project"), [rows]);
  if (!cc) return null;
  if (cc.error) return <div className="err">Claude Code：{cc.error}</div>;
  const Table = ({ title, data }: { title: string; data: typeof byModel }) => (
    <div className="grow">
      <h4>{title}</h4>
      <table className="tbl">
        <thead>
          <tr>
            <th></th>
            <th>Token</th>
            <th>请求</th>
            <th>折合</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map(([k, v]) => (
            <tr key={k}>
              <td className="ellipsis">{k}</td>
              <td>{fmtTokens(v.tokens)}</td>
              <td>{v.req}</td>
              <td>${v.cost.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="card">
      <div className="card-head">
        <h4>Claude Code 近 30 天</h4>
        <span className="muted small">按 API 标价折算，订阅用户仅供参考 · {relTime(cc.ts)}</span>
      </div>
      <CCBars rows={rows} days={30} height={110} />
      <div className="row top gap">
        <Table title="按模型" data={byModel} />
        <Table title="按项目目录" data={byProject} />
      </div>
    </div>
  );
}

export default function AIPage() {
  const providers = useStore((s) => s.providers);
  return (
    <div className="ai-page">
      {!isTauri && <div className="err">当前是浏览器预览模式，额度查询需要在桌面客户端里运行。</div>}
      <div className="pv-grid">
        {providers.map((p) => (
          <ProviderCard key={p.id} p={p} />
        ))}
      </div>
      <ClaudeCodeStats />
    </div>
  );
}
