import { useEffect, type ReactNode } from "react";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
