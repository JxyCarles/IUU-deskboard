//! deskboard.import/v1 导入：校验 → 生成预览计划 → 合并写入 → 可撤销。
//! 规范见 docs/扩展规范.md 第一章。

import { call, isTauri } from "../api";
import { getState, replaceAll, setState } from "../store";
import type { AppData, CalEvent, FeedSource, Note, Project, ProjectItem, ProjectLog, Task } from "../types";
import { COLORS, EMOJIS, uid } from "../utils";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const date = (v: unknown) => (DATE.test(str(v)) ? str(v) : undefined);
const time = (v: unknown) => (TIME.test(str(v)) ? str(v) : undefined);
const color = (v: unknown) => (/^#[0-9a-fA-F]{6}$/.test(str(v)) ? str(v) : undefined);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export interface ProjectPlan {
  input: Project;
  existing?: Project;
  newItems: ProjectItem[];
  newLogs: ProjectLog[];
  overview?: string; // 合并时要写入的概况（原概况为空才写）
}

export interface ImportPlan {
  projects: ProjectPlan[];
  tasks: { item: Task; dup: boolean }[];
  events: { item: CalEvent; dup: boolean }[];
  notes: { item: Note; dup: boolean }[];
  feeds: { item: FeedSource; dup: boolean }[];
  warnings: string[];
}

