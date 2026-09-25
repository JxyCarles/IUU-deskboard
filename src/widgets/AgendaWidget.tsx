import { useMemo } from "react";
import { useNow } from "../services/scheduler";
import { patch, useStore } from "../store";
import type { CalEvent, Task } from "../types";
import { addDays, dayInfo, toMin, WEEK, ymd } from "../utils";
import { Empty, stop, WHead, type WidgetProps } from "./common";

function sortEvents(a: CalEvent, b: CalEvent) {
  return (a.start ?? "").localeCompare(b.start ?? "");
}

function countdown(min: number) {
  if (min < 60) return `${min} 分钟后`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分后` : `${h} 小时后`;
}

function TaskCheck({ t }: { t: Task }) {
  return (
    <label className="chk-line" onClick={stop}>
      <input
        type="checkbox"
        checked={t.done}
        onChange={() => patch("tasks", t.id, { done: !t.done, doneAt: t.done ? undefined : Date.now() })}
      />
      <span className={t.done ? "done" : ""}>{t.title}</span>
    </label>
  );
}

function DaySection({ date, events, tasks, now, max }: { date: string; events: CalEvent[]; tasks: Task[]; now: Date; max: number }) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = date === ymd(now);
  const evs = events.filter((e) => e.date === date).sort(sortEvents);
  const tks = tasks.filter((t) => t.due === date);
  return (
    <div className="ag-day">
      {evs.length === 0 && tks.length === 0 && <div className="muted small">没有安排</div>}
      {evs.slice(0, max).map((e) => {
        const past = isToday && e.start && toMin(e.end || e.start) < nowMin;
        const live = isToday && e.start && e.end && toMin(e.start) <= nowMin && toMin(e.end) >= nowMin;
        return (
          <div key={e.id} className={"ag-ev" + (past ? " past" : "") + (live ? " live" : "")}>
            <span className="ag-time">{e.start ?? "全天"}</span>
            <span className="ev-bar" style={{ background: e.color }} />
            <span className="ag-title">{e.title}</span>
          </div>
        );
      })}
      {tks.slice(0, Math.max(0, max - evs.length)).map((t) => (
        <TaskCheck key={t.id} t={t} />
      ))}
    </div>
  );
}

export default function AgendaWidget({ w }: WidgetProps) {
  const now = useNow(30_000);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const t = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayEvents = useMemo(() => events.filter((e) => e.date === t).sort(sortEvents), [events, t]);

  if (w.size === "s") {
    const live = todayEvents.find((e) => e.start && e.end && toMin(e.start) <= nowMin && toMin(e.end) >= nowMin);
    const next = todayEvents.find((e) => e.start && toMin(e.start) > nowMin);
    const e = live ?? next;
    const left = todayEvents.filter((x) => !x.start || toMin(x.end || x.start) >= nowMin).length;
    return (
      <div className="ag-s">
        <WHead icon="agenda" title="日程" color="var(--c-agenda)" />
        {e ? (
          <>
            <div className="ag-s-when" style={{ color: e.color }}>
              {live === e ? "进行中" : countdown(toMin(e.start!) - nowMin)}
            </div>
            <div className="ag-s-title">{e.title}</div>
            <div className="muted small">
              {e.start}
              {e.end && ` - ${e.end}`}
            </div>
          </>
        ) : (
          <Empty>今天没有待开始的日程</Empty>
        )}
        <div className="muted small ag-s-foot">今日剩余 {left} 项</div>
      </div>
    );
  }

  if (w.size === "xl") {
    // 周计划：未来 7 天每天一列
    const days = Array.from({ length: 7 }, (_, i) => addDays(now, i));
    return (
      <div className="ag-week">
        {days.map((d) => {
          const k = ymd(d);
          const info = dayInfo(d);
          return (
            <div key={k} className={"ag-week-col" + (k === t ? " today" : "")}>
              <div className="ag-week-h">
                <span>周{WEEK[d.getDay()]}</span>
                <b>{d.getDate()}</b>
                <small>{info.holiday && !info.holiday.work ? info.holiday.name : info.lunar}</small>
              </div>
              <DaySection date={k} events={events} tasks={tasks} now={now} max={6} />
            </div>
          );
        })}
      </div>
    );
  }

  const tomorrow = ymd(addDays(now, 1));
  return (
    <div className="ag-list">
      <WHead icon="agenda" title="今日日程" color="var(--c-agenda)" right={`${now.getMonth() + 1}/${now.getDate()} 周${WEEK[now.getDay()]}`} />
      <DaySection date={t} events={events} tasks={tasks} now={now} max={w.size === "m" ? 4 : 7} />
      {w.size === "l" && (
        <>
          <div className="ag-sub">明天</div>
          <DaySection date={tomorrow} events={events} tasks={tasks} now={now} max={4} />
        </>
      )}
    </div>
  );
}
