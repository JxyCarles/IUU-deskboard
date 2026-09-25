import { useMemo } from "react";
import { useNow } from "../services/scheduler";
import { useStore } from "../store";
import type { CalEvent } from "../types";
import { addDays, dayInfo, fmtDateLabel, today, toMin, WEEK, ymd } from "../utils";
import { stop, useNav, type WidgetProps } from "./common";

/** 从现在起即将发生的日程（今天未结束的 + 之后几天的） */
export function upcoming(events: CalEvent[], now: Date, days = 7) {
  const t = ymd(now);
  const last = ymd(addDays(now, days));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return events
    .filter((e) => {
      if (e.date < t || e.date > last) return false;
      if (e.date === t && e.start) return toMin(e.end || e.start) >= nowMin;
      return true;
    })
    .sort((a, b) => (a.date + (a.start ?? "00:00")).localeCompare(b.date + (b.start ?? "00:00")));
}

function EventLine({ e }: { e: CalEvent }) {
  return (
    <div className="ev-line">
      <span className="ev-bar" style={{ background: e.color }} />
      <div className="ev-body">
        <div className="ev-title">{e.title}</div>
        <div className="ev-time">
          {e.date !== today() && fmtDateLabel(e.date) + " "}
          {e.start ? `${e.start}${e.end ? " - " + e.end : ""}` : "全天"}
        </div>
      </div>
    </div>
  );
}

function DayBlock({ now, compact }: { now: Date; compact?: boolean }) {
  const info = dayInfo(now);
  return (
    <div className={"cal-day" + (compact ? " compact" : "")}>
      <div className="cal-week">星期{WEEK[now.getDay()]}</div>
      <div className="cal-num">{now.getDate()}</div>
      <div className="cal-lunar">
        {info.lunarFull}
        {info.holiday && !info.holiday.work && <span className="tag red">{info.holiday.name}</span>}
        {info.holiday?.work && <span className="tag">调休上班</span>}
      </div>
    </div>
  );
}

function MonthGrid({ now, events }: { now: Date; events: CalEvent[] }) {
  const nav = useNav();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const has = new Set(events.map((e) => e.date));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = cells[35].getMonth() === now.getMonth() ? 6 : 5;
  const t = today();
  return (
    <div className="mgrid">
      {WEEK.map((d) => (
        <div key={d} className="mgrid-h">
          {d}
        </div>
      ))}
      {cells.slice(0, rows * 7).map((d) => {
        const k = ymd(d);
        const info = dayInfo(d);
        const cls = [
          "mgrid-c",
          d.getMonth() !== now.getMonth() && "out",
          k === t && "today",
          info.holiday && !info.holiday.work && "off",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={k}
            className={cls}
            onClick={(e) => {
              stop(e);
              nav.open("calendar", k);
            }}
          >
            <span>{d.getDate()}</span>
            {has.has(k) && <i className="dot" />}
          </div>
        );
      })}
    </div>
  );
}

export default function CalendarWidget({ w }: WidgetProps) {
  const now = useNow(60_000);
  const events = useStore((s) => s.events);
  const next = useMemo(() => upcoming(events, now), [events, now]);

  if (w.size === "s") {
    return (
      <div className="cal-s">
        <DayBlock now={now} />
        <div className="cal-next">{next[0] ? <EventLine e={next[0]} /> : <span className="muted">近期没有日程</span>}</div>
      </div>
    );
  }
  if (w.size === "m") {
    return (
      <div className="cal-m">
        <DayBlock now={now} />
        <div className="cal-m-list">
          {next.length === 0 && <span className="muted">未来 7 天没有日程</span>}
          {next.slice(0, 3).map((e) => (
            <EventLine key={e.id} e={e} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="cal-l">
      <div className="cal-l-head">
        <b>
          {now.getFullYear()}年{now.getMonth() + 1}月
        </b>
        <span className="muted">
          {dayInfo(now).lunarFull} · 周{WEEK[now.getDay()]}
        </span>
      </div>
      <MonthGrid now={now} events={events} />
      <div className="cal-l-list">
        {next.length === 0 && <span className="muted">未来 7 天没有日程</span>}
        {next.slice(0, w.size === "xl" ? 4 : 2).map((e) => (
          <EventLine key={e.id} e={e} />
        ))}
      </div>
    </div>
  );
}
