import { useEffect } from "react";
import { isTauri, openUrl } from "../api";
import { ICON_LIST, type IconName } from "../icons";
import { refreshCustom } from "../services/customWidgets";
import { useStore } from "../store";
import type { CustomItem, WidgetSize, WidgetSpec } from "../types";
import { relTime } from "../utils";
import { Empty, stop, WHead, type WidgetProps } from "./common";

export const specIcon = (s?: WidgetSpec): IconName => ((s?.icon && (ICON_LIST as string[]).includes(s.icon) ? s.icon : "grid") as IconName);
export const specColor = (s?: WidgetSpec) => s?.color || "var(--c-studio)";

/** 渲染一个自定义小组件（预览也用这个） */
export function CustomView({ spec, items, size, error, ts, onRefresh }: { spec: WidgetSpec; items: CustomItem[]; size: WidgetSize; error?: string; ts?: number; onRefresh?: () => void }) {
  const right = (
    <>
      {ts && <span className="muted small">{relTime(ts)}</span>}
      {onRefresh && (
        <button
          className="icon-btn sm"
          title="刷新"
          onClick={(e) => {
            stop(e);
            onRefresh();
          }}
        >
          ↻
        </button>
      )}
    </>
  );
  const head = <WHead icon={specIcon(spec)} title={spec.name} color={specColor(spec)} right={size === "s" ? undefined : right} />;
  if (!items.length) {
    return (
      <div className="cw">
        {head}
        <Empty>{error ?? (isTauri ? "加载中…" : "需要桌面客户端")}</Empty>
      </div>
    );
  }

  if (spec.display?.type === "stat") {
    const it = items[0];
    return (
      <div className={"cw cw-stat size-" + size} onClick={(e) => (it.link ? (stop(e), openUrl(it.link)) : undefined)}>
        {head}
        <div className="cw-stat-value">{it.title}</div>
        {it.label && <div className="cw-stat-label">{it.label}</div>}
        {it.subtitle && <div className="muted small">{it.subtitle}</div>}
      </div>
    );
  }

  // 带副标题的行更高，少放一条，避免最后一行被截掉一半
  const hasSub = items.some((i) => i.subtitle);
  const auto = hasSub ? { s: 3, m: 2, l: 6, xl: 12 }[size] : { s: 3, m: 3, l: 8, xl: 16 }[size];
  const max = Math.min(spec.display?.limit ?? auto, auto);
  return (
    <div className="cw">
      {head}
      <div className={"cw-list" + (size === "xl" ? " two-col" : "")}>
        {items.slice(0, max).map((it, i) => (
          <div
            key={i}
            className={"cw-row" + (it.link ? " link" : "")}
            onClick={(e) => {
              if (!it.link) return;
              stop(e);
              openUrl(it.link);
            }}
            title={it.title}
          >
            {spec.display?.rank && <span className="gh-rank">{i + 1}</span>}
            <div className="cw-body">
              <div className="cw-title">{it.title}</div>
              {it.subtitle && size !== "s" && <div className="cw-sub">{it.subtitle}</div>}
            </div>
            {it.value && <span className="cw-value">{it.value}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomWidget({ w }: WidgetProps) {
  const spec = useStore((s) => s.customWidgets.find((x) => x.id === w.config.specId));
  const data = useStore((s) => (w.config.specId ? s.cache.custom?.[w.config.specId] : undefined));

  useEffect(() => {
    if (spec && isTauri && !data) refreshCustom(spec);
  }, [spec?.id]);

  if (!spec) return <Empty>这个自定义小组件已被删除，可以在编辑模式里移除</Empty>;
  return <CustomView spec={spec} items={data?.items ?? []} size={w.size} error={data?.error} ts={data?.ts} onRefresh={() => refreshCustom(spec)} />;
}
