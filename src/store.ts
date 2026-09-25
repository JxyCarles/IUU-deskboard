import { useSyncExternalStore } from "react";
import { call, isTauri } from "./api";
import type { AppData } from "./types";
import { uid, today } from "./utils";

// ---------- 默认数据 ----------

function defaultData(): AppData {
  const now = Date.now();
  const demoProjectId = uid();
  return {
    version: 1,
    widgets: [
      { id: uid(), type: "clock", size: "s", config: {} },
      { id: uid(), type: "calendar", size: "s", config: {} },
      { id: uid(), type: "ai", size: "m", config: {} },
      { id: uid(), type: "project", size: "l", config: { projectId: demoProjectId } },
      { id: uid(), type: "agenda", size: "m", config: {} },
      { id: uid(), type: "tasks", size: "m", config: {} },
      { id: uid(), type: "notes", size: "m", config: {} },
      { id: uid(), type: "news", size: "l", config: {} },
    ],
    notes: [
      {
        id: uid(),
        title: "欢迎使用桌面看板",
        content:
          "点右上角 **编辑** 可以调整小组件：\n\n- 拖动排序\n- 切换 小 / 中 / 大 / 超大 尺寸\n- 点 ＋ 添加新组件\n\n点任意小组件打开完整页面。",
        pinned: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    events: [],
    tasks: [],
    projects: [
      {
        id: demoProjectId,
        name: "示例项目",
        emoji: "🚀",
        color: "#007AFF",
        status: "active",
        overview: "在这里写项目概况：目标、背景、关键节点、相关链接……",
        items: [
          { id: uid(), text: "梳理需求", status: "done", createdAt: now },
          { id: uid(), text: "搭建工程骨架", status: "doing", createdAt: now },
          { id: uid(), text: "接入 AI 额度", status: "todo", createdAt: now },
          { id: uid(), text: "完善资讯源", status: "todo", createdAt: now },
        ],
        logs: [{ id: uid(), date: today(), text: "创建项目" }],
        createdAt: now,
        updatedAt: now,
      },
    ],
    providers: [
      { id: "deepseek", kind: "deepseek", name: "DeepSeek", enabled: true },
      { id: "glm", kind: "glm", name: "智谱 GLM", enabled: true, host: "https://open.bigmodel.cn" },
      { id: "claude", kind: "claude", name: "Claude API", enabled: true },
      { id: "claudecode", kind: "claudecode", name: "Claude Code", enabled: true },
    ],
    feeds: [
      { id: uid(), name: "少数派", url: "https://sspai.com/feed", enabled: true },
      { id: uid(), name: "IT之家", url: "https://www.ithome.com/rss/", enabled: true },
      { id: uid(), name: "Hacker News", url: "https://hnrss.org/frontpage", enabled: true },
    ],
    settings: {
      theme: "auto",
      background: { kind: "preset", preset: "dusk" },
      iconStyle: "palette",
      glass: 0.72,
      dim: 0.15,
      blur: 0,
      font: "rounded",
      showDock: true,
      sceneMotion: true,
      sceneParallax: true,
      cellSize: 150,
      desktopMode: false,
      alwaysOnTop: false,
      aiRefreshMin: 15,
      feedRefreshMin: 30,
    },
    cache: { usage: {}, feeds: {} },
  };
}

/** 旧数据缺字段时用默认值补齐 */
function migrate(raw: Partial<AppData>): AppData {
  const d = defaultData();
  const settings = { ...d.settings, ...(raw.settings ?? {}) };
  // 旧版只有 wallpaper 字段
  if (raw.settings && !raw.settings.background && raw.settings.wallpaper) {
    settings.background = { kind: "preset", preset: raw.settings.wallpaper };
  }
  delete settings.wallpaper;
  return {
    ...d,
    ...raw,
    settings,
    cache: { ...d.cache, ...(raw.cache ?? {}) },
    version: 1,
  };
}

// ---------- 状态容器 ----------

let state: AppData = defaultData();
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

const LS_KEY = "desk-board-data";

export async function loadData() {
  try {
    const text = isTauri ? await call<string | null>("load_data") : localStorage.getItem(LS_KEY);
    if (text) state = migrate(JSON.parse(text));
  } catch (e) {
    console.error("读取数据失败，使用默认数据", e);
  }
  loaded = true;
  emit();
}

function persist() {
  if (!loaded) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const text = JSON.stringify(state);
    if (isTauri) call("save_data", { data: text }).catch((e) => console.error("保存失败", e));
    else localStorage.setItem(LS_KEY, text);
  }, 400);
}

function emit() {
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function setState(fn: (s: AppData) => AppData) {
  state = fn(state);
  emit();
  persist();
}

export function replaceAll(data: unknown) {
  state = migrate(data as Partial<AppData>);
  emit();
  persist();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** selector 必须返回 state 里已有的引用（不要在里面 new 对象/数组） */
export function useStore<T>(selector: (s: AppData) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------- 集合操作 ----------

type Coll = "widgets" | "notes" | "events" | "tasks" | "projects" | "providers" | "feeds";
type Item<K extends Coll> = AppData[K][number];

export function upsert<K extends Coll>(k: K, item: Item<K>) {
  setState((s) => {
    const arr = s[k] as Item<K>[];
    const i = arr.findIndex((x) => x.id === item.id);
    const next = i >= 0 ? arr.map((x, j) => (j === i ? item : x)) : [...arr, item];
    return { ...s, [k]: next };
  });
}

export function patch<K extends Coll>(k: K, id: string, p: Partial<Item<K>>) {
  setState((s) => ({
    ...s,
    [k]: (s[k] as Item<K>[]).map((x) => (x.id === id ? { ...x, ...p } : x)),
  }));
}

export function remove<K extends Coll>(k: K, id: string) {
  setState((s) => ({ ...s, [k]: (s[k] as Item<K>[]).filter((x) => x.id !== id) }));
}

export function setSettings(p: Partial<AppData["settings"]>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...p } }));
}

export function setCache(p: Partial<AppData["cache"]>) {
  setState((s) => ({ ...s, cache: { ...s.cache, ...p } }));
}