/** 校验并生成导入计划（不写入） */
export function planImport(raw: unknown): ImportPlan {
  if (!raw || typeof raw !== "object") throw new Error("需要一个 JSON 对象");
  const o = raw as Record<string, unknown>;
  const warnings: string[] = [];
  if (o.format && o.format !== "deskboard.import/v1") warnings.push(`format 是「${String(o.format)}」，按 deskboard.import/v1 处理`);
  const s = getState();
  const now = Date.now();

  const projectIdByName = new Map(s.projects.map((p) => [p.name, p.id]));
  const projects: ProjectPlan[] = [];
  arr(o.projects).forEach((p, i) => {
    const name = str(p?.name);
    if (!name) return warnings.push(`projects[${i}] 缺少 name，已跳过`);
    const items: ProjectItem[] = arr(p.items)
      .map((it, j) => {
        const text = str(it?.text);
        if (!text) {
          warnings.push(`项目「${name}」的 items[${j}] 缺少 text，已跳过`);
          return null;
        }
        const st = ["todo", "doing", "done"].includes(it.status) ? it.status : "todo";
        if (it.due && !date(it.due)) warnings.push(`「${text}」的 due「${it.due}」不是 YYYY-MM-DD，已忽略`);
        return { id: uid(), text, status: st, detail: str(it.detail) || undefined, due: date(it.due), createdAt: now } as ProjectItem;
      })
      .filter(Boolean) as ProjectItem[];
    const logs: ProjectLog[] = arr(p.logs)
      .filter((l) => date(l?.date) && str(l?.text))
      .map((l) => ({ id: uid(), date: date(l.date)!, text: str(l.text) }));
    const input: Project = {
      id: uid(),
      name,
      emoji: str(p.emoji) || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      color: color(p.color) ?? COLORS[5],
      status: ["active", "paused", "done"].includes(p.status) ? p.status : "active",
      overview: str(p.overview),
      items,
      logs,
      createdAt: now,
      updatedAt: now,
    };
    const existing = s.projects.find((x) => x.name === name);
    if (!existing) {
      projects.push({ input, newItems: items, newLogs: logs });
      projectIdByName.set(name, input.id);
    } else {
      const have = new Set(existing.items.map((x) => x.text));
      const haveLog = new Set(existing.logs.map((x) => x.date + x.text));
      projects.push({
        input,
        existing,
        newItems: items.filter((x) => !have.has(x.text)),
        newLogs: logs.filter((x) => !haveLog.has(x.date + x.text)),
        overview: !existing.overview.trim() && input.overview ? input.overview : undefined,
      });
    }
  });

  const pid = (name: unknown) => (str(name) ? projectIdByName.get(str(name)) : undefined);
  const unknownProject = (name: unknown, what: string) => {
    if (str(name) && !projectIdByName.has(str(name))) warnings.push(`${what}关联的项目「${str(name)}」不存在，已取消关联`);
  };

  const tasks = arr(o.tasks)
    .filter((t, i) => str(t?.title) || (warnings.push(`tasks[${i}] 缺少 title，已跳过`), false))
    .map((t) => {
      unknownProject(t.project, `待办「${str(t.title)}」`);
      const item: Task = {
        id: uid(),
        title: str(t.title),
        done: !!t.done,
        due: date(t.due),
        priority: [0, 1, 2].includes(t.priority) ? t.priority : 0,
        projectId: pid(t.project),
        createdAt: now,
        doneAt: t.done ? now : undefined,
      };
      return { item, dup: s.tasks.some((x) => x.title === item.title && x.due === item.due) };
    });

  const events = arr(o.events)
    .filter((e, i) => (str(e?.title) && date(e?.date)) || (warnings.push(`events[${i}] 缺少 title 或 date 格式不对，已跳过`), false))
    .map((e) => {
      unknownProject(e.project, `日程「${str(e.title)}」`);
      const start = time(e.start);
      const item: CalEvent = {
        id: uid(),
        title: str(e.title),
        date: date(e.date)!,
        start,
        end: start ? time(e.end) : undefined,
        color: color(e.color) ?? "#007AFF",
        remind: start && typeof e.remind === "number" ? e.remind : undefined,
        notes: str(e.notes) || undefined,
        projectId: pid(e.project),
      };
      return { item, dup: s.events.some((x) => x.title === item.title && x.date === item.date && x.start === item.start) };
    });

  const notes = arr(o.notes)
    .filter((n, i) => str(n?.title) || str(n?.content) || (warnings.push(`notes[${i}] 是空的，已跳过`), false))
    .map((n) => {
      const item: Note = { id: uid(), title: str(n.title), content: typeof n.content === "string" ? n.content : "", pinned: !!n.pinned, createdAt: now, updatedAt: now };
      return { item, dup: !!item.title && s.notes.some((x) => x.title === item.title) };
    });

  const feeds = arr(o.feeds)
    .filter((f, i) => /^https?:\/\//.test(str(f?.url)) || (warnings.push(`feeds[${i}] 的 url 无效，已跳过`), false))
    .map((f) => {
      const url = str(f.url);
      let name = str(f.name);
      if (!name) {
        try {
          name = new URL(url).hostname;
        } catch {
          name = url;
        }
      }
      return { item: { id: uid(), name, url, enabled: true } as FeedSource, dup: s.feeds.some((x) => x.url === url) };
    });

  return { projects, tasks, events, notes, feeds, warnings };
}

export function planIsEmpty(p: ImportPlan) {
  return (
    p.projects.every((x) => x.existing && !x.newItems.length && !x.newLogs.length && !x.overview) &&
    [p.tasks, p.events, p.notes, p.feeds].every((l) => l.every((x) => x.dup))
  );
}

let undoSnapshot: AppData | null = null;
export const canUndoImport = () => !!undoSnapshot;

/** 写入。projectMode = "new" 时同名项目另建一个 */
export async function applyImport(plan: ImportPlan, projectMode: "merge" | "new") {
  if (isTauri) await call("backup_data", { tag: "import" }).catch(() => {});
  undoSnapshot = structuredClone(getState());
  const now = Date.now();
  setState((s) => {
    let projects = [...s.projects];
    for (const p of plan.projects) {
      if (!p.existing || projectMode === "new") {
        projects.push(p.input);
      } else {
        projects = projects.map((x) =>
          x.id === p.existing!.id
            ? { ...x, items: [...x.items, ...p.newItems], logs: [...x.logs, ...p.newLogs], overview: p.overview ?? x.overview, updatedAt: now }
            : x,
        );
      }
    }
    const fresh = <T>(l: { item: T; dup: boolean }[]) => l.filter((x) => !x.dup).map((x) => x.item);
    return {
      ...s,
      projects,
      tasks: [...s.tasks, ...fresh(plan.tasks)],
      events: [...s.events, ...fresh(plan.events)],
      notes: [...s.notes, ...fresh(plan.notes)],
      feeds: [...s.feeds, ...fresh(plan.feeds)],
    };
  });
}

export function undoImport() {
  if (!undoSnapshot) return;
  replaceAll(undoSnapshot);
  undoSnapshot = null;
}

/** 导出项目为 deskboard.import/v1（去掉内部字段，方便交给 AI 再整理或备份） */
export function exportProjects(ids?: string[]) {
  const s = getState();
  const list = ids ? s.projects.filter((p) => ids.includes(p.id)) : s.projects;
  return {
    format: "deskboard.import/v1",
    projects: list.map((p) => ({
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      status: p.status,
      overview: p.overview,
      items: p.items.map((i) => ({ text: i.text, status: i.status, ...(i.detail ? { detail: i.detail } : {}), ...(i.due ? { due: i.due } : {}) })),
      logs: p.logs.map((l) => ({ date: l.date, text: l.text })),
    })),
  };
}
