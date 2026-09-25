import { call, isTauri } from "./api";
import type { Palette } from "./types";

export interface SceneLayer {
  id: number;
  name: string;
  file: string;
  w: number;
  h: number;
  m: [number, number, number, number, number, number];
  alpha: number;
  blend: "normal" | "additive";
  fx: string[];
}

export interface SceneProp {
  key: string;
  label: string;
  kind: "combo" | "bool";
  value: string | boolean | null;
  options: { label: string; value: string }[];
}

export interface SceneDesc {
  title: string;
  width: number;
  height: number;
  clear: string;
  layers: SceneLayer[];
  props: SceneProp[];
  palette?: Palette;
}

const cache = new Map<string, Promise<SceneDesc>>();

/** 读取 Wallpaper Engine 场景（后端会把贴图解码并缓存，第二次起很快） */
export function loadScene(dir: string, props: Record<string, unknown> = {}): Promise<SceneDesc> {
  const key = dir + JSON.stringify(props);
  let p = cache.get(key);
  if (!p) {
    p = call<SceneDesc>("we_scene", { dir, props });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

let toUrl: ((f: string) => string) | null = null;
export async function assetUrl(file: string) {
  if (!isTauri) return file;
  if (!toUrl) toUrl = (await import("@tauri-apps/api/core")).convertFileSrc;
  return toUrl(file);
}

/** 根据图层原本挂的 Wallpaper Engine 特效，挑一个近似的 CSS 动效 */
export function motionOf(l: SceneLayer): string {
  const has = (n: string) => l.fx.includes(n);
  const waves = l.fx.filter((f) => f === "waterwaves").length;
  const small = l.w * l.h < 260_000;
  if (small && (has("waterripple") || has("foliagesway"))) return "we-float";
  if (has("foliagesway") || has("swing") || has("shake")) return "we-sway";
  if (waves >= 3) return "we-wave";
  if (has("waterflow") || has("cloudmotion")) return "we-flow";
  if (waves > 0) return "we-breathe";
  return "";
}
