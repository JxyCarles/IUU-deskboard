import { call } from "../api";
import { getState, setCache } from "../store";
import type { DailyIssue, DailyItem, FeedItem } from "../types";

/** 橘鸦 AI 早报（https://daily.juya.uk），每天早上一期 */
export const DAILY_URL = "https://daily.juya.uk/rss.xml";
export const DAILY_SITE = "https://daily.juya.uk/";

// 每条的正文（含配图）只放在内存里，不写进 data.json；重启后第一次刷新会补上
const bodies = new Map<string, string>();
export const bodyOf = (date: string, n: number) => bodies.get(`${date}#${n}`);

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** 把一期早报的 HTML 拆成「分类 → 条目」 */
function parseIssue(raw: FeedItem, html: string): DailyIssue {
  const date = raw.title.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? raw.title;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body.firstElementChild?.tagName === "DIV" ? doc.body.firstElementChild : doc.body;
  const issue: DailyIssue = { date, link: raw.link, published: raw.published, items: [] };

  issue.cover = root.querySelector("img")?.getAttribute("src") ?? undefined;
  for (const p of root.querySelectorAll("p")) {
    if (!text(p).startsWith("视频版")) continue;
    issue.videos = [...p.querySelectorAll("a")].map((a) => ({ name: text(a), url: a.getAttribute("href") ?? "" }));
    break;
  }

  let section = "";
  let cur: DailyItem | null = null;
  let body: string[] = [];
  const flush = () => {
    if (cur) bodies.set(`${date}#${cur.n}`, body.join(""));
    cur = null;
    body = [];
  };
  for (const el of root.children) {
    const tag = el.tagName;
    if (tag === "H2") {
      flush();
      section = text(el);
    } else if (tag === "H3" && section !== "概览") {
      flush();
      const code = el.querySelector("code");
      const n = Number(text(code).replace("#", "")) || issue.items.length + 1;
      code?.remove();
      cur = { n, section, title: text(el), link: el.querySelector("a")?.getAttribute("href") ?? undefined };
      issue.items.push(cur);
    } else if (tag === "HR") {
      flush();
    } else if (cur) {
      if (tag === "BLOCKQUOTE" && !cur.summary) cur.summary = text(el);
      else body.push(el.outerHTML);
    }
  }
  flush();

  // 版式变了、拆不出详情时，退回用概览里的标题
  if (!issue.items.length) {
    for (const li of root.querySelectorAll("li")) {
      const t = text(li).replace(/#\d+$/, "").trim();
      if (t) issue.items.push({ n: issue.items.length + 1, section: "要闻", title: t, link: li.querySelector("a")?.getAttribute("href") ?? undefined });
    }
  }
  return issue;
}

export async function refreshDaily() {
  const prev = getState().cache.daily;
  try {
    const raw = await call<FeedItem[]>("fetch_feed", { url: DAILY_URL });
    const issues = raw.map((it) => parseIssue(it, it.content ?? ""));
    setCache({ daily: { ts: Date.now(), issues } });
  } catch (e) {
    setCache({ daily: { ts: Date.now(), issues: prev?.issues ?? [], error: e instanceof Error ? e.message : String(e) } });
  }
}

/** 按原文顺序分组（要闻、开发生态、产品应用……） */
export function groupBySection(items: DailyItem[]) {
  const out: { name: string; items: DailyItem[] }[] = [];
  for (const it of items) {
    const g = out.find((x) => x.name === it.section);
    if (g) g.items.push(it);
    else out.push({ name: it.section, items: [it] });
  }
  return out;
}

/** 2026-09-26 → 9月26日 周六 */
export function issueLabel(date: string) {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六"[d.getDay()]}`;
}
