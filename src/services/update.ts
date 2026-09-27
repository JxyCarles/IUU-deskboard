import { useSyncExternalStore } from "react";
import { call, isTauri } from "../api";

/** 新版本提醒：查 GitHub 上最新发布的版本，比当前版本新就提示用户去下载 */
const REPO = "JxyCarles/IUU-deskboard";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const INTERVAL = 6 * 3600_000;

export type UpdateState = {
  current: string;
  latest?: string;
  url?: string;
  checking: boolean;
  checkedAt?: number;
  error?: string;
};

let state: UpdateState = { current: "", checking: false };
const subs = new Set<() => void>();
const set = (p: Partial<UpdateState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};

export const useUpdate = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
  );

export const hasUpdate = (s: UpdateState) => !!s.latest && !!s.current && newer(s.latest, s.current);

/** "v0.3.1" → [0, 3, 1]，忽略 -beta 之类的后缀 */
function parts(v: string) {
  return v.replace(/^v/i, "").split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
}
function newer(a: string, b: string) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

export async function checkUpdate() {
  if (!isTauri || state.checking) return;
  set({ checking: true, error: undefined });
  try {
    if (!state.current) {
      const { getVersion } = await import("@tauri-apps/api/app");
      set({ current: await getVersion() });
    }
    const r = await call<{ tag_name: string; html_url: string }>("fetch_json", { url: LATEST_API });
    set({ latest: r.tag_name.replace(/^v/i, ""), url: r.html_url || RELEASES_URL });
  } catch (e) {
    // 404 = 仓库里还没有正式发布的版本（草稿不算），视为已是最新
    if (!String(e).includes("HTTP 404")) set({ error: String(e) });
  } finally {
    set({ checking: false, checkedAt: Date.now() });
  }
}

/** 启动后稍等再查，之后每 6 小时查一次；返回清理函数 */
export function startUpdateCheck() {
  if (!isTauri) return () => {};
  const t = window.setTimeout(checkUpdate, 8000);
  const iv = window.setInterval(checkUpdate, INTERVAL);
  return () => {
    window.clearTimeout(t);
    window.clearInterval(iv);
  };
}
