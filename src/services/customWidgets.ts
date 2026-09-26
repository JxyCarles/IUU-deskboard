//! 自定义小组件运行时（deskboard.widget/v1，规范见 docs/扩展规范.md 第二章）：
//! 按 source 取数据 → 用 map 里的路径和模板映射成统一的条目 → 缓存 → 由 CustomWidget 渲染。

import { call, isTauri } from "../api";
import { getState, setCache, setState } from "../store";
import type { CustomItem, FeedItem, WidgetSpec } from "../types";
import { relTime } from "../utils";

// ---------- 路径与模板 ----------

/** "a.b[0].c"；"" 或 "." 表示自身 */
export function getPath(obj: unknown, path: string): unknown {
  const p = path.trim();
  if (!p || p === ".") return obj;
  let cur: any = obj;
  for (const tok of p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (cur == null) return undefined;
    cur = cur[tok];
  }
  return cur;
}

function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v); // 秒或毫秒
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const FILTERS: Record<string, (v: unknown) => string> = {
  num: (v) => {
    const n = Number(v);
    if (!isFinite(n)) return String(v ?? "");
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  },
  fixed2: (v) => (isFinite(Number(v)) ? Number(v).toFixed(2) : String(v ?? "")),
  ago: (v) => {
    const d = toDate(v);
    return d ? relTime(d.getTime()) : "";
  },
  date: (v) => {
    const d = toDate(v);
    if (!d) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  trim40: (v) => {
    const s = String(v ?? "").replace(/\s+/g, " ").trim();
    return s.length > 40 ? s.slice(0, 40) + "…" : s;
  },
  host: (v) => {
    try {
      return new URL(String(v)).hostname;
    } catch {
      return String(v ?? "");
    }
  },
  upper: (v) => String(v ?? "").toUpperCase(),
};

/** "{{a.b|num}} 次" → 用当前条目填充 */
export function renderTemplate(tpl: string | undefined, item: unknown): string {
  if (!tpl) return "";
  return tpl
    .replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*(\w+)\s*)?\}\}/g, (_, path: string, filter?: string) => {
      const v = getPath(item, path);
      if (filter && FILTERS[filter]) return FILTERS[filter](v);
      if (v == null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    })
    .trim();
}

// ---------- 校验 ----------

const ID = /^[a-z0-9][a-z0-9-]{0,48}$/;

export function validateSpec(raw: unknown): { spec?: WidgetSpec; errors: string[] } {
  const errors: string[] = [];
  const o = raw as any;
  if (!o || typeof o !== "object") return { errors: ["需要一个 JSON 对象"] };
  if (o.format !== "deskboard.widget/v1") errors.push('format 必须是 "deskboard.widget/v1"');
  if (!ID.test(String(o.id ?? ""))) errors.push("id 只能用小写字母、数字和 -，且不超过 50 个字符");
  if (!String(o.name ?? "").trim()) errors.push("缺少 name");
  if (!o.source || !["json", "rss"].includes(o.source.type)) errors.push('source.type 必须是 "json" 或 "rss"');
  const url = String(o.source?.url ?? "");
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) errors.push("source.url 必须是 https:// 地址");
  if (!o.map || !String(o.map.title ?? "").trim()) errors.push("缺少 map.title");
  if (o.display?.type && !["list", "stat"].includes(o.display.type)) errors.push('display.type 只能是 "list" 或 "stat"');
  if (o.source?.auth && (!o.source.auth.header || !o.source.auth.secret)) errors.push("source.auth 需要 header 和 secret");
  if (errors.length) return { errors };
  return { spec: o as WidgetSpec, errors };
}

// ---------- 取数据 ----------

async function fetchRaw(spec: WidgetSpec): Promise<unknown> {
  if (spec.source.type === "rss") {
    const items = await call<FeedItem[]>("fetch_feed", { url: spec.source.url });
    return items.map(({ content: _c, ...it }) => it);
  }
  return call("fetch_json", { url: spec.source.url, headers: spec.source.headers ?? null, auth: spec.source.auth ?? null });
}

export function mapItems(spec: WidgetSpec, data: unknown): CustomItem[] {
  const root = getPath(data, spec.map.items ?? "");
  const list = Array.isArray(root) ? root : root != null ? [root] : [];
  return list.slice(0, 50).map((it) => ({
    title: renderTemplate(spec.map.title, it),
    subtitle: renderTemplate(spec.map.subtitle, it) || undefined,
    value: renderTemplate(spec.map.value, it) || undefined,
    link: renderTemplate(spec.map.link, it) || undefined,
    label: renderTemplate(spec.map.label, it) || undefined,
  }));
}

/** 预览用：不写缓存 */
export async function previewSpec(spec: WidgetSpec) {
  return mapItems(spec, await fetchRaw(spec));
}

const inflight = new Map<string, Promise<void>>();
const lastRun = new Map<string, number>();

export function refreshCustom(spec: WidgetSpec): Promise<void> {
  const running = inflight.get(spec.id);
  if (running) return running;
  const p = (async () => {
    lastRun.set(spec.id, Date.now());
    const prev = getState().cache.custom?.[spec.id];
    let next;
    try {
      next = { ts: Date.now(), items: mapItems(spec, await fetchRaw(spec)) };
    } catch (e) {
      next = { ts: Date.now(), items: prev?.items ?? [], error: e instanceof Error ? e.message : String(e) };
    }
    setCache({ custom: { ...(getState().cache.custom ?? {}), [spec.id]: next } });
  })().finally(() => inflight.delete(spec.id));
  inflight.set(spec.id, p);
  return p;
}

/** 调度器每 20 秒调用一次：到了各自刷新间隔、并且在看板上用着的才刷新 */
export function refreshDueCustom() {
  if (!isTauri) return;
  const s = getState();
  const used = new Set(s.widgets.filter((w) => w.type === "custom").map((w) => w.config.specId));
  for (const spec of s.customWidgets) {
    if (!used.has(spec.id)) continue;
    const every = Math.max(5, spec.source.refreshMinutes ?? 30) * 60_000;
    if (Date.now() - (lastRun.get(spec.id) ?? 0) >= every) refreshCustom(spec);
  }
}

export function installSpec(spec: WidgetSpec) {
  setState((s) => {
    const i = s.customWidgets.findIndex((x) => x.id === spec.id);
    const list = i >= 0 ? s.customWidgets.map((x, j) => (j === i ? spec : x)) : [...s.customWidgets, spec];
    return { ...s, customWidgets: list };
  });
  lastRun.delete(spec.id);
  if (isTauri) refreshCustom(spec);
}

export function uninstallSpec(id: string) {
  setState((s) => ({
    ...s,
    customWidgets: s.customWidgets.filter((x) => x.id !== id),
    widgets: s.widgets.filter((w) => !(w.type === "custom" && w.config.specId === id)),
  }));
}

/** 规范文档里的 deskboard.widget/v1 示例，给工坊的「从示例开始」用 */
export function specExamples(doc: string): WidgetSpec[] {
  const out: WidgetSpec[] = [];
  for (const m of doc.matchAll(/```json\s*([\s\S]*?)```/g)) {
    try {
      const o = JSON.parse(m[1]);
      if (o?.format === "deskboard.widget/v1") out.push(o);
    } catch {
      /* 文档里的非完整片段 */
    }
  }
  return out;
}
