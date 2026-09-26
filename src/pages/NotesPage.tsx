import { useMemo, useState } from "react";
import { Grip, SortableList, useSortRow } from "../components/Sortable";
import { patch, remove, setState, upsert, useStore } from "../store";
import type { Note } from "../types";
import { md, plain, relTime, uid } from "../utils";
import { sortNotes } from "../widgets/NotesWidget";

const reorderNotes = (ids: string[]) =>
  setState((s) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    return { ...s, notes: s.notes.map((x) => (pos.has(x.id) ? { ...x, order: pos.get(x.id) } : x)) };
  });

function SortNoteItem(props: { n: Note; on: boolean; onSelect: () => void }) {
  return <NoteItem {...props} sort={useSortRow(props.n.id)} />;
}

function NoteItem({ n, on, onSelect, sort }: { n: Note; on: boolean; onSelect: () => void; sort?: ReturnType<typeof useSortRow> }) {
  return (
    <div ref={sort?.ref} {...sort?.props} className={"side-item" + (on ? " on" : "") + (sort?.cls ?? "")} onClick={onSelect}>
      <div className="side-item-title row">
        <span className="grow ellipsis">
          {n.pinned && "📌 "}
          {n.title || "无标题"}
        </span>
        {sort && <Grip />}
      </div>
      <div className="side-item-sub">
        {relTime(n.updatedAt)} · {plain(n.content).slice(0, 40)}
      </div>
    </div>
  );
}

export default function NotesPage({ arg }: { arg?: string }) {
  const notes = useStore((s) => s.notes);
  const [sel, setSel] = useState<string | undefined>(arg ?? [...notes].sort(sortNotes)[0]?.id);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(false);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return [...notes].sort(sortNotes).filter((n) => !k || (n.title + n.content).toLowerCase().includes(k));
  }, [notes, q]);
  const cur = notes.find((n) => n.id === sel);

  const create = () => {
    const now = Date.now();
    const id = uid();
    upsert("notes", { id, title: "", content: "", pinned: false, createdAt: now, updatedAt: now });
    setSel(id);
    setPreview(false);
  };

  const edit = (p: { title?: string; content?: string }) => cur && patch("notes", cur.id, { ...p, updatedAt: Date.now() });

  return (
    <div className="split">
      <aside className="split-side">
        <div className="side-tools">
          <input className="search" placeholder="搜索备忘录" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={create}>
            新建
          </button>
        </div>
        <div className="side-list">
          {/* 搜索时只显示部分条目，不提供拖动；否则置顶和普通两组各自拖动排序 */}
          {q.trim()
            ? list.map((n) => <NoteItem key={n.id} n={n} on={n.id === sel} onSelect={() => setSel(n.id)} />)
            : [true, false].map((pinned) => {
                const group = list.filter((n) => n.pinned === pinned);
                return (
                  <SortableList key={String(pinned)} ids={group.map((n) => n.id)} onReorder={reorderNotes}>
                    {group.map((n) => (
                      <SortNoteItem key={n.id} n={n} on={n.id === sel} onSelect={() => setSel(n.id)} />
                    ))}
                  </SortableList>
                );
              })}
          {list.length === 0 && <div className="muted small pad">没有备忘录</div>}
        </div>
      </aside>
      <section className="split-main">
        {cur ? (
          <div className="note-editor">
            <div className="note-toolbar">
              <input className="note-title-input" placeholder="标题" value={cur.title} onChange={(e) => edit({ title: e.target.value })} />
              <div className="seg">
                <button className={!preview ? "on" : ""} onClick={() => setPreview(false)}>
                  编辑
                </button>
                <button className={preview ? "on" : ""} onClick={() => setPreview(true)}>
                  预览
                </button>
              </div>
              <button className="btn" onClick={() => patch("notes", cur.id, { pinned: !cur.pinned })}>
                {cur.pinned ? "取消置顶" : "置顶"}
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  remove("notes", cur.id);
                  setSel(undefined);
                }}
              >
                删除
              </button>
            </div>
            {preview ? (
              <div className="md" dangerouslySetInnerHTML={{ __html: md(cur.content || "*空*") }} />
            ) : (
              <textarea
                className="note-textarea"
                placeholder="支持 Markdown：# 标题、- 列表、**加粗**、`代码`……"
                value={cur.content}
                onChange={(e) => edit({ content: e.target.value })}
                autoFocus
              />
            )}
            <div className="muted small">
              创建于 {new Date(cur.createdAt).toLocaleString()} · 修改于 {relTime(cur.updatedAt)}
            </div>
          </div>
        ) : (
          <div className="placeholder">选择或新建一条备忘录</div>
        )}
      </section>
    </div>
  );
}
