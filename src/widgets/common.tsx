import { createContext, useContext, type ReactNode } from "react";
import { Icon, type IconName } from "../icons";
import type { PageKey, WidgetInst } from "../types";

const ICON_NAMES = new Set<string>(["clock", "calendar", "agenda", "tasks", "notes", "project", "ai", "news", "github", "settings", "image", "grid", "studio"]);

export interface WidgetProps {
  w: WidgetInst;
}

export interface Nav {
  open: (page: PageKey, arg?: string) => void;
}

export const NavContext = createContext<Nav>({ open: () => {} });
export const useNav = () => useContext(NavContext);

/** 阻止点击冒泡到小组件（否则会打开完整页面） */
export const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function WHead({ icon, title, color, right }: { icon: IconName | string; title: string; color: string; right?: ReactNode }) {
  const isSvg = ICON_NAMES.has(icon);
  return (
    <div className="w-head">
      <span className={"w-head-icon" + (isSvg ? " svg" : "")} style={{ background: color }}>
        {isSvg ? <Icon name={icon as IconName} size={13} stroke={2.2} /> : icon}
      </span>
      <span className="w-head-title" style={{ color }}>
        {title}
      </span>
      {right !== undefined && <span className="w-head-right">{right}</span>}
    </div>
  );
}

export function Ring({
  percent,
  size = 56,
  stroke = 6,
  color = "var(--blue)",
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div className="ring-inner">{children}</div>}
    </div>
  );
}

export function Bar({ percent, color = "var(--blue)" }: { percent: number; color?: string }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="w-empty">{children}</div>;
}

/** 已用比例 → 颜色：低绿、中橙、高红 */
export const levelColor = (p: number) => (p >= 85 ? "var(--red)" : p >= 60 ? "var(--orange)" : "var(--green)");
