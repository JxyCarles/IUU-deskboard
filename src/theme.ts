import type { Palette, Settings } from "./types";

// ---------- 颜色工具 ----------

export interface HSL {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

export function hexToHsl(hex: string): HSL {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${Math.round(h)}, ${Math.round(clamp(s, 0, 1) * 100)}%, ${Math.round(clamp(l, 0, 1) * 100)}%, ${a})`;

// ---------- 预设壁纸 ----------

export interface Preset {
  name: string;
  css: string;
  palette: Palette;
}

const pal = (luminance: number, ...hex: string[]): Palette => ({
  luminance,
  colors: hex.map((h, i) => ({ hex: h, weight: 1 / (i + 2) })),
});

export const PRESETS: Record<string, Preset> = {
  dusk: {
    name: "暮色",
    css: "radial-gradient(at 12% 18%, #6f5bd6 0, transparent 50%), radial-gradient(at 88% 12%, #e98aa6 0, transparent 45%), radial-gradient(at 70% 95%, #f4b183 0, transparent 50%), #3b3570",
    palette: pal(0.38, "#3b3570", "#6f5bd6", "#e98aa6", "#f4b183"),
  },
  forest: {
    name: "青森",
    css: "radial-gradient(at 18% 20%, #2f8f83 0, transparent 50%), radial-gradient(at 85% 80%, #9ad3a8 0, transparent 45%), radial-gradient(at 80% 10%, #3a6f8f 0, transparent 50%), #173a3a",
    palette: pal(0.3, "#173a3a", "#2f8f83", "#9ad3a8", "#3a6f8f"),
  },
  ocean: {
    name: "深海",
    css: "radial-gradient(at 20% 85%, #1fb6c9 0, transparent 45%), radial-gradient(at 80% 15%, #3d6fe0 0, transparent 50%), #0f2150",
    palette: pal(0.25, "#0f2150", "#3d6fe0", "#1fb6c9"),
  },
  mist: {
    name: "雾蓝",
    css: "radial-gradient(at 15% 15%, #dfe9f7 0, transparent 55%), radial-gradient(at 85% 85%, #c9d6ee 0, transparent 55%), radial-gradient(at 80% 10%, #f1e4ef 0, transparent 45%), #e7ecf5",
    palette: pal(0.9, "#e7ecf5", "#c9d6ee", "#7d93c4", "#c79bbd"),
  },
  sakura: {
    name: "樱花",
    css: "radial-gradient(at 10% 20%, #ffd9e1 0, transparent 55%), radial-gradient(at 90% 80%, #ffe9d2 0, transparent 50%), radial-gradient(at 80% 10%, #e8dcff 0, transparent 45%), #fbeef0",
    palette: pal(0.92, "#fbeef0", "#ffd9e1", "#e46a8a", "#b89be8"),
  },
  graphite: {
    name: "石墨",
    css: "radial-gradient(at 30% 20%, #3b3d46 0, transparent 60%), radial-gradient(at 80% 90%, #24262c 0, transparent 60%), #17181c",
    palette: pal(0.12, "#17181c", "#3b3d46", "#8a8fa3", "#6c8cff"),
  },
};

// ---------- 主题生成 ----------

export const MODULES = ["clock", "calendar", "agenda", "tasks", "notes", "project", "ai", "news", "github", "settings"] as const;
export type ModuleKey = (typeof MODULES)[number];

export function currentPalette(s: Settings): Palette {
  const bg = s.background;
  if (bg.palette && bg.palette.colors.length) return bg.palette;
  return (PRESETS[bg.preset ?? "dusk"] ?? PRESETS.dusk).palette;
}

export function isDark(s: Settings) {
  if (s.theme !== "auto") return s.theme === "dark";
  if (s.background.kind === "transparent" && !s.background.palette) return true;
  return currentPalette(s).luminance < 0.58;
}

/** 从壁纸配色里挑一个适合做强调色的：饱和度高、不太暗不太亮、占比不太小 */
export function pickAccent(p: Palette): HSL {
  let best: HSL | null = null;
  let score = -1;
  for (const c of p.colors) {
    const x = hexToHsl(c.hex);
    const sc = x.s * (1 - Math.abs(x.l - 0.55)) * (0.35 + Math.sqrt(c.weight));
    if (sc > score) {
      score = sc;
      best = x;
    }
  }
  if (!best || best.s < 0.12) return { h: 215, s: 0.7, l: 0.55 }; // 灰度壁纸时用蓝色
  return best;
}

/**
 * 给 9 个模块分配颜色。只用壁纸里本来就有的色相（不够 3 个时补强调色的邻近色），
 * 轮流分配并逐轮改变明度，保证图标颜色都“出自”这张壁纸。
 */
function moduleColors(p: Palette, acc: HSL, dark: boolean): string[] {
  const hues: number[] = [];
  const cands = p.colors
    .map((c) => ({ ...hexToHsl(c.hex), w: c.weight }))
    .filter((c) => c.s > 0.18 && c.l > 0.12 && c.l < 0.92)
    .sort((a, b) => b.w - a.w);
  const far = (h: number) => hues.every((x) => Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) > 18);
  if (far(acc.h)) hues.push(acc.h);
  for (const c of cands) if (far(c.h)) hues.push(c.h);
  for (const o of [24, -24, 44, -44]) {
    if (hues.length >= 3) break;
    const h = (acc.h + o + 360) % 360;
    if (far(h)) hues.push(h);
  }
  const s = clamp(acc.s, 0.42, 0.72);
  const lights = dark ? [0.64, 0.56, 0.72] : [0.5, 0.42, 0.58];
  return MODULES.map((_, i) => hsl(hues[i % hues.length], s, lights[Math.floor(i / hues.length) % lights.length]));
}

export function buildTheme(s: Settings): Record<string, string> {
  const p = currentPalette(s);
  const dark = isDark(s);
  const base = hexToHsl(p.colors[0]?.hex ?? "#3b3570");
  const acc = s.accent ? hexToHsl(s.accent) : pickAccent(p);
  const bh = base.s < 0.08 ? acc.h : base.h; // 底色几乎无彩时，用强调色的色相做轻微染色
  const bs = base.s < 0.08 ? 0.12 : base.s;
  const accent = s.accent ?? hsl(acc.h, clamp(acc.s, 0.45, 0.85), dark ? 0.66 : 0.47);
  const glass = s.background.kind === "transparent" ? Math.max(s.glass, 0.6) : s.glass;

  const v: Record<string, string> = {
    "--accent": accent,
    "--blue": accent,
    "--accent-soft": s.accent ? `${s.accent}33` : hsl(acc.h, acc.s, dark ? 0.66 : 0.47, 0.18),
    "--widget-bg": dark ? hsl(bh, Math.min(bs, 0.32), 0.13, glass) : hsl(bh, Math.min(bs, 0.4), 0.975, glass),
    "--widget-border": dark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.55)",
    "--panel": dark ? hsl(bh, Math.min(bs, 0.25), 0.1) : hsl(bh, Math.min(bs, 0.3), 0.95),
    "--panel-2": dark ? hsl(bh, Math.min(bs, 0.22), 0.15) : hsl(bh, Math.min(bs, 0.35), 0.99),
    "--text": dark ? hsl(bh, 0.15, 0.95) : hsl(bh, 0.3, 0.13),
    "--text-2": dark ? hsl(bh, 0.12, 0.74) : hsl(bh, 0.14, 0.4),
    "--text-3": dark ? hsl(bh, 0.1, 0.54) : hsl(bh, 0.1, 0.6),
    "--line": dark ? "rgba(255,255,255,0.09)" : hsl(bh, 0.3, 0.3, 0.1),
    "--track": dark ? "rgba(255,255,255,0.12)" : hsl(bh, 0.25, 0.35, 0.12),
    "--hover": dark ? "rgba(255,255,255,0.07)" : hsl(bh, 0.25, 0.35, 0.07),
    "--shadow": dark ? "0 10px 30px rgba(0,0,0,0.35)" : `0 10px 30px ${hsl(bh, 0.4, 0.3, 0.14)}`,
    "--dock-bg": dark ? hsl(bh, Math.min(bs, 0.3), 0.12, 0.5) : hsl(bh, Math.min(bs, 0.35), 0.98, 0.55),
    "--on-wall": p.luminance < 0.62 || s.background.kind === "transparent" ? "#fff" : hsl(bh, 0.35, 0.15),
    "--on-wall-shadow": p.luminance < 0.62 || s.background.kind === "transparent" ? "0 1px 8px rgba(0,0,0,0.35)" : "none",
    "--yellow-d": dark ? "#ffd60a" : "#d49a00",
  };

  const colors = moduleColors(p, acc, dark);
  MODULES.forEach((m, i) => {
    v[`--c-${m}`] = s.iconStyle === "mono" ? accent : colors[i];
  });
  return v;
}

export function wallpaperCss(s: Settings) {
  return (PRESETS[s.background.preset ?? "dusk"] ?? PRESETS.dusk).css;
}

// ---------- 浏览器端配色提取（用于视频截帧） ----------

export function paletteFromPixels(data: Uint8ClampedArray): Palette {
  const px: number[][] = [];
  for (let i = 0; i < data.length; i += 4) px.push([data[i], data[i + 1], data[i + 2]]);
  const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const luminance = px.reduce((a, c) => a + lum(c), 0) / px.length;
  px.sort((a, b) => lum(a) - lum(b));
  const k = 8;
  let centers = Array.from({ length: k }, (_, i) => [...px[Math.floor(((i * 2 + 1) * px.length) / (k * 2))]]);
  const assign = new Array(px.length).fill(0);
  const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let it = 0; it < 10; it++) {
    px.forEach((p, i) => {
      let bi = 0;
      for (let c = 1; c < k; c++) if (d2(p, centers[c]) < d2(p, centers[bi])) bi = c;
      assign[i] = bi;
    });
    const sum = centers.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      const s = sum[assign[i]];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    });
    centers = centers.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
  }
  const cnt = new Array(k).fill(0);
  assign.forEach((a) => cnt[a]++);
  const hex = (c: number[]) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
  return {
    luminance,
    colors: centers
      .map((c, i) => ({ hex: hex(c), weight: cnt[i] / px.length }))
      .filter((c) => c.weight > 0)
      .sort((a, b) => b.weight - a.weight),
  };
}
