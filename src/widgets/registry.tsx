import type { FC } from "react";
import type { IconName } from "../icons";
import { patch, useStore } from "../store";
import type { PageKey, WidgetInst, WidgetSize, WidgetType } from "../types";
import AgendaWidget from "./AgendaWidget";
import AIWidget from "./AIWidget";
import CalendarWidget from "./CalendarWidget";
import ClockWidget from "./ClockWidget";
import type { WidgetProps } from "./common";
import NewsWidget from "./NewsWidget";
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

const NewsConfig: FC<{ w: WidgetInst }> = ({ w }) => {
  const feeds = useStore((s) => s.feeds);
  return (
    <Select w={w} k="sourceId" label="资讯源" options={[{ value: "", label: "全部资讯源" }, ...feeds.map((f) => ({ value: f.id, label: f.name }))]} />
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
];

export const widgetDef = (t: WidgetType) => WIDGETS.find((d) => d.type === t)!;
