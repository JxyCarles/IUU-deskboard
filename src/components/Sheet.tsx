import { useEffect, useRef, type ReactNode } from "react";

export default function Sheet({
  title,
  onClose,
  children,
  size = "lg",
  actions,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 多层弹窗时，Esc 只关最上面那一层
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll(".sheet-backdrop");
      if (all[all.length - 1] === ref.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div ref={ref} className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet sheet-${size}`}>
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <div className="sheet-actions">
            {actions}
            <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
              ✕
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
