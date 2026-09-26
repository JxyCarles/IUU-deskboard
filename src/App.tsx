import { useEffect, useMemo, useRef, useState } from "react";
import { call, currentWindow, isTauri } from "./api";
import AddWidgetSheet from "./components/AddWidgetSheet";
import Board from "./components/Board";
import FeedReader from "./components/FeedReader";
import SceneWall from "./components/SceneWall";
import Sheet from "./components/Sheet";
import { applyFont } from "./fonts";
import { Icon, type IconName } from "./icons";
import AIPage from "./pages/AIPage";
import CalendarPage from "./pages/CalendarPage";
import GithubPage from "./pages/GithubPage";
import NewsPage from "./pages/NewsPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SettingsPage from "./pages/SettingsPage";
import TasksPage from "./pages/TasksPage";
import { startScheduler, useNow } from "./services/scheduler";
import { setSettings, useStore } from "./store";
import { buildTheme, isDark, paletteFromPixels, wallpaperCss } from "./theme";
import type { PageKey, Settings } from "./types";
import { dayInfo, holidayText, WEEK } from "./utils";
import { seedLibrary } from "./wallpapers";
import { NavContext } from "./widgets/common";

const PAGES: { key: PageKey; name: string; icon: IconName; color: string }[] = [
  { key: "notes", name: "备忘录", icon: "notes", color: "var(--c-notes)" },
  { key: "calendar", name: "日历", icon: "calendar", color: "var(--c-calendar)" },
  { key: "tasks", name: "待办", icon: "tasks", color: "var(--c-tasks)" },
  { key: "projects", name: "项目", icon: "project", color: "var(--c-project)" },
  { key: "ai", name: "AI 额度", icon: "ai", color: "var(--c-ai)" },
  { key: "news", name: "资讯", icon: "news", color: "var(--c-news)" },
  { key: "github", name: "GitHub", icon: "github", color: "var(--c-github)" },
  { key: "settings", name: "设置", icon: "settings", color: "var(--c-settings)" },
];

function PageView({ page, arg }: { page: PageKey; arg?: string }) {
  switch (page) {
    case "notes":
      return <NotesPage arg={arg} />;
    case "calendar":
      return <CalendarPage arg={arg} />;
    case "tasks":
      return <TasksPage />;
    case "projects":
      return <ProjectsPage arg={arg} />;
    case "ai":
      return <AIPage />;
    case "news":
      return <NewsPage arg={arg} />;
    case "github":
      return <GithubPage />;
    case "settings":
      return <SettingsPage />;
  }
}

async function fileUrl(file: string) {
  if (!isTauri) return file;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(file);
}

function Wallpaper({ s }: { s: Settings }) {
  const bg = s.background;
  const [url, setUrl] = useState("");
  const sampled = useRef("");
  useEffect(() => {
    if (bg.file) fileUrl(bg.file).then(setUrl);
    else setUrl("");
  }, [bg.file]);

  // 视频壁纸没法在后端取色，就在前端截一帧来算
  useEffect(() => {
    if (bg.kind === "video" && url && !bg.palette && sampled.current !== url) {
      sampled.current = url;
      const file = bg.file;
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.src = url;
      v.addEventListener("loadeddata", () => (v.currentTime = Math.min(1, (v.duration || 3) / 3)));
      v.addEventListener("seeked", () => {
        try {
          const c = document.createElement("canvas");
          c.width = 96;
          c.height = 54;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(v, 0, 0, 96, 54);
          setSettings({ background: { ...bg, file, palette: paletteFromPixels(ctx.getImageData(0, 0, 96, 54).data) } });
        } catch (e) {
          console.warn("视频取色失败，使用默认配色", e);
        }
      });
    }
  }, [bg, url]);

  if (bg.kind === "transparent") return null;
  const media: React.CSSProperties = { filter: s.blur ? `blur(${s.blur}px)` : undefined, transform: s.blur ? "scale(1.06)" : undefined };
  return (
    <div className="wallpaper">
      {bg.kind === "preset" && <div className="wall-media" style={{ background: wallpaperCss(s), ...media }} />}
      {bg.kind === "image" && url && <img className="wall-media" src={url} style={media} alt="" />}
      {bg.kind === "video" && url && <video className="wall-media" src={url} style={media} autoPlay loop muted playsInline />}
      {bg.kind === "scene" && <SceneWall bg={bg} motion={s.sceneMotion} parallax={s.sceneParallax} blur={s.blur} />}
      <div className="wall-dim" style={{ opacity: s.dim }} />
    </div>
  );
}

