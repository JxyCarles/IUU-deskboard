import { useMemo, useRef, useState } from "react";
import { patch, remove, setState, upsert, useStore } from "../store";
import { Grip, SortableList, useSortRow } from "../components/Sortable";
import type { Task } from "../types";
import { addDays, fmtDateLabel, monthKey, parseYmd, today, uid, WEEK, weekKey, ymd } from "../utils";
import { periodLabel, periodState, sortTasks, taskBucket, type TaskBucket } from "../widgets/TasksWidget";

const PRI_LABEL = ["普通", "重要", "紧急"];

type When = "today" | "week" | "month" | "none";
const WHEN: { v: When; label: string }[] = [
  { v: "today", label: "今天" },
  { v: "week", label: "本周" },
  { v: "month", label: "本月" },
  { v: "none", label: "不定期" },
];

const GROUPS: { b: TaskBucket; name: string }[] = [
  { b: "late", name: "已逾期" },
  { b: "today", name: "今天" },
  { b: "week", name: "本周" },
  { b: "month", name: "本月" },
  { b: "later", name: "之后" },
  { b: "none", name: "不定期" },
];

/** 一组内拖动后，把这一组的顺序整体写回 order */
const reorderTasks = (ids: string[]) =>
  setState((s) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    return { ...s, tasks: s.tasks.map((x) => (pos.has(x.id) ? { ...x, order: pos.get(x.id) } : x)) };
  });

const periodPatch = (p: "" | "week" | "month"): Partial<Task> =>
  p ? { period: p, periodKey: p === "week" ? weekKey() : monthKey() } : { period: undefined, periodKey: undefined };

/** 截止日期可选：没有时显示一个按钮，点开再选；有时可一键清除 */
function DueInput({ value, onChange, late, className = "" }: { value?: string; onChange: (v?: string) => void; late?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  if (!value && !open)
    return (
      <button
        className={"due-empty " + className}
        title="设置截止日期（可选）"
        onClick={() => {
          setOpen(true);
          setTimeout(() => {
            ref.current?.focus();
            try {
              ref.current?.showPicker();
            } catch {}
          });
        }}
      >
        ＋ 截止日期
      </button>
    );
  return (
    <span className="due-wrap">
      <input
        ref={ref}
        type="date"
        className={className + (late ? " late" : "")}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        onBlur={(e) => !e.target.value && setOpen(false)}
      />
      {value && (
        <button
          className="due-clear"
          title="不设截止日期"
          onClick={() => {
            onChange(undefined);
            setOpen(false);
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}

function SortTaskLine({ t }: { t: Task }) {
  return <TaskLine t={t} sort={useSortRow(t.id)} />;
}

function TaskLine({ t, sort }: { t: Task; sort?: ReturnType<typeof useSortRow> }) {
  const projects = useStore((s) => s.projects);
  const td = today();
  const ps = periodState(t);
  return (
    <div ref={sort?.ref} {...sort?.props} className={"tp-line" + (t.done ? " done" : "") + (sort?.cls ?? "")}>
      {sort ? <Grip /> : <span className="grip-space" />}
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
      <select
        className={"tp-period" + (ps === "past" && !t.done ? " late" : "")}
        value={t.period ?? ""}
        title="周待办 / 月待办"
        onChange={(e) => patch("tasks", t.id, periodPatch(e.target.value as "" | "week" | "month"))}
      >
        <option value="">不定期</option>
        <option value="week">{t.period === "week" && ps !== "current" ? periodLabel(t) : "本周"}</option>
        <option value="month">{t.period === "month" && ps !== "current" ? periodLabel(t) : "本月"}</option>
      </select>
      <DueInput className="tp-date" value={t.due} late={!!t.due && t.due < td && !t.done} onChange={(v) => patch("tasks", t.id, { due: v })} />
      <button className="icon-btn sm" title="删除" onClick={() => remove("tasks", t.id)}>
        ✕
      </button>
    </div>
  );
}

export default function TasksPage() {
  const tasks = useStore((s) => s.tasks);
  const [draft, setDraft] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [due, setDue] = useState<string>();
  const [view, setView] = useState<"list" | "week">("list");
  const t = today();

  const groups = useMemo(() => {
    const pending = tasks.filter((x) => !x.done).sort(sortTasks);
    return [
      ...GROUPS.map((g) => ({ name: g.name, sortable: true, items: pending.filter((x) => taskBucket(x, t) === g.b) })),
      { name: "已完成", sortable: false, items: tasks.filter((x) => x.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30) },
    ];
  }, [tasks, t]);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    upsert("tasks", {
      id: uid(),
      title,
      done: false,
      priority: 0,
      due: when === "today" ? today() : due,
      ...(when === "week" || when === "month" ? periodPatch(when) : {}),
      createdAt: Date.now(),
    });
    setDraft("");
  };

  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(new Date(), i)));

  return (
    <div className="tasks-page">
      <div className="tp-add">
        <input className="input big grow" placeholder="添加待办，回车保存" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <div className="seg" title="本周 / 本月：周待办、月待办，截止日期可不填；不定期：没有期限">
          {WHEN.map((x) => (
            <button key={x.v} className={when === x.v ? "on" : ""} onClick={() => setWhen(x.v)}>
              {x.label}
            </button>
          ))}
        </div>
        {when !== "today" && <DueInput className="input" value={due} onChange={setDue} />}
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
                {g.sortable ? (
                  <SortableList ids={g.items.map((x) => x.id)} onReorder={reorderTasks}>
                    {g.items.map((x) => (
                      <SortTaskLine key={x.id} t={x} />
                    ))}
                  </SortableList>
                ) : (
                  g.items.map((x) => <TaskLine key={x.id} t={x} />)
                )}
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
                  {x.period && <span className="muted small"> · {periodLabel(x)}</span>}
                </div>
              ))}
          </div>
          <div className="muted small wp-tip">把卡片拖到某一天即可安排日期</div>
        </div>
      )}
    </div>
  );
}
