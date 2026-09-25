import { useEffect, useState } from "react";
import { call, isTauri } from "../api";
import { FONTS, loadAllFonts, schemeOf } from "../fonts";
import { Icon } from "../icons";
import { setSettings, useStore } from "../store";
import { currentPalette, PRESETS } from "../theme";
import type { Background, Palette } from "../types";

interface Imported {
  kind: Background["kind"];
  file?: string;
  palette?: Palette;
  title?: string;
  note?: string;
}

const IMG_EXT = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];
const VIDEO_EXT = ["mp4", "webm", "m4v", "mov"];

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="set-row">
      <b>{label}</b>
      <span className="row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="muted small slider-val">{fmt(value)}</span>
      </span>
    </label>
  );
}

function FontSection() {
  const s = useStore((x) => x.settings);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    loadAllFonts().then(() => setReady(true));
  }, []);

  const importFont = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: [{ name: "字体", extensions: ["ttf", "otf", "woff", "woff2"] }] });
    if (!path) return;
    try {
      const f = await call<{ file: string; name: string }>("import_font", { path });
      setSettings({ font: "custom", customFont: f });
      setMsg("");
    } catch (e) {
      setMsg(String(e));
    }
  };

  const cards = [...FONTS.map((f) => ({ id: f.id, name: f.name, desc: f.desc, ui: f.ui, display: f.display }))];
  if (s.customFont) {
    const c = schemeOf({ ...s, font: "custom" });
    cards.push({ id: "custom", name: s.customFont.name, desc: "导入的字体", ui: c.ui, display: c.display });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h4>字体</h4>
        <span className="muted small">{ready ? "点击即可应用，整个看板实时切换" : "字体加载中…"}</span>
      </div>
      <div className="font-grid">
        {cards.map((f) => (
          <button key={f.id} className={"font-card" + (s.font === f.id ? " on" : "")} onClick={() => setSettings({ font: f.id })}>
            <div className="font-sample-time" style={{ fontFamily: f.display }}>
              15:40
            </div>
            <div className="font-sample" style={{ fontFamily: f.ui }}>
              九月廿五 · 中秋节快乐
            </div>
            <div className="font-sample small" style={{ fontFamily: f.ui }}>
              今日待办 3 项 · DeepSeek ¥110.00
            </div>
            <div className="font-name">
              <b>{f.name}</b>
              <span className="muted tiny">{f.desc}</span>
            </div>
          </button>
        ))}
        {isTauri && (
          <button className="font-card add" onClick={importFont}>
            <Icon name="plus" size={26} />
            <b>导入字体文件</b>
            <span className="muted tiny">.ttf / .otf，用你自己喜欢的字体</span>
          </button>
        )}
      </div>
      {msg && <div className="err">{msg}</div>}
    </div>
  );
}

