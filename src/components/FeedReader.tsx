import DOMPurify from "dompurify";
import { openUrl } from "../api";
import { closeReader, contentOf, sourceColor, useReader } from "../services/feeds";
import { useStore } from "../store";
import { relTime } from "../utils";
import { useNav } from "../widgets/common";
import Sheet from "./Sheet";

/** 资讯快速浏览：显示 RSS 里带的正文或摘要，想看全文再打开原文 */
export default function FeedReader() {
  const item = useReader();
  const feeds = useStore((s) => s.feeds);
  const nav = useNav();
  if (!item) return null;

  const raw = contentOf(item.link);
  const html = raw
    ? DOMPurify.sanitize(raw, { FORBID_TAGS: ["style", "script", "iframe", "form"], FORBID_ATTR: ["style", "onclick"] })
    : "";

  return (
    <Sheet
      size="md"
      onClose={closeReader}
      title={
        <button
          className="reader-source"
          style={{ color: sourceColor(feeds, item.sourceId) }}
          onClick={() => {
            closeReader();
            nav.open("news", item.sourceId);
          }}
          title="查看这个来源的全部资讯"
        >
          {item.source} ›
        </button>
      }
      actions={
        <button className="btn primary sm" onClick={() => openUrl(item.link)}>
          打开原文
        </button>
      }
    >
      <article className="reader">
        <h2>{item.title}</h2>
        <div className="muted small">{item.time ? `${new Date(item.time).toLocaleString()} · ${relTime(item.time)}` : ""}</div>
        {html ? (
          <div
            className="md reader-body"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(e) => {
              // 正文里的链接用系统浏览器打开
              const a = (e.target as HTMLElement).closest("a");
              if (a?.href) {
                e.preventDefault();
                openUrl(a.href);
              }
            }}
          />
        ) : (
          <p className="reader-body">{item.summary || "这个来源的 RSS 没有提供正文或摘要，点右上角「打开原文」查看。"}</p>
        )}
      </article>
    </Sheet>
  );
}
