import { useEffect, useState } from "react";
import { isTauri, notify } from "../api";
import { getState } from "../store";
import { toMin, today } from "../utils";
import { refreshDaily } from "./daily";
import { refreshAllFeeds } from "./feeds";
import { refreshDueCustom } from "./customWidgets";
import { refreshAllTrending } from "./github";
import { refreshAllProviders } from "./providers";

const notified = new Set<string>();

function checkReminders() {
  const now = new Date();
  const t = today();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const e of getState().events) {
    if (e.date !== t || !e.start || e.remind === undefined) continue;
    const key = `${e.id}@${e.date}@${e.start}`;
    if (notified.has(key)) continue;
    const at = toMin(e.start) - e.remind;
    // 只在提醒时间点之后 10 分钟内触发，避免启动时把早已过去的提醒全弹一遍
    if (nowMin >= at && nowMin <= at + 10) {
      notified.add(key);
      notify(e.title, e.remind === 0 ? `现在开始（${e.start}）` : `${e.remind} 分钟后开始（${e.start}）`);
    }
  }
}

export function startScheduler() {
  let lastAi = 0;
  let lastFeed = 0;
  const tick = () => {
    const s = getState().settings;
    const now = Date.now();
    if (isTauri && now - lastAi >= s.aiRefreshMin * 60_000) {
      lastAi = now;
      refreshAllProviders();
    }
    if (isTauri && now - lastFeed >= s.feedRefreshMin * 60_000) {
      lastFeed = now;
      refreshAllFeeds();
      refreshDaily();
      refreshAllTrending();
    }
    refreshDueCustom();
    checkReminders();
  };
  tick();
  const timer = window.setInterval(tick, 20_000);
  return () => window.clearInterval(timer);
}

/** 每隔 ms 毫秒重新渲染一次，拿到当前时间 */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
