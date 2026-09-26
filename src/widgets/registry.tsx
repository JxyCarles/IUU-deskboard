import type { FC } from "react";
import type { IconName } from "../icons";
import { orderSections } from "../services/brief";
import { LANGUAGES } from "../services/github";
import { getState, patch, useStore } from "../store";
import type { PageKey, WidgetInst, WidgetSize, WidgetType } from "../types";
import AgendaWidget from "./AgendaWidget";
import AIWidget from "./AIWidget";
import CalendarWidget from "./CalendarWidget";
import ClockWidget from "./ClockWidget";
import CustomWidget, { specColor, specIcon } from "./CustomWidget";
import GithubWidget, { GITHUB_SECTIONS } from "./GithubWidget";
import type { WidgetProps } from "./common";
import DailyWidget from "./DailyWidget";
import NewsWidget, { newsSections } from "./NewsWidget";
import NotesWidget from "./NotesWidget";
import ProjectWidget from "./ProjectWidget";
import TasksWidget from "./TasksWidget";

export interface WidgetDef {
  type: WidgetType;
  name: string;
  desc: string;
  icon: IconName;
  color: string;
  sizes: WidgetSize[];
  page?: PageKey;
  Component: FC<WidgetProps>;
  Config?: FC<{ w: WidgetInst }>;
}

export const SIZE_LABEL: Record<WidgetSize, string> = { s: "小", m: "中", l: "大", xl: "超大" };

export { SIZE_SPAN } from "../layout";

function Select({ w, k, label, options }: { w: WidgetInst; k: string; label: string; options: { value: string; label: string }[] }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={w.config[k] ?? ""} onChange={(e) => patch("widgets", w.id, { config: { ...w.config, [k]: e.target.value || undefined } })}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const ProjectConfig: FC<{ w: WidgetInst }> = ({ w }) => {
  const projects = useStore((s) => s.projects);
  return (
    <Select
      w={w}
      k="projectId"
      label="显示的项目"
      options={[{ value: "", label: "全部项目（总览）" }, ...projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))]}
    />
  );
};

const AIConfig: FC<{ w: WidgetInst }> = ({ w }) => {
  const providers = useStore((s) => s.providers);
  return (
    <Select
      w={w}
      k="providerId"
      label="小尺寸时显示的平台"
      options={[{ value: "", label: "第一个启用的平台" }, ...providers.map((p) => ({ value: p.id, label: p.name }))]}
    />
  );
};

const GithubConfig: FC<{ w: WidgetInst }> = ({ w }) => (
  <>
    <SectionOrder w={w} all={GITHUB_SECTIONS} />
    <Select
      w={w}
      k="since"
      label="时间范围"
      options={[
        { value: "", label: "今日" },
        { value: "weekly", label: "本周" },
        { value: "monthly", label: "本月" },
      ]}
    />
    <Select w={w} k="language" label="语言" options={LANGUAGES.map((l) => ({ value: l, label: l || "全部语言" }))} />
    <Select
      w={w}
      k="mode"
      label="数据来源"
      options={[
        { value: "", label: "Trending 页面（与网页一致）" },
        { value: "api", label: "GitHub Search API（近似）" },
      ]}
    />
  </>
);

