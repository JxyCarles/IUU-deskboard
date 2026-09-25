import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { gridState, resolve, snapSize, spanOf, type Rect } from "../layout";
import { patch, remove, setState, useStore } from "../store";
import type { WidgetInst, WidgetSize } from "../types";
import { useNav } from "../widgets/common";
import { SIZE_LABEL, widgetDef } from "../widgets/registry";
import Sheet from "./Sheet";

const GAP = 16;
const LONG_PRESS_MS = 450;

interface Drag {
  id: string;
  mode: "move" | "resize";
  px: number;
  py: number;
  dx: number;
  dy: number;
  orig: Rect;
  target: Rect;
  size: WidgetSize;
  moved: boolean;
  /** 拖动开始时每个组件实际显示的位置 */
  base: WidgetInst[];
}

interface Menu {
  x: number;
  y: number;
  id?: string;
}

function ConfigSheet({ w, onClose }: { w: WidgetInst; onClose: () => void }) {
  const def = widgetDef(w.type);
  return (
    <Sheet title={`编辑「${def.name}」小组件`} onClose={onClose} size="sm">
      <div className="field">
        <span>尺寸</span>
        <div className="seg">
          {def.sizes.map((s) => (
            <button key={s} className={s === w.size ? "on" : ""} onClick={() => patch("widgets", w.id, { size: s })}>
              {SIZE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {def.Config ? <def.Config w={w} /> : <p className="muted small">这个小组件没有其他设置。</p>}
      <div className="sheet-foot">
        <button className="btn danger" onClick={() => (remove("widgets", w.id), onClose())}>
          移除小组件
        </button>
        <button className="btn primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Sheet>
  );
}

function ContextMenu({
  menu,
  widgets,
  editing,
  onClose,
  onEdit,
  onAdd,
  onConfig,
  onArrange,
}: {
  menu: Menu;
  widgets: WidgetInst[];
  editing: boolean;
  onClose: () => void;
  onEdit: (v: boolean) => void;
  onAdd: () => void;
  onConfig: (id: string) => void;
  onArrange: () => void;
}) {
  const nav = useNav();
  const w = widgets.find((x) => x.id === menu.id);
  const def = w && widgetDef(w.type);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const act = (f: () => void) => () => {
    f();
    onClose();
  };
  // 靠近窗口右/下边缘时往回收，避免菜单被裁掉
  const left = Math.min(menu.x, window.innerWidth - 230);
  const top = Math.min(menu.y, window.innerHeight - (w ? 250 : 190));

  return (
    <div className="ctx" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {w && def ? (
        <>
          <div className="ctx-title">{def.name}</div>
          <div className="ctx-sizes">
            {(["s", "m", "l", "xl"] as WidgetSize[]).map((s) => (
              <button
                key={s}
                disabled={!def.sizes.includes(s)}
                className={s === w.size ? "on" : ""}
                onClick={act(() => patch("widgets", w.id, { size: s }))}
              >
                <i className={`sz sz-${s}`} />
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
          {def.page && (
            <button className="ctx-item" onClick={act(() => nav.open(def.page!))}>
              打开{def.name}
            </button>
          )}
          <button className="ctx-item" onClick={act(() => onConfig(w.id))}>
            小组件设置…
          </button>
          <button className="ctx-item" onClick={act(() => onEdit(!editing))}>
            {editing ? "完成编辑" : "编辑主屏幕（拖动 / 调整大小）"}
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item danger" onClick={act(() => remove("widgets", w.id))}>
            移除小组件
          </button>
        </>
      ) : (
        <>
          <button className="ctx-item" onClick={act(onAdd)}>
            添加小组件
          </button>
          <button className="ctx-item" onClick={act(() => onEdit(!editing))}>
            {editing ? "完成编辑" : "编辑主屏幕"}
          </button>
          <button className="ctx-item" onClick={act(onArrange)}>
            自动整理布局
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={act(() => nav.open("settings"))}>
            更换壁纸、主题与字体…
          </button>
        </>
      )}
    </div>
  );
}

export default function Board({ editing, setEditing, onAdd }: { editing: boolean; setEditing: (v: boolean) => void; onAdd: () => void }) {
  const widgets = useStore((s) => s.widgets);
  const minCell = useStore((s) => s.settings.cellSize);
  const nav = useNav();
  const ref = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: 4, cell: 160 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const press = useRef<{ timer: number; x: number; y: number; id: string } | null>(null);
  const suppressClick = useRef(false);
  // 首次布局完成后才开启位置动画，避免打开时小组件从左上角飞过来
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(t);
  }, []);

  // 根据容器宽度计算列数，格子保持正方形
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const cols = Math.max(2, Math.floor((w + GAP) / (minCell + GAP)));
      gridState.cols = cols;
      setGrid({ cols, cell: Math.floor((w - GAP * (cols - 1)) / cols) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minCell]);

  const { cols, cell } = grid;
  const unit = cell + GAP;
  const rects = useMemo(
    () => (drag?.moved ? resolve(drag.base, cols, drag.target) : resolve(widgets, cols)),
    [widgets, cols, drag],
  );
  const rows = Math.max(1, ...rects.map((r) => r.y + r.h)) + (editing ? 1 : 0);

  const beginDrag = (id: string, mode: Drag["mode"], px: number, py: number) => {
    const orig = rects.find((r) => r.id === id);
    const w = widgets.find((x) => x.id === id);
    if (!orig || !w) return;
    // 没拖过的组件平时按窗口宽度自动排列；开始拖动时才把当前显示的位置固定下来
    const pos = new Map(rects.map((r) => [r.id, r]));
    const base = widgets.map((x) => ({ ...x, x: pos.get(x.id)?.x ?? x.x, y: pos.get(x.id)?.y ?? x.y }));
    const d: Drag = { id, mode, px, py, dx: 0, dy: 0, orig, target: orig, size: w.size, moved: false, base };
    dragRef.current = d;
    setDrag(d);

    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current!;
      const dx = e.clientX - cur.px;
      const dy = e.clientY - cur.py;
      if (!cur.moved && Math.hypot(dx, dy) < 5) return;
      const next: Drag = { ...cur, dx, dy, moved: true };
      if (cur.mode === "move") {
        const x = Math.max(0, Math.min(cols - cur.orig.w, Math.round((cur.orig.x * unit + dx) / unit)));
        const y = Math.max(0, Math.round((cur.orig.y * unit + dy) / unit));
        next.target = { ...cur.orig, x, y };
      } else {
        const wantW = Math.max(1, Math.round((cur.orig.w * unit + dx) / unit));
        const wantH = Math.max(1, Math.round((cur.orig.h * unit + dy) / unit));
        const def = widgetDef(widgets.find((x) => x.id === cur.id)!.type);
        const size = snapSize(wantW, wantH, def.sizes, cols);
        const [sw, sh] = spanOf(size, cols);
        next.size = size;
        next.target = { ...cur.orig, x: Math.min(cur.orig.x, cols - sw), w: sw, h: sh };
      }
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur?.moved) return;
      suppressClick.current = true;
      // 把这次操作后的布局写回每个组件
      const sized = cur.base.map((x) => (x.id === cur.id ? { ...x, size: cur.size } : x));
      const final = resolve(sized, cols, cur.target);
      const pos = new Map(final.map((r) => [r.id, r]));
      setState((s) => ({
        ...s,
        widgets: s.widgets.map((x) => {
          const r = pos.get(x.id);
          return r ? { ...x, x: r.x, y: r.y, size: x.id === cur.id ? cur.size : x.size } : x;
        }),
      }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const onTileDown = (e: React.PointerEvent, w: WidgetInst) => {
    if (e.button !== 0) return;
    if (editing) {
      beginDrag(w.id, "move", e.clientX, e.clientY);
      return;
    }
    // 长按进入编辑模式并直接开始拖动（和 iOS 一样）
    const x = e.clientX;
    const y = e.clientY;
    const timer = window.setTimeout(() => {
      press.current = null;
      suppressClick.current = true;
      setEditing(true);
      beginDrag(w.id, "move", x, y);
    }, LONG_PRESS_MS);
    press.current = { timer, x, y, id: w.id };
  };

  const onTileMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) cancelPress();
  };

  const onTileClick = (w: WidgetInst) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const def = widgetDef(w.type);
    if (!editing && def.page) nav.open(def.page);
  };

  const arrange = () =>
    setState((s) => ({ ...s, widgets: s.widgets.map(({ x: _x, y: _y, ...rest }) => rest) }));

  const box = (r: Rect) => ({ left: r.x * unit, top: r.y * unit, width: r.w * cell + (r.w - 1) * GAP, height: r.h * cell + (r.h - 1) * GAP });

  const configW = widgets.find((w) => w.id === configId);

  return (
    <>
      <div
        ref={ref}
        className={"board" + (ready ? " ready" : "") + (drag?.moved ? " dragging" : "")}
        style={{ height: rows * unit - GAP }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onPointerDown={(e) => {
          // 编辑模式下点空白处退出编辑
          if (editing && e.button === 0 && e.target === e.currentTarget) setEditing(false);
        }}
      >
        {drag?.moved && <div className="drop-slot" style={box(drag.target)} />}
        {editing &&
          Array.from({ length: rows * cols }, (_, i) => (
            <div key={i} className="grid-dot" style={{ left: (i % cols) * unit + cell / 2, top: Math.floor(i / cols) * unit + cell / 2 }} />
          ))}
        {widgets.map((w) => {
          const r = rects.find((x) => x.id === w.id);
          if (!r) return null;
          const def = widgetDef(w.type);
          const isDrag = drag?.moved && drag.id === w.id;
          const view: WidgetInst = isDrag && drag.mode === "resize" ? { ...w, size: drag.size } : w;
          const style: React.CSSProperties = isDrag && drag.mode === "move" ? { ...box(drag.orig), left: drag.orig.x * unit + drag.dx, top: drag.orig.y * unit + drag.dy } : box(r);
          return (
            <div
              key={w.id}
              className={
                `widget size-${view.size}` +
                (editing ? " editing" : "") +
                (isDrag ? " lifted" : "") +
                (def.page ? " clickable" : "")
              }
              style={{ ...style, animationDelay: `${(w.id.charCodeAt(0) % 5) * -0.07}s` }}
              onPointerDown={(e) => onTileDown(e, w)}
              onPointerMove={onTileMove}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onClick={() => onTileClick(w)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                cancelPress();
                setMenu({ x: e.clientX, y: e.clientY, id: w.id });
              }}
            >
              <div className="widget-inner">
                <def.Component w={view} />
              </div>
              {editing && (
                <>
                  <button
                    className="w-del"
                    title="移除小组件"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove("widgets", w.id);
                    }}
                  >
                    <Icon name="minus" size={14} stroke={2.6} />
                  </button>
                  {def.Config && (
                    <button
                      className="w-cfg"
                      title="小组件设置"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfigId(w.id);
                      }}
                    >
                      <Icon name="settings" size={13} stroke={2.2} />
                    </button>
                  )}
                  {def.sizes.length > 1 && (
                    <div
                      className="w-resize"
                      title="拖动调整大小"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button === 0) beginDrag(w.id, "resize", e.clientX, e.clientY);
                      }}
                    />
                  )}
                  {isDrag && drag.mode === "resize" && <div className="size-badge">{SIZE_LABEL[drag.size]}</div>}
                </>
              )}
            </div>
          );
        })}
        {widgets.length === 0 && (
          <div className="board-empty">
            <button className="pill" onClick={onAdd}>
              ＋ 添加小组件
            </button>
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu
          menu={menu}
          widgets={widgets}
          editing={editing}
          onClose={() => setMenu(null)}
          onEdit={setEditing}
          onAdd={onAdd}
          onConfig={setConfigId}
          onArrange={arrange}
        />
      )}
      {configW && <ConfigSheet w={configW} onClose={() => setConfigId(null)} />}
    </>
  );
}
