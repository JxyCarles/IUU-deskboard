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

export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "HH:mm" → 当天的分钟数 */
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export interface DayInfo {
  lunar: string; // 初五 / 八月
  lunarFull: string; // 八月初五
  festival?: string; // 节日或节气
  holiday?: { name: string; work: boolean }; // 法定假日 / 调休上班
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
  const info: DayInfo = {
    lunar: day === "初一" ? month : day,
    lunarFull: month + day,
    festival,
    holiday: h ? { name: h.getName(), work: h.isWork() } : undefined,
  };
  dayInfoCache.set(key, info);
  return info;
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
