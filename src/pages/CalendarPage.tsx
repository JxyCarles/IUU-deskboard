import { useState } from "react";
import { remove, upsert, useStore } from "../store";
import type { CalEvent } from "../types";
import { addDays, COLORS, dayInfo, fmtDateLabel, holidayKind, holidayText, parseYmd, today, uid, WEEK, ymd } from "../utils";
import { TaskRow } from "../widgets/TasksWidget";

const REMINDS = [
  { v: "", l: "不提醒" },
  { v: "0", l: "开始时" },
  { v: "5", l: "提前 5 分钟" },
  { v: "10", l: "提前 10 分钟" },
  { v: "15", l: "提前 15 分钟" },
  { v: "30", l: "提前 30 分钟" },
  { v: "60", l: "提前 1 小时" },
];

function EventForm({ ev, onDone }: { ev: CalEvent; onDone: () => void }) {
  const projects = useStore((s) => s.projects);
  const [e, setE] = useState<CalEvent>(ev);
  const allDay = !e.start;
  const set = (p: Partial<CalEvent>) => setE({ ...e, ...p });
  const save = () => {
    if (!e.title.trim()) return;
    upsert("events", { ...e, title: e.title.trim() });
    onDone();
  };
  return (
    <div className="form">
      <input className="input big" placeholder="日程标题" value={e.title} onChange={(x) => set({ title: x.target.value })} autoFocus onKeyDown={(x) => x.key === "Enter" && save()} />
      <div className="row">
        <input type="date" className="input" value={e.date} onChange={(x) => set({ date: x.target.value })} />
        <label className="chk">
          <input type="checkbox" checked={allDay} onChange={() => set(allDay ? { start: "09:00", end: "10:00" } : { start: undefined, end: undefined, remind: undefined })} />
          全天
        </label>
      </div>
      {!allDay && (
        <div className="row">
          <input type="time" className="input" value={e.start} onChange={(x) => set({ start: x.target.value })} />
          <span className="muted">至</span>
          <input type="time" className="input" value={e.end ?? ""} onChange={(x) => set({ end: x.target.value || undefined })} />
          <select className="input" value={e.remind ?? ""} onChange={(x) => set({ remind: x.target.value === "" ? undefined : Number(x.target.value) })}>
            {REMINDS.map((r) => (
              <option key={r.v} value={r.v}>
                {r.l}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} className={"swatch" + (c === e.color ? " on" : "")} style={{ background: c }} onClick={() => set({ color: c })} />
        ))}
      </div>
      <select className="input" value={e.projectId ?? ""} onChange={(x) => set({ projectId: x.target.value || undefined })}>
        <option value="">不关联项目</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.emoji} {p.name}
          </option>
        ))}
      </select>
      <textarea className="input" rows={3} placeholder="备注" value={e.notes ?? ""} onChange={(x) => set({ notes: x.target.value })} />
      <div className="row end">
        <button className="btn" onClick={onDone}>
          取消
        </button>
        <button className="btn primary" onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}