/** 小组件里的内容块排序 / 显示（存在 config.order、config.hide） */
function SectionOrder({ w, all }: { w: WidgetInst; all: { id: string; name: string }[] }) {
  const ids = all.map((x) => x.id);
  const order = orderSections(ids, w.config.order);
  const hidden = new Set((w.config.hide ?? "").split(",").filter(Boolean));
  const save = (o: string[], h: Set<string>) => patch("widgets", w.id, { config: { ...w.config, order: o.join(","), hide: [...h].join(",") || undefined } });
  const move = (i: number, d: number) => {
    const o = [...order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    save(o, hidden);
  };
  const toggle = (id: string) => {
    const h = new Set(hidden);
    if (h.has(id)) h.delete(id);
    else h.add(id);
    save(order, h);
  };
  return (
    <div className="field">
      <span>内容顺序（上面的显示在小组件最前面）</span>
      <div className="sec-order">
        {order.map((id, i) => (
          <div key={id} className={"sec-row" + (hidden.has(id) ? " off" : "")}>
            <input type="checkbox" checked={!hidden.has(id)} onChange={() => toggle(id)} title="显示" />
            <span className="grow">{all.find((x) => x.id === id)?.name ?? id}</span>
            <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} title="上移">
              ↑
            </button>
            <button className="icon-btn sm" disabled={i === order.length - 1} onClick={() => move(i, 1)} title="下移">
              ↓
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const NewsConfig: FC<{ w: WidgetInst }> = ({ w }) => {
  const feeds = useStore((s) => s.feeds);
  return (
    <>
      <Select w={w} k="sourceId" label="资讯源" options={[{ value: "", label: "全部资讯源" }, ...feeds.map((f) => ({ value: f.id, label: f.name }))]} />
      <SectionOrder w={w} all={newsSections(feeds, w.config.sourceId)} />
    </>
  );
};

export const WIDGETS: WidgetDef[] = [
  { type: "clock", name: "时钟", desc: "时间、日期、农历与节假日", icon: "clock", color: "var(--c-clock)", sizes: ["s", "m"], Component: ClockWidget },
  { type: "calendar", name: "日历", desc: "今天、月历和近期日程", icon: "calendar", color: "var(--c-calendar)", sizes: ["s", "m", "l"], page: "calendar", Component: CalendarWidget },
  { type: "agenda", name: "日程", desc: "下一项倒计时、今日时间线、超大尺寸为一周计划", icon: "agenda", color: "var(--c-agenda)", sizes: ["s", "m", "l", "xl"], page: "calendar", Component: AgendaWidget },
  { type: "tasks", name: "待办", desc: "待办清单与今日完成度", icon: "tasks", color: "var(--c-tasks)", sizes: ["s", "m", "l", "xl"], page: "tasks", Component: TasksWidget },
  { type: "notes", name: "备忘录", desc: "置顶和最近的备忘", icon: "notes", color: "var(--c-notes)", sizes: ["s", "m", "l", "xl"], page: "notes", Component: NotesWidget },
  { type: "project", name: "项目", desc: "单个项目的概况与待办/进行中/完成，或全部项目总览", icon: "project", color: "var(--c-project)", sizes: ["s", "m", "l", "xl"], page: "projects", Component: ProjectWidget, Config: ProjectConfig },
  { type: "ai", name: "AI 额度", desc: "DeepSeek / GLM / Claude 余额与用量", icon: "ai", color: "var(--c-ai)", sizes: ["s", "m", "l", "xl"], page: "ai", Component: AIWidget, Config: AIConfig },
  { type: "news", name: "资讯", desc: "RSS 资讯聚合", icon: "news", color: "var(--c-news)", sizes: ["s", "m", "l", "xl"], page: "news", Component: NewsWidget, Config: NewsConfig },
  { type: "daily", name: "AI 早报", desc: "橘鸦 AI 早报：每天早上一期，按要闻 / 开发生态 / 产品应用等分类", icon: "daily", color: "var(--c-daily)", sizes: ["s", "m", "l", "xl"], page: "daily", Component: DailyWidget },
  { type: "github", name: "GitHub 热门", desc: "GitHub Trending：今日 / 本周 / 本月热门仓库，可按语言筛选", icon: "github", color: "var(--c-github)", sizes: ["s", "m", "l", "xl"], page: "github", Component: GithubWidget, Config: GithubConfig },
];

/** 自定义小组件（deskboard.widget/v1）共用的定义；名称、图标、尺寸按各自的规范覆盖 */
const CUSTOM_DEF: WidgetDef = {
  type: "custom",
  name: "自定义小组件",
  desc: "在创造台里制作的小组件",
  icon: "grid",
  color: "var(--c-studio)",
  sizes: ["s", "m", "l", "xl"],
  Component: CustomWidget,
};

export const widgetDef = (t: WidgetType) => (t === "custom" ? CUSTOM_DEF : WIDGETS.find((d) => d.type === t)!);

/** 按具体实例取定义：自定义小组件用它自己的名称、图标和允许的尺寸 */
export function widgetDefOf(w: Pick<WidgetInst, "type" | "config">): WidgetDef {
  if (w.type !== "custom") return widgetDef(w.type);
  const spec = getState().customWidgets.find((x) => x.id === w.config.specId);
  if (!spec) return CUSTOM_DEF;
  return {
    ...CUSTOM_DEF,
    name: spec.name,
    desc: spec.description ?? CUSTOM_DEF.desc,
    icon: specIcon(spec),
    color: specColor(spec),
    sizes: spec.display?.sizes?.length ? spec.display.sizes : spec.display?.type === "stat" ? ["s", "m"] : CUSTOM_DEF.sizes,
  };
}
