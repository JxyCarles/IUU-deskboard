import { call, isTauri } from "./api";
import { getState, setSettings } from "./store";
import type { Background } from "./types";
import { uid } from "./utils";

/**
 * 首次启动时自动加入壁纸库的 Wallpaper Engine 壁纸（只加进选项，不会自动切换）。
 * 以后新的壁纸在「设置 → 壁纸 → 导入 Wallpaper Engine 壁纸」里手动添加即可。
 */
// 个人默认壁纸写在不提交的 .env.local 里：VITE_DEFAULT_WALLPAPERS=路径1|路径2（发布版为空）
const DEFAULT_WALLPAPERS: string[] = (import.meta.env.VITE_DEFAULT_WALLPAPERS ?? "").split("|").map((s: string) => s.trim()).filter(Boolean);

export interface Imported {
  kind: Background["kind"];
  file?: string;
  palette?: Background["palette"];
  title?: string;
  note?: string;
  dir?: string;
  thumb?: string;
}

/** 导入并加入壁纸库；同一个 Wallpaper Engine 文件夹不会重复加入 */
export async function importToLibrary(path: string): Promise<{ entry: Background; note?: string }> {
  const r = await call<Imported>("import_wallpaper", { path });
  const entry: Background = { id: uid(), kind: r.kind, file: r.file, dir: r.dir, title: r.title, thumb: r.thumb, palette: r.palette };
  const lib = getState().settings.library;
  const same = r.dir ? lib.find((x) => x.dir === r.dir) : undefined;
  if (same) return { entry: same, note: r.note };
  setSettings({ library: [...lib, entry] });
  return { entry, note: r.note };
}

export function applyWallpaper(bg: Background) {
  setSettings({ background: bg, accent: undefined, ...(bg.kind === "transparent" ? { desktopMode: true } : {}) });
}

/** 修改当前壁纸（比如切换场景主题），同步到壁纸库里对应的条目 */
export function updateBackground(p: Partial<Background>) {
  const s = getState().settings;
  const bg = { ...s.background, ...p };
  setSettings({ background: bg, library: s.library.map((x) => (x.id && x.id === bg.id ? { ...x, ...p } : x)) });
}

export function removeFromLibrary(id: string) {
  const s = getState().settings;
  const e = s.library.find((x) => x.id === id);
  if (!e) return;
  const files = [e.file, e.thumb].filter(Boolean) as string[];
  if (files.length && isTauri) call("remove_wallpaper_files", { files }).catch(() => {});
  setSettings({
    library: s.library.filter((x) => x.id !== id),
    ...(s.background.id === id ? { background: { kind: "preset", preset: "dusk" } as Background } : {}),
  });
}

export async function seedLibrary() {
  if (!isTauri) return;
  const done = new Set(getState().settings.seeded ?? []);
  for (const path of DEFAULT_WALLPAPERS) {
    if (done.has(path)) continue;
    try {
      await importToLibrary(path);
    } catch (e) {
      console.warn("默认壁纸导入失败", path, e);
    }
    // 无论成功与否都只尝试一次，删掉后不会再自动加回来
    setSettings({ seeded: [...(getState().settings.seeded ?? []), path] });
  }
}
