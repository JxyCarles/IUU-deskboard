/* 通用拖动排序：
 * - 按住 ≡ 把手：立即可拖
 * - 在条目其他位置长按：先轻微下压，约 0.4 秒后"拿起"再拖动
 * 按钮、下拉框、复选框等控件上不触发长按，避免和正常点击冲突 */
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type Modifier,
  type PointerSensorProps,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createContext, useContext, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

const NO_LONG_PRESS = "select,button,textarea,a,label.switch,input[type=checkbox],input[type=date],input[type=range],[data-no-drag]";

/** 同一个 onPointerDown 只能挂一个传感器，所以在拿到按下事件时再决定：把手上立即拖，其他位置长按 */
class LiftSensor extends PointerSensor {
  constructor(props: PointerSensorProps) {
    const onHandle = (props.event.target as Element | null)?.closest?.("[data-drag-handle]");
    super({ ...props, options: { ...props.options, activationConstraint: onHandle ? { distance: 3 } : { delay: 400, tolerance: 6 } } });
  }
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: e }: PointerEvent) => {
        if (!e.isPrimary || e.button !== 0) return false;
        const t = e.target as Element;
        return !!t.closest("[data-drag-handle]") || !t.closest(NO_LONG_PRESS);
      },
    },
  ];
}

/** 竖直列表只允许上下移动 */
export const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const PressCtx = createContext<string | null>(null);

/** 拖完松手时浏览器还会补一个 click，吞掉它，免得误触发选中 / 打开 */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 50);
}

export function SortDnd({
  children,
  onDragEnd,
  modifiers,
  collision = closestCenter,
}: {
  children: ReactNode;
  onDragEnd: (e: DragEndEvent) => void;
  modifiers?: Modifier[];
  collision?: CollisionDetection;
}) {
  const sensors = useSensors(useSensor(LiftSensor));
  const [pressing, setPressing] = useState<string | null>(null);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      modifiers={modifiers}
      onDragPending={(e) => setPressing(String(e.id))}
      onDragAbort={() => setPressing(null)}
      onDragStart={() => {
        setPressing(null);
        document.body.classList.add("sorting");
      }}
      onDragCancel={() => document.body.classList.remove("sorting")}
      onDragEnd={(e) => {
        document.body.classList.remove("sorting");
        swallowNextClick();
        onDragEnd(e);
      }}
    >
      <PressCtx.Provider value={pressing}>{children}</PressCtx.Provider>
    </DndContext>
  );
}

/** 条目用：返回要挂到根元素上的 ref / 事件 / 样式，以及附加的 class */
export function useSortRow(id: string, disabled = false) {
  const s = useSortable({ id, disabled });
  const pressing = useContext(PressCtx) === id;
  const style: CSSProperties = { transform: CSS.Translate.toString(s.transform), transition: s.transition };
  return {
    ref: s.setNodeRef,
    props: { ...(disabled ? {} : s.listeners), style },
    cls: " sort-row" + (s.isDragging ? " lifted" : "") + (pressing ? " pressing" : ""),
    dragging: s.isDragging,
  };
}

/** 单个列表：拖完给出新的 id 顺序 */
export function SortableList({
  ids,
  onReorder,
  grid,
  children,
}: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  grid?: boolean;
  children: ReactNode;
}) {
  return (
    <SortDnd
      modifiers={grid ? undefined : [verticalOnly]}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        const next = [...ids];
        next.splice(to, 0, ...next.splice(from, 1));
        onReorder(next);
      }}
    >
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </SortDnd>
  );
}

/** 三条横线的拖动把手 */
export function Grip({ className = "" }: { className?: string }) {
  return (
    <span className={"grip " + className} data-drag-handle title="按住拖动排序（也可以长按条目）">
      <svg viewBox="0 0 12 10" width="12" height="10" aria-hidden>
        <path d="M1 1.5h10M1 5h10M1 8.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** 按新的 id 顺序重排数组里这些条目，其余条目位置不动 */
export function applyOrder<T extends { id: string }>(arr: T[], ids: string[]): T[] {
  const set = new Set(ids);
  const byId = new Map(arr.map((x) => [x.id, x]));
  let k = 0;
  return arr.map((x) => (set.has(x.id) ? byId.get(ids[k++])! : x));
}