export default function CalendarPage({ arg }: { arg?: string }) {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const [sel, setSel] = useState(arg ?? today());
  const [month, setMonth] = useState(() => {
    const d = parseYmd(arg ?? today());
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [editing, setEditing] = useState<CalEvent | null>(null);

  const start = addDays(month, -month.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const t = today();
  const byDay = (k: string) => events.filter((e) => e.date === k).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  const selInfo = dayInfo(parseYmd(sel));

  const newEvent = () => setEditing({ id: uid(), title: "", date: sel, start: "09:00", end: "10:00", color: "#007AFF", remind: 10 });
  const goMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="split">
      <section className="split-main cal-page">
        <div className="cal-page-head">
          <h2>
            {month.getFullYear()}年{month.getMonth() + 1}月
          </h2>
          <div className="row">
            <button className="btn" onClick={() => goMonth(-1)}>
              ‹
            </button>
            <button
              className="btn"
              onClick={() => {
                setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                setSel(t);
              }}
            >
              今天
            </button>
            <button className="btn" onClick={() => goMonth(1)}>
              ›
            </button>
          </div>
        </div>
        <div className="bigcal">
          {WEEK.map((d) => (
            <div key={d} className="bigcal-h">
              周{d}
            </div>
          ))}
          {cells.map((d) => {
            const k = ymd(d);
            const info = dayInfo(d);
            const evs = byDay(k);
            const dueCount = tasks.filter((x) => x.due === k && !x.done).length;
            return (
              <div
                key={k}
                className={
                  "bigcal-c" +
                  (d.getMonth() !== month.getMonth() ? " out" : "") +
                  (k === t ? " today" : "") +
                  (k === sel ? " sel" : "") +
                  (info.holiday && !info.holiday.work ? " off" : "") +
                  (info.holiday?.festivalDay ? " fest-day" : "") +
                  (info.holiday && !info.holiday.work && (info.holiday.index === 1 || d.getDay() === 0) ? " band-start" : "") +
                  (info.holiday && !info.holiday.work && (info.holiday.index === info.holiday.total || d.getDay() === 6) ? " band-end" : "")
                }
                onClick={() => setSel(k)}
                onDoubleClick={() => {
                  setSel(k);
                  setEditing({ id: uid(), title: "", date: k, start: "09:00", end: "10:00", color: "#007AFF", remind: 10 });
                }}
              >
                <div className="bigcal-d">
                  <b>{d.getDate()}</b>
                  <small className={info.holiday ? "hol-text-" + holidayKind(info.holiday) : info.festival ? "fest" : ""}>
                    {holidayText(info.holiday, "s") ?? (info.festival || info.lunar)}
                  </small>
                </div>
                {evs.slice(0, 3).map((e) => (
                  <div key={e.id} className="bigcal-ev" style={{ borderColor: e.color }}>
                    {e.start && <span>{e.start}</span>} {e.title}
                  </div>
                ))}
                {evs.length > 3 && <div className="muted small">+{evs.length - 3}</div>}
                {dueCount > 0 && <div className="bigcal-task">✓ {dueCount} 项待办</div>}
              </div>
            );
          })}
        </div>
        <div className="muted small">双击日期快速新建日程</div>
      </section>
      <aside className="split-side right">
        <div className="day-head">
          <h3>{fmtDateLabel(sel)}</h3>
          <div className="muted small">
            农历{selInfo.lunarFull}
            {selInfo.festival && ` · ${selInfo.festival}`}
            {selInfo.holiday && ` · ${holidayText(selInfo.holiday)}`}
          </div>
        </div>
        {editing ? (
          <EventForm key={editing.id} ev={editing} onDone={() => setEditing(null)} />
        ) : (
          <>
            <button className="btn primary block" onClick={newEvent}>
              ＋ 新建日程
            </button>
            <div className="day-list">
              {byDay(sel).length === 0 && <div className="muted small">这天没有日程</div>}
              {byDay(sel).map((e) => (
                <div key={e.id} className="day-ev" onClick={() => setEditing(e)}>
                  <span className="ev-bar" style={{ background: e.color }} />
                  <div className="grow">
                    <div>{e.title}</div>
                    <div className="muted small">
                      {e.start ? `${e.start}${e.end ? " - " + e.end : ""}` : "全天"}
                      {e.remind !== undefined && " · 🔔"}
                      {e.projectId && ` · ${projects.find((p) => p.id === e.projectId)?.name ?? ""}`}
                    </div>
                    {e.notes && <div className="muted small">{e.notes}</div>}
                  </div>
                  <button
                    className="icon-btn sm"
                    title="删除"
                    onClick={(x) => {
                      x.stopPropagation();
                      remove("events", e.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <h4>当天到期的待办</h4>
            <div className="day-list">
              {tasks.filter((x) => x.due === sel).length === 0 && <div className="muted small">无</div>}
              {tasks
                .filter((x) => x.due === sel)
                .map((x) => (
                  <TaskRow key={x.id} t={x} showDue={false} />
                ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
