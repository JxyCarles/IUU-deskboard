/** 线性图标，颜色跟随 currentColor，方便和主题配色统一 */

const PATHS = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.2h.01M12 17.2h.01" strokeWidth="2.4" />
    </>
  ),
  agenda: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9.5 2.5h5" />
    </>
  ),
  tasks: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8 12.2l2.7 2.7L16 9.5" />
    </>
  ),
  notes: (
    <>
      <path d="M14.5 3.5H7a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V9z" />
      <path d="M14.5 3.5V9H20M8 13h8M8 16.5h5" />
    </>
  ),
  project: (
    <>
      <rect x="3.5" y="4" width="4.6" height="15.5" rx="1.6" />
      <rect x="9.7" y="4" width="4.6" height="10.5" rx="1.6" />
      <rect x="15.9" y="4" width="4.6" height="7" rx="1.6" />
    </>
  ),
  ai: (
    <>
      <path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z" />
      <path d="M18.5 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
    </>
  ),
  news: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h10A1.5 1.5 0 0 1 17 5.5V19a1.5 1.5 0 0 0 1.5 1.5H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h2.5a1 1 0 0 1 1 1v9a1.5 1.5 0 0 1-3 0M7.5 8h6M7.5 11.5h6M7.5 15h4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 20v-6M4 10V4M12 20v-8M12 8V4M20 20v-4M20 12V4" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </>
  ),
  github: (
    <>
      <circle cx="6.5" cy="5.5" r="2.2" />
      <circle cx="6.5" cy="18.5" r="2.2" />
      <circle cx="17.5" cy="8.5" r="2.2" />
      <path d="M6.5 7.7v8.6M17.5 10.7c0 4-4 4.3-11 5.6" />
    </>
  ),
  studio: (
    <>
      <path d="M4 20L14.5 9.5" />
      <path d="M16 3.5v3M16 12.5v-1M11.5 8h1M19.5 8h1M18.5 5.5l.8-.8M13.5 5.5l-.8-.8M18.5 10.5l.8.8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5" />
      <path d="M20 3.5v5h-5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20.5 16l-5-5-9 8.5" />
    </>
  ),
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />,
  resize: <path d="M20 14v6h-6M20 20l-7-7M4 10V4h6M4 4l7 7" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="16" height="7" rx="2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  minus: <path d="M5 12h14" />,
  square: <rect x="5" y="5" width="14" height="14" rx="2" />,
};

export type IconName = keyof typeof PATHS;

/** 扩展规范里允许自定义小组件使用的图标 */
export const ICON_LIST: IconName[] = ["clock", "calendar", "agenda", "tasks", "notes", "project", "ai", "news", "github", "settings", "image", "grid", "studio"];

export function Icon({ name, size = 18, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", display: "block" }}
    >
      {PATHS[name]}
    </svg>
  );
}
