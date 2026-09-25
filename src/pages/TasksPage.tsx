import { useMemo, useState } from "react";
import { patch, remove, setState, upsert, useStore } from "../store";
import type { Task } from "../types";
import { addDays, fmtDateLabel, parseYmd, today, uid, WEEK, ymd } from "../utils";
import { sortTasks } from "../widgets/TasksWidget";

const PRI_LABEL = ["普通", "重要", "紧急"];

function TaskLine({ t }: { t: Task }) {
  const projects = useStore((s) => s.projects);
  const td = today();
  return (
    <div className={"tp-line" + (t.done ? " done" : "")}>
      <input type="checkbox" checked={t.done} onChange={() => patch("tasks", t.id, { done: !t.done, doneAt: t.done ? undefined : Date.now() })} />
      <input className="tp-title" value={t.title} onChange={(e) => patch("tasks", t.id, { title: e.target.value })} />
      <select className={"tp-pri p" + t.priority} value={t.priority} onChange={(e) => patch("tasks", t.id, { priority: Number(e.target.value) as Task["priority"] })}>
        {PRI_LABEL.map((l, i) => (
          <option key={i} value={i}>
            {l}
          </option>
        ))}
      </select>
      <select className="tp-proj" value={t.projectId ?? ""} onChange={(e) => patch("tasks", t.id, { projectId: e.target.value || undefined })}>
        <option value="">无项目</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.emoji} {p.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        className={"tp-date" + (t.due && t.due < td && !t.done ? " late" : "")}
        value={t.due ?? ""}
        onChange={(e) => patch("tasks", t.id, { due: e.target.value || undefined })}
      />
      <button className="icon-btn sm" title="删除" onClick={() => remove("tasks", t.id)}>
        ✕
      </button>
    </div>
  );
}

export default function TasksPage() {
  const tasks = useStore((s) => s.tasks);
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState(today());
  const [view, setView] = useState<"list" | "week">("list");
  const t = today();

  const groups = useMemo(() => {
    const pending = tasks.filter((x) => !x.done).sort(sortTasks);
    return [
      { name: "已逾期", items: pending.filter((x) => x.due && x.due < t) },
      { name: "今天", items: pending.filter((x) => x.due === t) },
      { name: "之后", items: pending.filter((x) => x.due && x.due > t) },
      { name: "未安排日期", items: pending.filter((x) => !x.due) },
      { name: "已完成", items: tasks.filter((x) => x.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30) },
    ];
  }, [tasks, t]);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    upsert("tasks", { id: uid(), title, done: false, priority: 0, due: due || undefined, createdAt: Date.now() });
    setDraft("");
  };

  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(new Date(), i)));

  return (
    <div className="tasks-page">
      <div className="tp-add">
        <input className="input big grow" placeholder="添加待办，回车保存" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} title="截止日期（清空表示不安排）" />
        <button className="btn primary" onClick={add}>
          添加
        </button>
        <div className="seg">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            清单
          </button>
          <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>
            本周计划
          </button>
        </div>
        {tasks.some((x) => x.done) && (
          <button className="btn" onClick={() => setState((s) => ({ ...s, tasks: s.tasks.filter((x) => !x.done) }))}>
            清除已完成
          </button>
        )}
      </div>

      {view === "list" ? (
        groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.name} className="tp-group">
                <h4>
                  {g.name} <span className="muted">{g.items.length}</span>
                </h4>
                {g.items.map((x) => (
                  <TaskLine key={x.id} t={x} />
                ))}
              </div>
            ),
        )
      ) : (
        <div className="week-plan">
          {days.map((d) => {
            const items = tasks.filter((x) => x.due === d).sort(sortTasks);
            const date = parseYmd(d);
            return (
              <div
                key={d}
                className={"wp-col" + (d === t ? " today" : "")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/task");
                  if (id) patch("tasks", id, { due: d });
                }}
              >
                <div className="wp-h">
                  {fmtDateLabel(d)}
                  <span className="muted small"> 周{WEEK[date.getDay()]}</span>
                </div>
                {items.map((x) => (
                  <div key={x.id} className={"wp-card" + (x.done ? " done" : "")} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)}>
                    <input type="checkbox" checked={x.done} onChange={() => patch("tasks", x.id, { done: !x.done, doneAt: x.done ? undefined : Date.now() })} />
                    {x.title}
                  </div>
                ))}
              </div>
            );
          })}
          <div
            className="wp-col inbox"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/task");
              if (id) patch("tasks", id, { due: undefined });
            }}
          >
            <div className="wp-h">未安排</div>
            {tasks
              .filter((x) => !x.due && !x.done)
              .map((x) => (
                <div key={x.id} className="wp-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)}>
                  {x.title}
                </div>
              ))}
          </div>
          <div className="muted small wp-tip">把卡片拖到某一天即可安排日期</div>
        </div>
      )}
    </div>
  );
}
