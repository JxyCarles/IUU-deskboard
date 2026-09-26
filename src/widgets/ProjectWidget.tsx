import { useLayoutEffect, useRef } from "react";
import { patch, useStore } from "../store";
import type { ItemStatus, Project, ProjectItem } from "../types";
import { plain, today } from "../utils";
import { Bar, Empty, Ring, stop, useNav, WHead, type WidgetProps } from "./common";

export const STATUS_META: Record<ItemStatus, { label: string; color: string }> = {
  todo: { label: "待办", color: "var(--text-2)" },
  doing: { label: "进行中", color: "var(--blue)" },
  done: { label: "已完成", color: "var(--green)" },
};

export function projectStats(p: Project) {
  const c = { todo: 0, doing: 0, done: 0 };
  p.items.forEach((i) => c[i.status]++);
  const total = p.items.length;
  return { ...c, total, pct: total ? (c.done / total) * 100 : 0 };
}

const NEXT: Record<ItemStatus, ItemStatus> = { todo: "doing", doing: "done", done: "todo" };
const MARK: Record<ItemStatus, string> = { todo: "○", doing: "●", done: "✓" };

/** 点状态标记直接推进：待办 → 进行中 → 已完成 → 待办 */
function cycle(p: Project, it: ProjectItem) {
  patch("projects", p.id, { items: p.items.map((x) => (x.id === it.id ? { ...x, status: NEXT[x.status] } : x)), updatedAt: Date.now() });
}

function ItemRow({ p, it, compact }: { p: Project; it: ProjectItem; compact?: boolean }) {
  const nav = useNav();
  const late = it.due && it.status !== "done" && it.due < today();
  return (
    <div className={"pj-row st-" + it.status}>
      <button
        className="pj-mark"
        style={{ color: STATUS_META[it.status].color }}
        title={`${STATUS_META[it.status].label}（点击改为「${STATUS_META[NEXT[it.status]].label}」）`}
        onClick={(e) => {
          stop(e);
          cycle(p, it);
        }}
      >
        {MARK[it.status]}
      </button>
      <span
        className={"pj-text" + (compact ? " one" : "")}
        onClick={(e) => {
          stop(e);
          nav.open("projects", p.id);
        }}
        title={it.detail ? `${it.text}
${it.detail}` : it.text}
      >
        {it.text}
      </span>
      {it.due && <span className={"pj-due" + (late ? " late" : "")}>{it.due.slice(5)}</span>}
    </div>
  );
}

/** 按状态分组的紧凑列表：进行中 → 待办 → 已完成 */
function ItemList({ p, groups, compact, flat }: { p: Project; groups: ItemStatus[]; compact?: boolean; flat?: boolean }) {
  // 外层占满剩余空间用来量高度；内层滚动区的高度停在“最后一条能完整显示的条目”底部，不露出半行
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = list.current;
    if (!outer || !inner) return;
    const fit = () => {
      const avail = outer.clientHeight;
      const top = inner.getBoundingClientRect().top - inner.scrollTop;
      let h = 0;
      inner.querySelectorAll(".pj-row, .pj-group-h, .pj-none").forEach((el) => {
        const r = el.getBoundingClientRect();
        const bottom = r.bottom - top;
        if (bottom <= avail + 0.5) h = Math.max(h, bottom);
      });
      inner.style.height = (h || avail) + "px";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [p.items, groups.join(), flat]);

  const empty = groups.every((st) => !p.items.some((i) => i.status === st));
  return (
    <div ref={box} className="pj-list-box">
      <div ref={list} className="w-scroll pj-list">
        {flat
          ? groups.flatMap((st) => p.items.filter((i) => i.status === st)).map((it) => <ItemRow key={it.id} p={p} it={it} compact={compact} />)
          : groups.map((st) => {
              const items = p.items.filter((i) => i.status === st);
              if (!items.length) return null;
              return (
                <div key={st} className="pj-group">
                  <div className="pj-group-h" style={{ color: STATUS_META[st].color }}>
                    {STATUS_META[st].label} <span>{items.length}</span>
                  </div>
                  {items.map((it) => (
                    <ItemRow key={it.id} p={p} it={it} compact={compact} />
                  ))}
                </div>
              );
            })}
        {empty && <div className="muted small pj-none">{groups.includes("done") ? "没有条目，点小组件打开项目添加" : "没有进行中或待办的条目 🎉"}</div>}
      </div>
    </div>
  );
}

