import { useMemo } from "react";
import { useStore } from "../store";
import type { Note } from "../types";
import { plain, relTime } from "../utils";
import { Empty, stop, useNav, WHead, type WidgetProps } from "./common";

export function sortNotes(a: Note, b: Note) {
  return Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;
}

export default function NotesWidget({ w }: WidgetProps) {
  const notes = useStore((s) => s.notes);
  const nav = useNav();
  const sorted = useMemo(() => [...notes].sort(sortNotes), [notes]);

  if (w.size === "s") {
    const n = sorted[0];
    return (
      <div className="notes-s">
        <WHead icon="notes" title="备忘录" color="var(--c-notes)" />
        {n ? (
          <>
            <div className="notes-s-title">{n.title || "无标题"}</div>
            <div className="notes-s-body">{plain(n.content)}</div>
          </>
        ) : (
          <Empty>还没有备忘录</Empty>
        )}
      </div>
    );
  }

  const max = w.size === "m" ? 3 : w.size === "l" ? 7 : 8;
  return (
    <div className="notes-l">
      <WHead icon="notes" title="备忘录" color="var(--c-notes)" right={`${notes.length} 条`} />
      <div className={"notes-list" + (w.size === "xl" ? " two-col" : "")}>
        {sorted.length === 0 && <Empty>还没有备忘录</Empty>}
        {sorted.slice(0, max).map((n) => (
          <div
            key={n.id}
            className="note-item"
            onClick={(e) => {
              stop(e);
              nav.open("notes", n.id);
            }}
          >
            <div className="note-item-title">
              {n.pinned && <span className="pin">📌</span>}
              {n.title || "无标题"}
            </div>
            <div className="note-item-sub">
              <span>{relTime(n.updatedAt)}</span> {plain(n.content)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
