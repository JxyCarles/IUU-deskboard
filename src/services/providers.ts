import { call } from "../api";
import { getState, setCache } from "../store";
import type { ClaudeCodeRow, Metric, ProviderConf, UsageSnap } from "../types";
import { addDays, fmtTokens, today, ymd } from "../utils";

export const secretName = (p: ProviderConf) => `provider:${p.id}`;

/** 各平台是否需要 Key、Key 从哪里来（设置页里展示） */
export const PROVIDER_META: Record<ProviderConf["kind"], { needsKey: boolean; keyHint: string; desc: string }> = {
  deepseek: {
    needsKey: true,
    keyHint: "sk-...（platform.deepseek.com → API Keys）",
    desc: "官方余额接口，显示总余额 / 充值 / 赠送。",
  },
  glm: {
    needsKey: true,
    keyHint: "智谱开放平台 API Key（bigmodel.cn → API Keys）",
    desc: "按量付费账户显示可用余额、累计充值与消费；开通了 GLM Coding Plan 还会显示 5 小时 / 每周额度。",
  },
  claude: {
    needsKey: true,
    keyHint: "Admin Key：sk-ant-admin...（Console → Settings → Admin keys，仅组织账户可创建）",
    desc: "Anthropic 官方费用报表，显示本月 / 近 7 天 / 今日花费。普通 API Key 查不到用量，需要 Admin Key。",
  },
  claudecode: {
    needsKey: false,
    keyHint: "",
    desc: "读取本机 ~/.claude/projects 下的 Claude Code 日志，统计 token 用量并按 API 价格折算（估算）。",
  },
};

// ---------- Claude 价格估算（美元 / 百万 token） ----------

function modelPrice(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes("fable") || m.includes("mythos")) return { input: 10, output: 50 };
  if (m.includes("opus-5-5")) return { input: 4, output: 20 };
  if (m.includes("opus-4-1") || m.includes("opus-4-0") || /opus-4-\d{8}/.test(m) || m.includes("3-opus"))
    return { input: 15, output: 75 };
  if (m.includes("opus")) return { input: 5, output: 25 };
  if (m.includes("sonnet-5")) return { input: 2, output: 10 };
  if (m.includes("sonnet")) return { input: 3, output: 15 };
  if (m.includes("haiku-3")) return { input: 0.8, output: 4 };
  if (m.includes("haiku")) return { input: 1, output: 5 };
  return { input: 3, output: 15 };
}

export function rowCost(r: ClaudeCodeRow) {
  const p = modelPrice(r.model);
  const w5m = Math.max(0, r.cache_write - r.cache_write_1h);
  return (
    (r.input * p.input +
      r.output * p.output +
      r.cache_read * p.input * 0.1 +
      w5m * p.input * 1.25 +
      r.cache_write_1h * p.input * 2) /
    1e6
  );
}

export const rowTokens = (r: ClaudeCodeRow) => r.input + r.output + r.cache_read + r.cache_write;

const usd = (n: number) => "$" + (n >= 100 ? n.toFixed(0) : n.toFixed(2));

// ---------- 各平台解析 ----------

async function fetchDeepseek(p: ProviderConf): Promise<Omit<UsageSnap, "ts">> {
  const v = await call<any>("fetch_deepseek", { secret: secretName(p) });
  const infos: any[] = v?.balance_infos ?? [];
  const main = infos.find((i) => i.currency === "CNY") ?? infos[0];
  if (!main) return { ok: true, headline: "—", metrics: [] };
  const sym = main.currency === "USD" ? "$" : "¥";
  return {
    ok: true,
    headline: sym + Number(main.total_balance).toFixed(2),
    headlineSub: v.is_available ? "可用余额" : "余额不足",
    metrics: [
      { label: "充值余额", value: sym + Number(main.topped_up_balance).toFixed(2) },
      { label: "赠送余额", value: sym + Number(main.granted_balance).toFixed(2) },
    ],
  };
}

function glmWindowLabel(l: any) {
  if (l.type === "TIME_LIMIT") return "MCP 工具（月）";
  const unit = Number(l.unit);
  if (unit === 3) return `${l.number ?? 5} 小时窗口`;
  if (unit === 6) return "每周额度";
  if (unit === 5) return "每月额度";
  return "额度";
}

function fmtReset(ms?: number) {
  if (!ms) return undefined;
  const d = new Date(Number(ms));
  const sameDay = ymd(d) === today();
  const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return (sameDay ? "今天 " : `${d.getMonth() + 1}/${d.getDate()} `) + t + " 重置";
}

const yuan = (n: unknown) => "¥" + Number(n ?? 0).toFixed(2);

/**
 * 智谱同时查两个接口：
 * - 按量付费账户：/api/biz/account/query-customer-account-report（余额、充值、消费）
 * - GLM Coding Plan：/api/monitor/usage/quota/limit（没开通会返回“当前用户不存在coding plan”）
 * 有哪个显示哪个，两个都有就都显示；主数值优先用按量付费的可用余额。
 */