function AppearanceSection() {
  const s = useStore((x) => x.settings);
  const bg = s.background;
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const palette = currentPalette(s);

  const doImport = async (directory: boolean) => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open(
      directory
        ? { directory: true, title: "选择 Wallpaper Engine 壁纸文件夹（workshop\\content\\431960\\ 下的数字文件夹）" }
        : { multiple: false, filters: [{ name: "图片或视频", extensions: [...IMG_EXT, ...VIDEO_EXT] }] },
    );
    if (!path) return;
    setBusy(true);
    try {
      const r = await call<Imported>("import_wallpaper", { path });
      setSettings({
        background: { kind: r.kind, file: r.file, palette: r.palette, title: r.title },
        accent: undefined,
        ...(r.kind === "transparent" ? { desktopMode: true } : {}),
      });
      setMsg(r.note ? { text: r.note } : { text: `已应用${r.title ? "「" + r.title + "」" : ""}，配色已根据壁纸自动生成。` });
    } catch (e) {
      setMsg({ text: String(e), err: true });
    }
    setBusy(false);
  };

  return (
    <div className="card">
      <h4>壁纸</h4>
      <div className="wp-pick">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button
            key={k}
            className={"wp-thumb" + (bg.kind === "preset" && bg.preset === k ? " on" : "")}
            style={{ background: p.css }}
            onClick={() => setSettings({ background: { kind: "preset", preset: k }, accent: undefined })}
          >
            <span>{p.name}</span>
          </button>
        ))}
        <button
          className={"wp-thumb transparent-thumb" + (bg.kind === "transparent" ? " on" : "")}
          onClick={() => setSettings({ background: { kind: "transparent", palette: bg.kind === "transparent" ? bg.palette : undefined }, accent: undefined })}
          title="窗口透明，直接显示桌面或 Wallpaper Engine 动态壁纸"
        >
          <span>透明</span>
        </button>
        {(bg.kind === "image" || bg.kind === "video") && (
          <div className="wp-thumb on custom-thumb">
            <span>{bg.title ?? (bg.kind === "video" ? "自定义视频" : "自定义图片")}</span>
          </div>
        )}
      </div>
      <div className="row wrap">
        <button className="btn primary" disabled={!isTauri || busy} onClick={() => doImport(false)}>
          <Icon name="image" size={15} /> 导入图片 / 视频
        </button>
        <button className="btn" disabled={!isTauri || busy} onClick={() => doImport(true)}>
          导入 Wallpaper Engine 壁纸
        </button>
        {busy && <span className="muted small">正在分析配色…</span>}
      </div>
      {msg && <div className={msg.err ? "err" : "note"}>{msg.text}</div>}
      <p className="muted tiny">
        Wallpaper Engine 的「视频」壁纸会直接导入播放；「场景 / 网页」壁纸只能由 Wallpaper Engine 自己渲染，会切换为透明模式浮在它上面，并按预览图配色。
      </p>

      <h4>配色</h4>
      <div className="field">
        <span>强调色（从壁纸中提取，点击指定）</span>
        <div className="swatches big">
          <button className={"swatch auto" + (!s.accent ? " on" : "")} onClick={() => setSettings({ accent: undefined })} title="自动">
            A
          </button>
          {palette.colors.slice(0, 8).map((c) => (
            <button key={c.hex} className={"swatch" + (s.accent === c.hex ? " on" : "")} style={{ background: c.hex }} onClick={() => setSettings({ accent: c.hex })} title={c.hex} />
          ))}
          <label className="swatch picker" title="自定义颜色">
            <input type="color" value={s.accent ?? "#6f5bd6"} onChange={(e) => setSettings({ accent: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="row wrap gap">
        <div className="field">
          <span>明暗</span>
          <div className="seg">
            {(["auto", "light", "dark"] as const).map((t) => (
              <button key={t} className={s.theme === t ? "on" : ""} onClick={() => setSettings({ theme: t })}>
                {{ auto: "跟随壁纸", light: "浅色", dark: "深色" }[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>图标颜色</span>
          <div className="seg">
            <button className={s.iconStyle === "palette" ? "on" : ""} onClick={() => setSettings({ iconStyle: "palette" })}>
              多彩（取自壁纸）
            </button>
            <button className={s.iconStyle === "mono" ? "on" : ""} onClick={() => setSettings({ iconStyle: "mono" })}>
              单色
            </button>
          </div>
        </div>
      </div>

      <h4>显示</h4>
      <Slider label="小组件不透明度" value={s.glass} min={0.3} max={1} step={0.02} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setSettings({ glass: v })} />
      {bg.kind !== "transparent" && (
        <>
          <Slider label="壁纸暗化" value={s.dim} min={0} max={0.6} step={0.02} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setSettings({ dim: v })} />
          <Slider label="壁纸模糊" value={s.blur} min={0} max={24} step={1} fmt={(v) => `${v}px`} onChange={(v) => setSettings({ blur: v })} />
        </>
      )}
      <Slider label="小组件大小" value={s.cellSize} min={120} max={230} step={5} fmt={(v) => `${v}px`} onChange={(v) => setSettings({ cellSize: v })} />
    </div>
  );
}

export default function SettingsPage() {
  const s = useStore((x) => x.settings);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [dir, setDir] = useState("");

  useEffect(() => {
    if (!isTauri) return;
    import("@tauri-apps/plugin-autostart").then((m) => m.isEnabled().then(setAutostart));
    call<string>("data_dir").then(setDir);
  }, []);

  const toggleAutostart = async () => {
    const m = await import("@tauri-apps/plugin-autostart");
    if (await m.isEnabled()) await m.disable();
    else await m.enable();
    setAutostart(await m.isEnabled());
  };

  const reveal = async () => {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    revealItemInDir(dir + "\\data.json");
  };

  return (
    <div className="settings">
      <AppearanceSection />
      <FontSection />

      <div className="card">
        <h4>窗口</h4>
        <label className="set-row">
          <div>
            <b>桌面挂件模式</b>
            <div className="muted small">窗口固定在桌面最底层，不显示在任务栏；从托盘图标唤出</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={s.desktopMode} onChange={() => setSettings({ desktopMode: !s.desktopMode })} />
            <span />
          </span>
        </label>
        <label className="set-row">
          <div>
            <b>窗口置顶</b>
            <div className="muted small">始终显示在其他窗口之上（与桌面挂件模式互斥）</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={s.alwaysOnTop} disabled={s.desktopMode} onChange={() => setSettings({ alwaysOnTop: !s.alwaysOnTop })} />
            <span />
          </span>
        </label>
        <label className="set-row">
          <div>
            <b>显示底部 Dock</b>
            <div className="muted small">关闭后可右键空白处或点小组件进入各页面</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={s.showDock} onChange={() => setSettings({ showDock: !s.showDock })} />
            <span />
          </span>
        </label>
        <label className="set-row">
          <div>
            <b>开机自启动</b>
            <div className="muted small">登录 Windows 后自动打开桌面看板</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={!!autostart} disabled={autostart === null} onChange={toggleAutostart} />
            <span />
          </span>
        </label>
      </div>

      <div className="card">
        <h4>自动刷新</h4>
        <label className="set-row">
          <b>AI 额度刷新间隔</b>
          <select className="input" value={s.aiRefreshMin} onChange={(e) => setSettings({ aiRefreshMin: Number(e.target.value) })}>
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} 分钟
              </option>
            ))}
          </select>
        </label>
        <label className="set-row">
          <b>资讯刷新间隔</b>
          <select className="input" value={s.feedRefreshMin} onChange={(e) => setSettings({ feedRefreshMin: Number(e.target.value) })}>
            {[15, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n} 分钟
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        <h4>数据</h4>
        <p className="muted small">
          所有数据保存在本机 <code>{dir || "（桌面端可见）"}\data.json</code>，复制这个文件即可备份。API Key 单独保存在 Windows 凭据管理器中，不写入该文件。
        </p>
        {isTauri && (
          <button className="btn" onClick={reveal}>
            打开数据目录
          </button>
        )}
      </div>
    </div>
  );
}
