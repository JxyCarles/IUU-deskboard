import DOMPurify from "dompurify";
import { HolidayUtil, Solar } from "lunar-javascript";
import { marked } from "marked";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => ymd(new Date());

export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** 所在周的周一，作为"本周"的键 */
export const weekKey = (d = new Date()) => ymd(addDays(d, -((d.getDay() + 6) % 7)));

/** "YYYY-MM"，作为"本月"的键 */
export const monthKey = (d = new Date()) => ymd(d).slice(0, 7);

export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "HH:mm" → 当天的分钟数 */
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export interface Holiday {
  name: string; // 中秋节、国庆节
  work: boolean; // true = 调休上班
  festivalDay: boolean; // 是节日当天（而不是假期里的其他日子）
  index: number; // 假期第几天（从 1 开始）
  total: number; // 这段假期共几天
}

export interface DayInfo {
  lunar: string; // 初五 / 八月
  lunarFull: string; // 八月初五
  festival?: string; // 节日或节气
  holiday?: Holiday;
}

const dayInfoCache = new Map<string, DayInfo>();

export function dayInfo(d: Date): DayInfo {
  const key = ymd(d);
  const hit = dayInfoCache.get(key);
  if (hit) return hit;
  const solar = Solar.fromDate(d);
  const lunar = solar.getLunar();
  const day = lunar.getDayInChinese();
  const month = lunar.getMonthInChinese() + "月";
  const festival = [...lunar.getFestivals(), ...solar.getFestivals(), lunar.getJieQi()].filter(Boolean)[0];
  const h = HolidayUtil.getHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate());
  let holiday: Holiday | undefined;
  if (h) {
    const work = h.isWork();
    const target = h.getTarget();
    // 同一段假期：都是休息日且对应同一个节日
    const sameRun = (x: Date) => {
      const o = HolidayUtil.getHoliday(x.getFullYear(), x.getMonth() + 1, x.getDate());
      return !!o && !o.isWork() && o.getTarget() === target;
    };
    let index = 1;
    let total = 1;
    if (!work) {
      for (let x = addDays(d, -1); sameRun(x); x = addDays(x, -1)) index++;
      total = index;
      for (let x = addDays(d, 1); sameRun(x); x = addDays(x, 1)) total++;
    }
    holiday = { name: h.getName(), work, festivalDay: !work && target === key, index, total };
  }
  const info: DayInfo = {
    lunar: day === "初一" ? month : day,
    lunarFull: month + day,
    festival,
    holiday,
  };
  dayInfoCache.set(key, info);
  return info;
}

/**
 * 节假日文字：节日当天写节日名；假期里的其他日子写“中秋假期 · 第 2 天 / 共 3 天”，
 * 让人一眼看出是同一段连续假期，但不是节日本身。
 * len：s 用在月历格子（“中秋假”），m 用在小组件（“中秋假期 2/3”），l 是完整说明。
 */
export function holidayText(h: Holiday | undefined, len: "s" | "m" | "l" = "l"): string | undefined {
  if (!h) return undefined;
  if (h.work) return len === "s" ? "班" : "调休上班";
  if (h.festivalDay) return h.name;
  const base = h.name.replace(/节$/, "");
  if (len === "s") return `${base}假`;
  if (len === "m") return `${base}假期 ${h.index}/${h.total}`;
  return `${base}假期 · 第 ${h.index} 天 / 共 ${h.total} 天`;
}

/** 对应的样式：fest 节日当天、rest 假期其他日子、work 调休上班 */
export function holidayKind(h: Holiday | undefined): "fest" | "rest" | "work" | undefined {
  if (!h) return undefined;
  return h.work ? "work" : h.festivalDay ? "fest" : "rest";
}

export function relTime(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

export function fmtTokens(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export function fmtDateLabel(s: string) {
  const d = parseYmd(s);
  const t = today();
  if (s === t) return "今天";
  if (s === ymd(addDays(new Date(), 1))) return "明天";
  if (s === ymd(addDays(new Date(), -1))) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
}

export function md(src: string) {
  return DOMPurify.sanitize(marked.parse(src, { async: false, breaks: true }) as string);
}

/** 去掉 Markdown 标记，用于小组件里的纯文本摘要 */
export function plain(src: string) {
  return src
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`~\-\[\]()!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#30B0C7", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55", "#8E8E93"];

export const EMOJIS = ["🚀", "📦", "🧠", "🛠️", "📊", "🎯", "💡", "📝", "🌐", "🎨", "📱", "🔬", "🏗️", "📚", "⚙️", "🔥"];
