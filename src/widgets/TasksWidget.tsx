import { useMemo, useState } from "react";
import { patch, upsert, useStore } from "../store";
import type { Task } from "../types";
import { fmtDateLabel, monthKey, parseYmd, today, uid, weekKey } from "../utils";
import { Ring, stop, WHead, type WidgetProps } from "./common";

/** 周/月待办相对当前的状态：本周期内、已过去、还没到 */
export function periodState(x: Task): "current" | "past" | "future" | undefined {
  if (!x.period || !x.periodKey) return;
  const cur = x.period === "week" ? weekKey() : monthKey();
  return x.periodKey === cur ? "current" : x.periodKey < cur ? "past" : "future";
}

export type TaskBucket = "late" | "today" | "week" | "month" | "later" | "none";

/** 未完成待办归到哪一组：有日期看日期；没日期但属于本周/本月的归到周/月 */
export function taskBucket(x: Task, t = today()): TaskBucket {
  const ps = periodState(x);
  if (x.due && x.due < t) return "late";
  if (x.due === t) return "today";
  if (ps === "past") return "late";
  if (ps === "current") return x.period === "week" ? "week" : "month";
  if (x.due) return "later";
  return "none";
}

const RANK: Record<TaskBucket, number> = { late: 0, today: 1, week: 2, month: 3, later: 4, none: 5 };

/** 逾期 → 今天 → 本周 → 本月 → 之后 → 无日期；同组内先按手动拖好的顺序，没拖过的按优先级 */
export function sortTasks(a: Task, b: Task) {
  const t = today();
  const unordered = (x: Task) => (x.order === undefined ? 1 : 0);
  return (
    RANK[taskBucket(a, t)] - RANK[taskBucket(b, t)] ||
    unordered(a) - unordered(b) ||
    (a.order ?? 0) - (b.order ?? 0) ||
    b.priority - a.priority ||
    (a.due ?? "~").localeCompare(b.due ?? "~") ||
    a.createdAt - b.createdAt
  );
}

/** 没有具体日期的周/月待办显示成"本周""本月""3月"之类 */
export function periodLabel(x: Task) {
  const ps = periodState(x);
  if (!ps || !x.periodKey) return;
  if (x.period === "week") {
    if (ps === "current") return "本周";
    const d = parseYmd(x.periodKey);
    return `${d.getMonth() + 1}/${d.getDate()} 那周`;
  }
  return ps === "current" ? "本月" : `${Number(x.periodKey.slice(5))}月`;
}

const PRI = ["", "!", "!!"];

export function TaskRow({ t, showDue = true }: { t: Task; showDue?: boolean }) {
  const td = today();
  return (
    <label className="task-row" onClick={stop}>
      <input
        type="checkbox"
        checked={t.done}
        onChange={() => patch("tasks", t.id, { done: !t.done, doneAt: t.done ? undefined : Date.now() })}
      />
      <span className={"task-title" + (t.done ? " done" : "")}>
        {t.priority > 0 && <b className="pri">{PRI[t.priority]}</b>}
        {t.title}
      </span>
      {showDue && t.due && <span className={"task-due" + (t.due < td && !t.done ? " late" : "")}>{fmtDateLabel(t.due)}</span>}
      {showDue && !t.due && t.period && <span className={"task-due" + (periodState(t) === "past" && !t.done ? " late" : "")}>{periodLabel(t)}</span>}
    </label>
  );
}

export default function TasksWidget({ w }: WidgetProps) {
  const tasks = useStore((s) => s.tasks);
  const [draft, setDraft] = useState("");
  const pending = useMemo(() => tasks.filter((t) => !t.done).sort(sortTasks), [tasks]);
  const t = today();
  const todayAll = tasks.filter((x) => x.due === t || (x.done && x.doneAt && new Date(x.doneAt).toDateString() === new Date().toDateString()));
  const todayDone = todayAll.filter((x) => x.done).length;

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    upsert("tasks", { id: uid(), title, done: false, priority: 0, due: t, createdAt: Date.now() });
    setDraft("");
  };

  if (w.size === "s") {
    return (
      <div className="tasks-s">
        <WHead icon="tasks" title="待办" color="var(--c-tasks)" />
        <div className="tasks-s-main">
          <Ring percent={todayAll.length ? (todayDone / todayAll.length) * 100 : 0} size={58}>
            <b>{pending.length}</b>
          </Ring>
          <div className="muted small">
            今日完成
            <br />
            {todayDone}/{todayAll.length}
          </div>
        </div>
        <div className="tasks-s-list">
          {pending.slice(0, 2).map((x) => (
            <div key={x.id} className="ellipsis small">
              · {x.title}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const max = w.size === "m" ? 4 : w.size === "l" ? 9 : 9;
  return (
    <div className="tasks-l">
      <WHead icon="tasks" title="待办" color="var(--c-tasks)" right={`${pending.length} 项未完成`} />
      <div className={"tasks-list" + (w.size === "xl" ? " two-col" : "")}>
        {pending.length === 0 && <div className="muted small">全部完成 🎉</div>}
        {pending.slice(0, w.size === "xl" ? 16 : max).map((x) => (
          <TaskRow key={x.id} t={x} />
        ))}
      </div>
      {w.size !== "m" && (
        <input
          className="quick-add"
          placeholder="＋ 添加今天的待办，回车保存"
          value={draft}
          onClick={stop}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      )}
    </div>
  );
}
