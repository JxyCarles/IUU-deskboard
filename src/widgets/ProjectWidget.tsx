import { useStore } from "../store";
import type { ItemStatus, Project } from "../types";
import { plain } from "../utils";
import { Bar, Empty, Ring, stop, useNav, WHead, type WidgetProps } from "./common";

export const STATUS_META: Record<ItemStatus, { label: string; color: string }> = {
  todo: { label: "待办", color: "var(--gray)" },
  doing: { label: "进行中", color: "var(--blue)" },
  done: { label: "已完成", color: "var(--green)" },
};

export function projectStats(p: Project) {
  const c = { todo: 0, doing: 0, done: 0 };
  p.items.forEach((i) => c[i.status]++);
  const total = p.items.length;
  return { ...c, total, pct: total ? (c.done / total) * 100 : 0 };
}

function Columns({ p, max }: { p: Project; max: number }) {
  return (
    <div className="pj-cols">
      {(["todo", "doing", "done"] as ItemStatus[]).map((st) => {
        const items = p.items.filter((i) => i.status === st);
        return (
          <div key={st} className="pj-col">
            <div className="pj-col-h" style={{ color: STATUS_META[st].color }}>
              {STATUS_META[st].label} <span>{items.length}</span>
            </div>
            <ul>
              {items.slice(0, max).map((i) => (
                <li key={i.id} className={st === "done" ? "done" : ""}>
                  {i.text}
                </li>
              ))}
              {items.length > max && <li className="more">还有 {items.length - max} 项…</li>}
            </ul>
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

  if (w.size === "m") {
    const doing = p.items.filter((i) => i.status === "doing");
    return (
      <div className="pj-m">
        {head}
        <div className="pj-overview clamp-2">{plain(p.overview) || "暂无概况"}</div>
        <div className="pj-counters">
          {(["todo", "doing", "done"] as ItemStatus[]).map((k) => (
            <div key={k}>
              <b style={{ color: STATUS_META[k].color }}>{st[k]}</b>
              <span>{STATUS_META[k].label}</span>
            </div>
          ))}
        </div>
        {doing[0] && <div className="small ellipsis">▸ {doing.map((d) => d.text).join("、")}</div>}
        <Bar percent={st.pct} color={p.color} />
      </div>
    );
  }

  if (w.size === "l") {
    return (
      <div className="pj-l">
        {head}
        <div className="pj-overview clamp-2">{plain(p.overview) || "暂无概况"}</div>
        <Bar percent={st.pct} color={p.color} />
        <Columns p={p} max={6} />
      </div>
    );
  }

  return (
    <div className="pj-xl">
      <div className="pj-xl-left">
        {head}
        <div className="pj-overview clamp-6">{plain(p.overview) || "暂无概况"}</div>
        <Bar percent={st.pct} color={p.color} />
        {p.logs.length > 0 && (
          <div className="muted small ellipsis">
            最新日志：{p.logs[p.logs.length - 1].date} {p.logs[p.logs.length - 1].text}
          </div>
        )}
      </div>
      <Columns p={p} max={6} />
    </div>
  );
}
