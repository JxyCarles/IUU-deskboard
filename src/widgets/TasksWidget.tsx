import { useMemo, useState } from "react";
import { patch, upsert, useStore } from "../store";
import type { Task } from "../types";
import { fmtDateLabel, today, uid } from "../utils";
import { Ring, stop, WHead, type WidgetProps } from "./common";

/** 逾期 → 今天 → 有日期 → 无日期；同组内按优先级 */
export function sortTasks(a: Task, b: Task) {
  const t = today();
  const rank = (x: Task) => (!x.due ? 3 : x.due < t ? 0 : x.due === t ? 1 : 2);
  return rank(a) - rank(b) || b.priority - a.priority || (a.due ?? "").localeCompare(b.due ?? "") || a.createdAt - b.createdAt;
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