function TitleBar({ editing, setEditing, onAdd }: { editing: boolean; setEditing: (v: boolean) => void; onAdd: () => void }) {
  const now = useNow(30_000);
  const info = dayInfo(now);
  const winAction = async (a: "min" | "max" | "hide") => {
    const w = await currentWindow();
    if (!w) return;
    if (a === "min") call("minimize_main"); // 挂件模式下会改为隐藏到托盘
    else if (a === "max") w.toggleMaximize();
    else w.hide();
  };
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        <b data-tauri-drag-region>
          {now.getMonth() + 1}月{now.getDate()}日 星期{WEEK[now.getDay()]}
        </b>
        <span data-tauri-drag-region>
          农历{info.lunarFull}
          {holidayText(info.holiday) ? ` · ${holidayText(info.holiday)}` : info.festival ? ` · ${info.festival}` : ""}
        </span>
      </div>
      <div className="tb-right">
        {editing && (
          <button className="pill" onClick={onAdd}>
            <Icon name="plus" size={14} stroke={2.4} /> 添加
          </button>
        )}
        <button className={"pill" + (editing ? " primary" : "")} onClick={() => setEditing(!editing)} title="也可以右键小组件，或长按小组件进入编辑">
          {editing ? "完成" : <><Icon name="grid" size={14} /> 编辑</>}
        </button>
        {isTauri && (
          <div className="win-btns">
            <button onClick={() => winAction("min")} title="最小化">
              <Icon name="minus" size={14} />
            </button>
            <button onClick={() => winAction("max")} title="最大化">
              <Icon name="square" size={12} />
            </button>
            <button className="close" onClick={() => winAction("hide")} title="隐藏到托盘">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default function App() {
  const settings = useStore((s) => s.settings);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState<{ key: PageKey; arg?: string } | null>(null);
  const nav = useMemo(() => ({ open: (key: PageKey, arg?: string) => setPage({ key, arg }) }), []);

  useEffect(() => startScheduler(), []);

  // 调整窗口大小期间暂停壁纸动效和布局动画，减轻重绘压力
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      document.documentElement.classList.add("resizing");
      window.clearTimeout(t);
      t = window.setTimeout(() => document.documentElement.classList.remove("resizing"), 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    seedLibrary();
  }, []);

  // 主题：从壁纸配色生成整套颜色变量
  useEffect(() => {
    const vars = buildTheme(settings);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.theme = isDark(settings) ? "dark" : "light";
    root.classList.toggle("transparent", settings.background.kind === "transparent");
  }, [settings]);

  useEffect(() => {
    applyFont(settings);
  }, [settings.font, settings.customFont]);

  // 窗口层级：桌面挂件模式 / 置顶
  useEffect(() => {
    currentWindow().then((w) => {
      if (!w) return;
      call("set_desktop_mode", { enabled: settings.desktopMode });
      w.setAlwaysOnTop(!settings.desktopMode && settings.alwaysOnTop);
    });
  }, [settings.desktopMode, settings.alwaysOnTop]);

  const pageMeta = page && PAGES.find((p) => p.key === page.key)!;

  return (
    <NavContext.Provider value={nav}>
      <Wallpaper s={settings} />
      <div className={"app" + (editing ? " is-editing" : "")}>
        <TitleBar editing={editing} setEditing={setEditing} onAdd={() => setAdding(true)} />
        <main className="board-wrap">
          <Board editing={editing} setEditing={setEditing} onAdd={() => setAdding(true)} />
        </main>
        {settings.showDock && (
          <nav className="dock-row">
            <div className="dock">
              {PAGES.map((p) => (
                <button key={p.key} className="dock-item" title={p.name} onClick={() => setPage({ key: p.key })}>
                  <span className="dock-ic" style={{ "--ic": p.color } as React.CSSProperties}>
                    <Icon name={p.icon} size={22} stroke={1.9} />
                  </span>
                  <small>{p.name}</small>
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>
      {adding && <AddWidgetSheet onClose={() => setAdding(false)} />}
      {page && pageMeta && (
        <Sheet
          title={
            <>
              <span className="dock-ic sm" style={{ "--ic": pageMeta.color } as React.CSSProperties}>
                <Icon name={pageMeta.icon} size={16} stroke={2} />
              </span>
              {pageMeta.name}
            </>
          }
          onClose={() => setPage(null)}
        >
          <PageView key={page.key + (page.arg ?? "")} page={page.key} arg={page.arg} />
        </Sheet>
      )}
      <FeedReader />
    </NavContext.Provider>
  );
}
