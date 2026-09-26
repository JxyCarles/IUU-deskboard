import { useState } from "react";
import { useNav } from "../widgets/common";
import { patch, remove, upsert, useStore } from "../store";
import type { ItemStatus, Project, ProjectItem } from "../types";
import { COLORS, EMOJIS, md, today, uid } from "../utils";
import { Bar } from "../widgets/common";
import { projectStats, STATUS_META } from "../widgets/ProjectWidget";

const ORDER: ItemStatus[] = ["todo", "doing", "done"];
const PSTATUS = { active: "进行中", paused: "暂停", done: "已结束" };

function newProject(): Project {
  const now = Date.now();
  return {
    id: uid(),
    name: "新项目",
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    color: COLORS[5],
    status: "active",
    overview: "",
    items: [],
    logs: [],
    createdAt: now,
    updatedAt: now,
  };
}

function ItemCard({ it, onChange, onDelete }: { it: ProjectItem; onChange: (p: Partial<ProjectItem>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const idx = ORDER.indexOf(it.status);
  return (
    <div className={"kb-card" + (it.status === "done" ? " done" : "")} draggable onDragStart={(e) => e.dataTransfer.setData("text/item", it.id)}>
      <div className="kb-card-row">
        <span className="kb-dot" style={{ background: STATUS_META[it.status].color }} />
        <input className="kb-text" value={it.text} onChange={(e) => onChange({ text: e.target.value })} />
      </div>
      {open && (
        <div className="kb-detail">
          <textarea className="input" rows={3} placeholder="细节说明（可选）" value={it.detail ?? ""} onChange={(e) => onChange({ detail: e.target.value })} />
          <label className="row small">
            截止
            <input type="date" className="input" value={it.due ?? ""} onChange={(e) => onChange({ due: e.target.value || undefined })} />
          </label>
        </div>
      )}
      {!open && (it.detail || it.due) && (
        <div className="muted small kb-meta">
          {it.due && `📅 ${it.due} `}
          {it.detail}
        </div>
      )}
      <div className="kb-actions">
        <button disabled={idx === 0} onClick={() => onChange({ status: ORDER[idx - 1] })} title="移到左列">
          ‹
        </button>
        <button disabled={idx === 2} onClick={() => onChange({ status: ORDER[idx + 1] })} title="移到右列">
          ›
        </button>
        <button onClick={() => setOpen(!open)}>{open ? "收起" : "详情"}</button>
        <button className="danger" onClick={onDelete}>
          删除
        </button>
      </div>
    </div>
  );
}

function ProjectDetail({ p }: { p: Project }) {
  const [editOverview, setEditOverview] = useState(!p.overview);
  const [drafts, setDrafts] = useState<Record<ItemStatus, string>>({ todo: "", doing: "", done: "" });
  const [log, setLog] = useState("");
  const set = (x: Partial<Project>) => patch("projects", p.id, { ...x, updatedAt: Date.now() });
  const setItem = (id: string, x: Partial<ProjectItem>) => set({ items: p.items.map((i) => (i.id === id ? { ...i, ...x } : i)) });
  const st = projectStats(p);

  const addItem = (status: ItemStatus) => {
    const text = drafts[status].trim();
    if (!text) return;
    set({ items: [...p.items, { id: uid(), text, status, createdAt: Date.now() }] });
    setDrafts({ ...drafts, [status]: "" });
  };
  const addLog = () => {
    if (!log.trim()) return;
    set({ logs: [...p.logs, { id: uid(), date: today(), text: log.trim() }] });
    setLog("");
  };

  return (
    <div className="pd">
      <div className="pd-head">
        <button className="pd-emoji" title="点击切换图标" onClick={() => set({ emoji: EMOJIS[(EMOJIS.indexOf(p.emoji) + 1) % EMOJIS.length] })}>
          {p.emoji}
        </button>
        <input className="pd-name" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        <select className="input" value={p.status} onChange={(e) => set({ status: e.target.value as Project["status"] })}>
          {Object.entries(PSTATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn danger" onClick={() => remove("projects", p.id)}>
          删除项目
        </button>
      </div>
      <div className="row">
        <div className="swatches">
          {COLORS.map((c) => (
            <button key={c} className={"swatch" + (c === p.color ? " on" : "")} style={{ background: c }} onClick={() => set({ color: c })} />
          ))}
        </div>
        <div className="grow pd-progress">
          <Bar percent={st.pct} color={p.color} />
          <span className="small muted">
            完成 {st.done}/{st.total}（{Math.round(st.pct)}%）
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h4>项目概况</h4>
          <button className="btn sm" onClick={() => setEditOverview(!editOverview)}>
            {editOverview ? "完成" : "编辑"}
          </button>
        </div>
        {editOverview ? (
          <textarea
            className="input"
            rows={7}
            placeholder={"支持 Markdown，例如：\n## 目标\n- ……\n## 关键节点\n- 10/15 提测\n## 相关链接"}
            value={p.overview}
            onChange={(e) => set({ overview: e.target.value })}
          />
        ) : (
          <div className="md" onDoubleClick={() => setEditOverview(true)} dangerouslySetInnerHTML={{ __html: md(p.overview || "*暂无概况，点「编辑」填写*") }} />
        )}
      </div>

      <div className="kb">
        {ORDER.map((status) => {
          const items = p.items.filter((i) => i.status === status);
          return (
            <div
              key={status}
              className="kb-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/item");
                if (id) setItem(id, { status });
              }}
            >
              <div className="kb-col-h" style={{ color: STATUS_META[status].color }}>
                {STATUS_META[status].label}
                <span>{items.length}</span>
              </div>
              {items.map((it) => (
                <ItemCard key={it.id} it={it} onChange={(x) => setItem(it.id, x)} onDelete={() => set({ items: p.items.filter((i) => i.id !== it.id) })} />
              ))}
              <input
                className="kb-add"
                placeholder="＋ 添加一项，回车保存"
                value={drafts[status]}
                onChange={(e) => setDrafts({ ...drafts, [status]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addItem(status)}
              />
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <h4>工作日志</h4>
        </div>
        <div className="row">
          <input className="input grow" placeholder={`记录今天（${today()}）的进展，回车保存`} value={log} onChange={(e) => setLog(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLog()} />
          <button className="btn primary" onClick={addLog}>
            记录
          </button>
        </div>
        <div className="logs">
          {[...p.logs].reverse().map((l) => (
            <div key={l.id} className="log">
              <span className="log-date">{l.date}</span>
              <span className="grow">{l.text}</span>
              <button className="icon-btn sm" onClick={() => set({ logs: p.logs.filter((x) => x.id !== l.id) })}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage({ arg }: { arg?: string }) {
  const projects = useStore((s) => s.projects);
  const nav = useNav();
  const [sel, setSel] = useState<string | undefined>(arg ?? projects[0]?.id);
  const cur = projects.find((p) => p.id === sel);

  return (
    <div className="split">
      <aside className="split-side">
        <div className="side-tools">
          <b className="grow">项目</b>
          <button className="btn" title="粘贴 JSON 或任意材料，让 AI 整理成项目" onClick={() => nav.open("studio", "import")}>
            ✨ 导入
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const p = newProject();
              upsert("projects", p);
              setSel(p.id);
            }}
          >
            新建
          </button>
        </div>
        <div className="side-list">
          {(["active", "paused", "done"] as const).map((g) => {
            const list = projects.filter((p) => p.status === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="side-group">{PSTATUS[g]}</div>
                {list.map((p) => {
                  const st = projectStats(p);
                  return (
                    <div key={p.id} className={"side-item" + (p.id === sel ? " on" : "")} onClick={() => setSel(p.id)}>
                      <div className="side-item-title">
                        {p.emoji} {p.name}
                      </div>
                      <Bar percent={st.pct} color={p.color} />
                      <div className="side-item-sub">
                        待办 {st.todo} · 进行 {st.doing} · 完成 {st.done}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>
      <section className="split-main">{cur ? <ProjectDetail key={cur.id} p={cur} /> : <div className="placeholder">选择或新建一个项目</div>}</section>
    </div>
  );
}
