export type WidgetSize = "s" | "m" | "l" | "xl";

export type WidgetType =
  | "clock"
  | "calendar"
  | "agenda"
  | "tasks"
  | "notes"
  | "project"
  | "ai"
  | "news";

export interface WidgetInst {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  config: Record<string, string | undefined>;
  /** 网格坐标（列、行），缺省时自动找空位 */
  x?: number;
  y?: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:mm，空表示全天
  end?: string;
  color: string;
  remind?: number; // 提前几分钟提醒，空表示不提醒
  notes?: string;
  projectId?: string;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  due?: string; // YYYY-MM-DD
  priority: 0 | 1 | 2; // 0 普通 1 重要 2 紧急
  projectId?: string;
  createdAt: number;
  doneAt?: number;
}

export type ItemStatus = "todo" | "doing" | "done";

export interface ProjectItem {
  id: string;
  text: string;
  detail?: string;
  status: ItemStatus;
  due?: string;
  createdAt: number;
}

export interface ProjectLog {
  id: string;
  date: string;
  text: string;
}

export interface Project {
  id: string;
  name: string;
  emoji: string;
  color: string;
  status: "active" | "paused" | "done";
  overview: string; // Markdown
  items: ProjectItem[];
  logs: ProjectLog[];
  createdAt: number;
  updatedAt: number;
}

export type ProviderKind = "deepseek" | "glm" | "claude" | "claudecode";

export interface ProviderConf {
  id: string;
  kind: ProviderKind;
  name: string;
  enabled: boolean;
  /** GLM：国内 https://open.bigmodel.cn，国际 https://api.z.ai */
  host?: string;
  /** Claude API：月预算（美元），用于计算进度 */
  budget?: number;
}

export interface Metric {
  label: string;
  value: string;
  sub?: string;
  percent?: number; // 0-100，已用比例
}

export interface UsageSnap {
  ts: number;
  ok: boolean;
  error?: string;
  headline: string;
  headlineSub?: string;
  percent?: number;
  metrics: Metric[];
}

export interface ClaudeCodeRow {
  date: string;
  model: string;
  project: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cache_write_1h: number;
  requests: number;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface FeedItem {
  title: string;
  link: string;
  published?: string;
  summary?: string;
}

export interface FeedCache {
  ts: number;
  items: FeedItem[];
  error?: string;
}

export interface Swatch {
  hex: string;
  weight: number;
}

export interface Palette {
  colors: Swatch[];
  luminance: number; // 0-1 平均亮度
}

export interface Background {
  kind: "preset" | "image" | "video" | "transparent";
  preset?: string;
  file?: string; // 本地绝对路径
  title?: string;
  palette?: Palette; // 从壁纸提取的配色
}

export interface Settings {
  theme: "auto" | "light" | "dark"; // auto = 按壁纸亮度
  background: Background;
  accent?: string; // 手动指定强调色，空表示从壁纸自动取
  iconStyle: "palette" | "mono";
  glass: number; // 小组件不透明度 0.3-1
  dim: number; // 壁纸暗化 0-0.6
  blur: number; // 壁纸模糊 px
  font: string;
  customFont?: { name: string; file: string };
  showDock: boolean;
  cellSize: number; // 网格最小格子边长 px
  desktopMode: boolean; // 置于桌面底层、不显示在任务栏
  alwaysOnTop: boolean;
  aiRefreshMin: number;
  feedRefreshMin: number;
  /** 旧版字段，迁移用 */
  wallpaper?: string;
}

export interface AppData {
  version: 1;
  widgets: WidgetInst[];
  notes: Note[];
  events: CalEvent[];
  tasks: Task[];
  projects: Project[];
  providers: ProviderConf[];
  feeds: FeedSource[];
  settings: Settings;
  cache: {
    usage: Record<string, UsageSnap>;
    feeds: Record<string, FeedCache>;
    claudeCode?: { ts: number; rows: ClaudeCodeRow[]; error?: string };
  };
}

export type PageKey = "notes" | "calendar" | "tasks" | "projects" | "ai" | "news" | "settings";
