//! 小组件网格布局：每个组件有 (x, y) 格坐标，允许留空位。
//! 拖动或缩放时，被操作的组件固定在目标位置，其它组件如果被挡住就往下挪。

import type { WidgetInst, WidgetSize } from "./types";

export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 宽 × 高（单位：格） */
export const SIZE_SPAN: Record<WidgetSize, [number, number]> = { s: [1, 1], m: [2, 1], l: [2, 2], xl: [4, 2] };

export function spanOf(size: WidgetSize, cols: number): [number, number] {
  const [w, h] = SIZE_SPAN[size];
  return [Math.min(w, cols), h];
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function findFree(placed: Rect[], w: number, h: number, cols: number): { x: number; y: number } {
  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const r = { id: "", x, y, w, h };
      if (!placed.some((p) => overlap(p, r))) return { x, y };
    }
  }
}

/**
 * 计算最终布局。fixed 表示正在拖动/缩放的组件，它占据指定位置不动。
 * 其余有坐标的组件按 (y, x) 顺序放回原位，被挡住就往下移；没有坐标的组件找第一个空位。
 */
export function resolve(widgets: WidgetInst[], cols: number, fixed?: Rect): Rect[] {
  const placed: Rect[] = fixed ? [fixed] : [];
  const rest = widgets.filter((w) => w.id !== fixed?.id);
  const withPos = rest
    .filter((w) => w.x !== undefined && w.y !== undefined)
    .sort((a, b) => a.y! - b.y! || a.x! - b.x!);
  for (const wg of withPos) {
    const [w, h] = spanOf(wg.size, cols);
    const r: Rect = { id: wg.id, x: Math.max(0, Math.min(wg.x!, cols - w)), y: Math.max(0, wg.y!), w, h };
    while (placed.some((p) => overlap(p, r))) r.y++;
    placed.push(r);
  }
  for (const wg of rest.filter((w) => w.x === undefined || w.y === undefined)) {
    const [w, h] = spanOf(wg.size, cols);
    placed.push({ id: wg.id, w, h, ...findFree(placed, w, h, cols) });
  }
  return placed;
}

/** 新增组件时找第一个空位 */
export function freeSpot(widgets: WidgetInst[], size: WidgetSize, cols: number) {
  const [w, h] = spanOf(size, cols);
  return findFree(resolve(widgets, cols), w, h, cols);
}

/** 把拖出来的宽高吸附到该组件支持的最接近的尺寸 */
export function snapSize(w: number, h: number, allowed: WidgetSize[], cols: number): WidgetSize {
  let best = allowed[0];
  let bestD = Infinity;
  for (const s of allowed) {
    const [sw, sh] = spanOf(s, cols);
    const d = (sw - w) ** 2 + (sh - h) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** 当前网格列数（Board 渲染时更新，新增组件时用来找空位） */
export const gridState = { cols: 4 };
