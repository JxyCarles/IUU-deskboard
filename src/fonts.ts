import { isTauri } from "./api";
import type { Settings } from "./types";

export interface FontScheme {
  id: string;
  name: string;
  desc: string;
  /** 正文字体栈：西文字体在前，中文回落到后面的字体 */
  ui: string;
  /** 数字、时钟、大标题用的字体栈 */
  display: string;
  load?: () => Promise<unknown>;
}

const YAHEI = `"Microsoft YaHei UI", "PingFang SC", sans-serif`;

// 字体文件都随程序打包在本地，按需加载，不联网
export const FONTS: FontScheme[] = [
  {
    id: "rounded",
    name: "圆润",
    desc: "Quicksand 圆体数字 + 微软雅黑，柔和清爽",
    ui: `"Quicksand", ${YAHEI}`,
    display: `"Quicksand", ${YAHEI}`,
    load: () => Promise.all([import("@fontsource/quicksand/500.css"), import("@fontsource/quicksand/600.css"), import("@fontsource/quicksand/700.css")]),
  },
  {
    id: "wenkai",
    name: "文艺",
    desc: "霞鹜文楷，温和的手写感",
    ui: `"LXGW WenKai Screen", ${YAHEI}`,
    display: `"Lora", "LXGW WenKai Screen", serif`,
    load: () => Promise.all([import("lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css"), import("@fontsource/lora/500.css")]),
  },
  {
    id: "kuaile",
    name: "活泼",
    desc: "站酷快乐体 + Nunito，轻松可爱",
    ui: `"Nunito", "ZCOOL KuaiLe", ${YAHEI}`,
    display: `"Nunito", "ZCOOL KuaiLe", sans-serif`,
    load: () =>
      Promise.all([import("@fontsource/zcool-kuaile/index.css"), import("@fontsource/nunito/500.css"), import("@fontsource/nunito/700.css")]),
  },
  {
    id: "xiaowei",
    name: "雅致",
    desc: "站酷小薇 + Lora，有书卷气的衬线",
    ui: `"Lora", "ZCOOL XiaoWei", serif`,
    display: `"Lora", "ZCOOL XiaoWei", serif`,
    load: () => Promise.all([import("@fontsource/zcool-xiaowei/index.css"), import("@fontsource/lora/500.css"), import("@fontsource/lora/600.css")]),
  },
  {
    id: "modern",
    name: "现代",
    desc: "Outfit 几何无衬线 + 微软雅黑，干净利落",
    ui: `"Outfit", ${YAHEI}`,
    display: `"Outfit", ${YAHEI}`,
    load: () => Promise.all([import("@fontsource/outfit/300.css"), import("@fontsource/outfit/500.css"), import("@fontsource/outfit/600.css")]),
  },
  {
    id: "system",
    name: "默认",
    desc: "微软雅黑，端正清晰",
    ui: `"Segoe UI", ${YAHEI}`,
    display: `"Segoe UI", ${YAHEI}`,
  },
];

export const CUSTOM_FAMILY = "DeskCustomFont";

async function assetUrl(file: string) {
  if (!isTauri) return file;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(file);
}

async function ensureCustomFace(file: string) {
  let el = document.getElementById("custom-font-face") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "custom-font-face";
    document.head.appendChild(el);
  }
  const url = await assetUrl(file);
  el.textContent = `@font-face { font-family: "${CUSTOM_FAMILY}"; src: url("${url}"); font-display: swap; }`;
}

export function schemeOf(s: Settings): FontScheme {
  if (s.font === "custom" && s.customFont) {
    const stack = `"${CUSTOM_FAMILY}", ${YAHEI}`;
    return { id: "custom", name: s.customFont.name, desc: "导入的字体", ui: stack, display: stack };
  }
  return FONTS.find((f) => f.id === s.font) ?? FONTS[0];
}

export async function applyFont(s: Settings) {
  const f = schemeOf(s);
  if (f.id === "custom" && s.customFont) await ensureCustomFace(s.customFont.file);
  await f.load?.().catch((e) => console.error("字体加载失败", e));
  const root = document.documentElement.style;
  root.setProperty("--font-ui", f.ui);
  root.setProperty("--font-display", f.display);
}

/** 设置页预览用：一次性加载全部预设字体 */
export function loadAllFonts() {
  return Promise.all(FONTS.map((f) => f.load?.()));
}