/** 超大尺寸：三列看板，条目是小卡片，列高随内容 */
function Columns({ p }: { p: Project }) {
  return (
    <div className="pj-cols">
      {(["todo", "doing", "done"] as ItemStatus[]).map((st) => {
        const items = p.items.filter((i) => i.status === st);
        return (
          <div key={st} className="pj-col">
            <div className="pj-col-h" style={{ color: STATUS_META[st].color }}>
              {STATUS_META[st].label} <span>{items.length}</span>
            </div>
            <div className="w-scroll pj-col-body">
              {items.map((it) => (
                <div key={it.id} className="pj-card">
                  <ItemRow p={p} it={it} />
                </div>
              ))}
              {items.length === 0 && <div className="pj-empty">暂无</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AllProjects({ size }: { size: string }) {
  const projects = useStore((s) => s.projects);
  const nav = useNav();
  const active = projects.filter((p) => p.status !== "done");
  if (size === "s") {
    const doing = active.reduce((s, p) => s + projectStats(p).doing, 0);
    return (
      <div className="pj-s">
        <WHead icon="project" title="项目" color="var(--c-project)" />
        <div className="pj-s-big">{active.length}</div>
        <div className="muted small">个进行中的项目</div>
        <div className="small">
          <b style={{ color: "var(--blue)" }}>{doing}</b> 项正在推进
        </div>
      </div>
    );
  }
  return (
    <div className="pj-all">
      <WHead icon="project" title="项目" color="var(--c-project)" right={`${active.length} 个进行中`} />
      {active.length === 0 && <Empty>还没有项目</Empty>}
      <div className={"pj-all-list" + (size === "xl" ? " two-col" : "")}>
        {active.slice(0, size === "m" ? 3 : 8).map((p) => {
          const st = projectStats(p);
          const doing = p.items.find((i) => i.status === "doing");
          return (
            <div
              key={p.id}
              className="pj-all-item"
              onClick={(e) => {
                stop(e);
                nav.open("projects", p.id);
              }}
            >
              <div className="pj-all-row">
                <span>
                  {p.emoji} {p.name}
                </span>
                <span className="muted small">
                  {st.done}/{st.total}
                </span>
              </div>
              <Bar percent={st.pct} color={p.color} />
              {size !== "m" && doing && <div className="muted small ellipsis">▸ {doing.text}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectWidget({ w }: WidgetProps) {
  const p = useStore((s) => s.projects.find((x) => x.id === w.config.projectId));
  if (!w.config.projectId) return <AllProjects size={w.size} />;
  if (!p) return <Empty>项目已删除，请在编辑模式里重新选择</Empty>;

  const st = projectStats(p);
  const head = <WHead icon={p.emoji} title={p.name} color={p.color} right={`${Math.round(st.pct)}%`} />;

  if (w.size === "s") {
    return (
      <div className="pj-s">
        {head}
        <div className="pj-s-main">
          <Ring percent={st.pct} color={p.color} size={62}>
            <b>
              {st.done}/{st.total}
            </b>
          </Ring>
          <div className="pj-s-counts">
            <span style={{ color: "var(--blue)" }}>进行 {st.doing}</span>
            <span className="muted">待办 {st.todo}</span>
          </div>
        </div>
      </div>
    );
  }

  const counts = (
    <div className="pj-counts">
      {(["doing", "todo", "done"] as ItemStatus[]).map((k) => (
        <span key={k}>
          <i style={{ background: STATUS_META[k].color }} />
          {STATUS_META[k].label} <b>{st[k]}</b>
        </span>
      ))}
    </div>
  );

  if (w.size === "m") {
    return (
      <div className="pj-m">
        {head}
        {counts}
        <ItemList p={p} groups={["doing", "todo"]} compact flat />
      </div>
    );
  }

  if (w.size === "l") {
    return (
      <div className="pj-l">
        {head}
        {p.overview.trim() && <div className="pj-overview clamp-2">{plain(p.overview)}</div>}
        <Bar percent={st.pct} color={p.color} />
        {counts}
        <ItemList p={p} groups={["doing", "todo", "done"]} />
      </div>
    );
  }

  return (
    <div className="pj-xl">
      <div className="pj-xl-left">
        {head}
        <div className="pj-overview clamp-6">{plain(p.overview) || "暂无概况"}</div>
        <Bar percent={st.pct} color={p.color} />
        {counts}
        {p.logs.length > 0 && (
          <div className="pj-logs">
            {p.logs
              .slice(-2)
              .reverse()
              .map((l) => (
                <div key={l.id} className="muted small ellipsis">
                  {l.date.slice(5)} {l.text}
                </div>
              ))}
          </div>
        )}
      </div>
      <Columns p={p} />
    </div>
  );
}
