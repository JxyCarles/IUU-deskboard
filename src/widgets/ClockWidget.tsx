import { useNow } from "../services/scheduler";
import { dayInfo, holidayKind, holidayText, pad, WEEK } from "../utils";
import { Bar, type WidgetProps } from "./common";

export default function ClockWidget({ w }: WidgetProps) {
  const now = useNow(1000);
  const info = dayInfo(now);
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const date = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}`;
  // 法定假日优先（区分节日当天 / 假期中 / 调休），否则显示农历节日或节气
  const tag = holidayText(info.holiday, w.size === "s" ? "m" : "l") ?? info.festival;
  const tagKind = holidayKind(info.holiday);

  if (w.size === "s") {
    return (
      <div className="clock-s">
        <div className="clock-date">{date}</div>
        <div className="clock-time">
          {time}
          <span className="clock-sec">{pad(now.getSeconds())}</span>
        </div>
        <div className="clock-lunar">
          农历{info.lunarFull}
          {tag && <span className={"tag" + (tagKind ? " hol-" + tagKind : "")}>{tag}</span>}
        </div>
      </div>
    );
  }

  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const yearPct = ((now.getTime() - start) / (end - start)) * 100;
  const dayPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

  return (
    <div className="clock-m">
      <div className="clock-m-left">
        <div className="clock-time big">
          {time}
          <span className="clock-sec">{pad(now.getSeconds())}</span>
        </div>
        <div className="clock-date">{date}</div>
        <div className="clock-lunar">
          农历{info.lunarFull}
          {tag && <span className={"tag" + (tagKind ? " hol-" + tagKind : "")}>{tag}</span>}
        </div>
      </div>
      <div className="clock-m-right">
        <div className="mini-stat">
          <span>今天已过</span>
          <b>{dayPct.toFixed(0)}%</b>
        </div>
        <Bar percent={dayPct} color="var(--c-clock)" />
        <div className="mini-stat">
          <span>{now.getFullYear()} 年已过</span>
          <b>{yearPct.toFixed(1)}%</b>
        </div>
        <Bar percent={yearPct} color="var(--accent)" />
      </div>
    </div>
  );
}