async function fetchGlm(p: ProviderConf): Promise<Omit<UsageSnap, "ts">> {
  const args = { secret: secretName(p), host: p.host ?? null };
  const [acc, plan] = await Promise.allSettled([call<any>("fetch_glm_account", args), call<any>("fetch_glm_quota", args)]);
  const ok = (r: PromiseSettledResult<any>) => r.status === "fulfilled" && r.value?.success !== false && (!r.value?.code || r.value.code === 200);

  const metrics: Metric[] = [];
  let headline: string | undefined;
  let headlineSub: string | undefined;
  let percent: number | undefined;

  if (ok(acc)) {
    const d = (acc as PromiseFulfilledResult<any>).value?.data ?? {};
    const avail = Number(d.availableBalance ?? d.balance ?? 0);
    headline = yuan(avail);
    headlineSub = avail <= 0 ? "余额不足" : "可用余额（按量付费）";
    if (d.todaySpendAmount != null) metrics.push({ label: "今日消费", value: yuan(d.todaySpendAmount) });
    metrics.push({ label: "累计消费", value: yuan(d.totalSpendAmount) });
    metrics.push({ label: "累计充值", value: yuan(d.rechargeAmount), sub: Number(d.giveAmount) > 0 ? `另有赠送 ${yuan(d.giveAmount)}` : undefined });
    if (Number(d.frozenBalance) > 0) metrics.push({ label: "冻结金额", value: yuan(d.frozenBalance) });
  }

  if (ok(plan)) {
    const v = (plan as PromiseFulfilledResult<any>).value;
    const limits: any[] = v?.data?.limits ?? [];
    for (const l of limits) {
      const pct = Number(l.percentage ?? 0);
      metrics.push({ label: "Coding Plan · " + glmWindowLabel(l), value: `${pct}%`, sub: fmtReset(l.nextResetTime), percent: pct });
    }
    const main = limits.find((l) => l.type !== "TIME_LIMIT" && Number(l.unit) === 3) ?? limits[0];
    if (main && headline === undefined) {
      percent = Number(main.percentage ?? 0);
      headline = `${percent}%`;
      headlineSub = `${glmWindowLabel(main)}已用` + (v?.data?.level ? ` · ${String(v.data.level).toUpperCase()}` : "");
    }
  }

  if (headline === undefined) {
    // 两个都失败：给出更有用的那条错误
    const reason = (r: PromiseSettledResult<any>) =>
      r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : r.value?.msg || "接口返回失败";
    throw new Error(reason(acc));
  }
  return { ok: true, headline, headlineSub, percent, metrics };
}

async function fetchClaude(p: ProviderConf): Promise<Omit<UsageSnap, "ts">> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const v = await call<any>("fetch_claude_cost", {
    secret: secretName(p),
    startingAt: monthStart.toISOString().replace(/\.\d+Z$/, "Z"),
    endingAt: addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1).toISOString().replace(/\.\d+Z$/, "Z"),
  });
  const buckets: any[] = v?.data ?? [];
  const dayCost = (b: any) =>
    (b.results ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0) / 100; // 美分 → 美元
  const byDay = buckets.map((b) => ({ date: ymd(new Date(b.starting_at)), cost: dayCost(b) }));
  const month = byDay.reduce((s, d) => s + d.cost, 0);
  const week7 = ymd(addDays(now, -6));
  const week = byDay.filter((d) => d.date >= week7).reduce((s, d) => s + d.cost, 0);
  const todayCost = byDay.filter((d) => d.date === today()).reduce((s, d) => s + d.cost, 0);
  const percent = p.budget ? Math.min(100, (month / p.budget) * 100) : undefined;
  return {
    ok: true,
    headline: usd(month),
    headlineSub: p.budget ? `本月花费 / 预算 ${usd(p.budget)}` : "本月花费",
    percent,
    metrics: [
      { label: "今日", value: usd(todayCost) },
      { label: "近 7 天", value: usd(week) },
    ],
  };
}

async function fetchClaudeCode(): Promise<Omit<UsageSnap, "ts">> {
  let rows: ClaudeCodeRow[];
  try {
    rows = await call<ClaudeCodeRow[]>("claude_code_usage", { days: 30 });
    setCache({ claudeCode: { ts: Date.now(), rows } });
  } catch (e) {
    setCache({ claudeCode: { ts: Date.now(), rows: [], error: String(e) } });
    throw e;
  }
  const t = today();
  const w7 = ymd(addDays(new Date(), -6));
  const sum = (f: (r: ClaudeCodeRow) => boolean) => {
    const rs = rows.filter(f);
    return { tokens: rs.reduce((s, r) => s + rowTokens(r), 0), cost: rs.reduce((s, r) => s + rowCost(r), 0) };
  };
  const d = sum((r) => r.date === t);
  const w = sum((r) => r.date >= w7);
  const m = sum(() => true);
  return {
    ok: true,
    headline: fmtTokens(d.tokens),
    headlineSub: `今日 token · 折合 ${usd(d.cost)}`,
    metrics: [
      { label: "近 7 天", value: fmtTokens(w.tokens), sub: `≈ ${usd(w.cost)}` },
      { label: "近 30 天", value: fmtTokens(m.tokens), sub: `≈ ${usd(m.cost)}` },
    ],
  };
}

const inflight = new Set<string>();

export async function refreshProvider(p: ProviderConf) {
  if (inflight.has(p.id)) return;
  inflight.add(p.id);
  let snap: UsageSnap;
  try {
    const r =
      p.kind === "deepseek"
        ? await fetchDeepseek(p)
        : p.kind === "glm"
          ? await fetchGlm(p)
          : p.kind === "claude"
            ? await fetchClaude(p)
            : await fetchClaudeCode();
    snap = { ...r, ts: Date.now() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 请求失败时保留上一次的数值，只标记错误
    const prev = getState().cache.usage[p.id];
    snap = { ...(prev ?? { headline: "—", metrics: [] }), ts: Date.now(), ok: false, error: msg };
  } finally {
    inflight.delete(p.id);
  }
  setCache({ usage: { ...getState().cache.usage, [p.id]: snap } });
}

export function refreshAllProviders() {
  return Promise.all(getState().providers.filter((p) => p.enabled).map(refreshProvider));
}

export const isRefreshing = (id: string) => inflight.has(id);
