import { useEffect, useState } from "react";
import { call, isTauri, openUrl } from "../api";
import { FONTS, loadAllFonts, schemeOf } from "../fonts";
import { Icon } from "../icons";
import { AI_PROVIDERS, aiText } from "../services/ai";
import { checkUpdate, hasUpdate, RELEASES_URL, useUpdate } from "../services/update";
import { flushSave, setSettings, useStore } from "../store";
import type { AISettings } from "../types";
import { assetUrl, loadScene, type SceneProp } from "../scene";
import { currentPalette, PRESETS } from "../theme";
import { applyWallpaper, importToLibrary, removeFromLibrary, updateBackground } from "../wallpapers";
import type { Background } from "../types";

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

function LibraryThumb({ e, on }: { e: Background; on: boolean }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (e.thumb) assetUrl(e.thumb).then(setSrc);
  }, [e.thumb]);
  const label = e.title ?? (e.kind === "video" ? "自定义视频" : e.kind === "scene" ? "场景壁纸" : "自定义图片");
  return (
    <div className={"wp-thumb lib-thumb" + (on ? " on" : "")} title={label} onClick={() => applyWallpaper(e)}>
      {src ? <img src={src} alt="" /> : <div className="lib-fallback" />}
      {e.kind === "scene" && <i className="lib-badge">场景</i>}
      {e.kind === "video" && <i className="lib-badge">视频</i>}
      <span>{label}</span>
      <button
        className="lib-del"
        title="从壁纸选项中移除"
        onClick={(ev) => {
          ev.stopPropagation();
          removeFromLibrary(e.id!);
        }}
      >
        ×
      </button>
    </div>
  );
}

/** 透明窗口只能在创建时决定：切换到 / 离开“透明”壁纸后提示重启 */
function RestartHint({ transparent }: { transparent: boolean }) {
  const [win, setWin] = useState<boolean | null>(null);
  useEffect(() => {
    if (isTauri) call<boolean>("is_transparent_window").then(setWin);
  }, []);
  if (win === null || win === transparent) return null;
  return (
    <div className="note row between">
      <span>{transparent ? "透明壁纸需要重启程序后生效。" : "已切换为普通壁纸，重启后窗口恢复为不透明（调整大小更流畅）。"}</span>
      <button
        className="btn primary sm"
        onClick={async () => {
          await flushSave();
          call("restart_app");
        }}
      >
        立即重启
      </button>
    </div>
  );
}

function SceneSection() {
  const s = useStore((x) => x.settings);
  const bg = s.background;
  const [props, setProps] = useState<SceneProp[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!bg.dir) return;
    loadScene(bg.dir, bg.props ?? {})
      .then((d) => setProps(d.props))
      .catch((e) => setErr(String(e)));
  }, [bg.dir, JSON.stringify(bg.props ?? {})]);

  const setProp = (k: string, v: string | boolean) => updateBackground({ props: { ...(bg.props ?? {}), [k]: v } });

  return (
    <div className="scene-box">
      <div className="muted small">场景壁纸：{bg.title}</div>
      {err && <div className="err">{err}</div>}
      {props.map((p) =>
        p.kind === "combo" ? (
          <div key={p.key} className="set-row">
            <b>{p.label}</b>
            <div className="seg">
              {p.options.map((o) => (
                <button key={o.value} className={String(p.value) === o.value ? "on" : ""} onClick={() => setProp(p.key, o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <label key={p.key} className="set-row">
            <b>{p.label}</b>
            <span className="switch">
              <input type="checkbox" checked={p.value === true || p.value === "1" || p.value === "true"} onChange={(e) => setProp(p.key, e.target.checked)} />
              <span />
            </span>
          </label>
        ),
      )}
      <label className="set-row">
        <div>
          <b>动效</b>
          <div className="muted small">给头发、藤蔓、气泡、眼泪加上轻微的摆动和漂浮</div>
        </div>
        <span className="switch">
          <input type="checkbox" checked={s.sceneMotion} onChange={() => setSettings({ sceneMotion: !s.sceneMotion })} />
          <span />
        </span>
      </label>
      <label className="set-row">
        <div>
          <b>鼠标视差</b>
          <div className="muted small">移动鼠标时图层有前后景深的错位</div>
        </div>
        <span className="switch">
          <input type="checkbox" checked={s.sceneParallax} onChange={() => setSettings({ sceneParallax: !s.sceneParallax })} />
          <span />
        </span>
      </label>
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
      const { entry: r, note } = await importToLibrary(path);
      applyWallpaper(r);
      setMsg(
        note
          ? { text: note }
          : { text: `已加入壁纸选项并应用${r.title ? "「" + r.title + "」" : ""}，配色已根据壁纸自动生成。${r.kind === "scene" ? "下面可以切换它的主题和开关。" : ""}` },
      );
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
            className={"wp-thumb" + (p.palette.luminance > 0.6 ? " light" : "") + (bg.kind === "preset" && bg.preset === k ? " on" : "")}
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
        {s.library.map((e) => (
          <LibraryThumb key={e.id} e={e} on={bg.id === e.id} />
        ))}
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
        Wallpaper Engine 壁纸：选 workshop\content\431960\ 下的数字文件夹。「视频」类型直接播放；「场景」类型会读取它的图层还原成壁纸（粒子、着色器特效等无法还原，用近似动效代替）；「网页」类型切换为透明模式。
      </p>
      {bg.kind === "scene" && <SceneSection />}
      <RestartHint transparent={bg.kind === "transparent"} />

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

/** 窗口大小会在调整后自动记住；这里可以一键回到默认大小 */
function WindowSizeRow() {
  const [size, setSize] = useState<[number, number] | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (isTauri) call<[number, number]>("default_window_size").then(setSize);
  }, []);
  if (!isTauri) return null;
  return (
    <div className="set-row">
      <div>
        <b>窗口大小</b>
        <div className="muted small">调整或移动窗口后会自动记住，下次启动按上次的大小和位置打开</div>
      </div>
      <button
        className="btn"
        onClick={async () => {
          await call("reset_window_size");
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? "已恢复" : `恢复默认大小${size ? `（${size[0]}×${size[1]}）` : ""}`}
      </button>
    </div>
  );
}

/** AI 简报：关注方向、自动生成 */
function BriefSettings() {
  const b = useStore((s) => s.settings.brief);
  const set = (p: Partial<typeof b>) => setSettings({ brief: { ...b, ...p } });
  return (
    <>
      <label className="field">
        <span>我关注的方向（资讯和 GitHub 简报会优先整理这些内容）</span>
        <textarea
          className="input"
          rows={2}
          placeholder="例如：AI Agent、开源大模型、Rust、前端工程化、桌面应用开发"
          value={b.interests}
          onChange={(e) => set({ interests: e.target.value })}
        />
      </label>
      <label className="set-row">
        <div>
          <b>自动生成简报</b>
          <div className="muted small">资讯或 GitHub 热门更新后，简报过期就自动整理一次（每次花费不到一分钱）</div>
        </div>
        <span className="row">
          <select className="input" value={b.hours} disabled={!b.auto} onChange={(e) => set({ hours: Number(e.target.value) })}>
            {[1, 3, 6, 12, 24].map((h) => (
              <option key={h} value={h}>
                每 {h} 小时
              </option>
            ))}
          </select>
          <span className="switch">
            <input type="checkbox" checked={b.auto} onChange={() => set({ auto: !b.auto })} />
            <span />
          </span>
        </span>
      </label>
    </>
  );
}

/** 创造台里「AI 整理」「AI 生成小组件」用哪个 AI */
function AISection() {
  const ai = useStore((s) => s.settings.ai);
  const meta = AI_PROVIDERS[ai.provider];
  const needsOwnKey = ai.provider === "claude" || ai.provider === "custom";
  const secret = ai.provider === "claude" ? "ai:claude" : "ai:custom";
  const [has, setHas] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [test, setTest] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTest(null);
    const name = ai.provider === "deepseek" ? "provider:deepseek" : ai.provider === "glm" ? "provider:glm" : secret;
    if (isTauri) call<boolean>("has_secret", { name }).then(setHas);
  }, [ai.provider]);

  const set = (p: Partial<AISettings>) => setSettings({ ai: { ...ai, ...p } });
  const saveKey = async () => {
    await call("set_secret", { name: secret, value: key });
    setHas(!!key.trim());
    setKey("");
  };
  const runTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      const t = await aiText('只输出 JSON：{"ok": true, "model": "你的模型名"}', "测试连接", true);
      setTest({ text: "连接成功：" + t.slice(0, 120) });
    } catch (e) {
      setTest({ text: String(e instanceof Error ? e.message : e), err: true });
    }
    setBusy(false);
  };

  return (
    <div className="card">
      <h4>AI 服务</h4>
      <p className="muted small">用于资讯 / GitHub 的 AI 简报，以及创造台的「AI 整理」「AI 生成小组件」。</p>
      <div className="seg">
        {(Object.keys(AI_PROVIDERS) as AISettings["provider"][]).map((p) => (
          <button key={p} className={ai.provider === p ? "on" : ""} onClick={() => setSettings({ ai: { provider: p, baseUrl: ai.baseUrl } })}>
            {AI_PROVIDERS[p].name}
          </button>
        ))}
      </div>
      <div className="muted small">
        {meta.keyFrom}
        {!needsOwnKey && has === false && <b className="warn"> · 还没有保存 Key</b>}
        {!needsOwnKey && has && <b className="ok"> · Key 已保存</b>}
      </div>
      {ai.provider === "custom" && (
        <label className="field">
          <span>接口地址（到 /v1 为止，不含 /chat/completions）</span>
          <input className="input" placeholder="https://api.openai.com/v1" value={ai.baseUrl ?? ""} onChange={(e) => set({ baseUrl: e.target.value })} />
        </label>
      )}
      <label className="field">
        <span>模型{meta.defaultModel ? `（留空使用 ${meta.defaultModel}）` : ""}</span>
        <input className="input" placeholder={meta.defaultModel || "例如 gpt-5、qwen-max"} value={ai.model ?? ""} onChange={(e) => set({ model: e.target.value })} />
      </label>
      {needsOwnKey && (
        <div className="field">
          <span>
            API Key {has ? <b className="ok">● 已保存</b> : <b className="warn">● 未填写</b>}
          </span>
          <div className="row">
            <input type="password" className="input grow" placeholder="保存在 Windows 凭据管理器" value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="btn" disabled={!key} onClick={saveKey}>
              保存
            </button>
          </div>
        </div>
      )}
      <BriefSettings />
      <div className="row">
        <button className="btn" disabled={busy || !isTauri} onClick={runTest}>
          {busy ? "测试中…" : "测试连接"}
        </button>
        {test && <span className={test.err ? "err" : "ok small"}>{test.text}</span>}
      </div>
    </div>
  );
}

function AboutSection() {
  const u = useUpdate();
  useEffect(() => {
    if (isTauri && !u.checkedAt) checkUpdate();
  }, []);
  const status = u.checking
    ? "正在检查…"
    : u.error
      ? "检查失败：" + u.error
      : hasUpdate(u)
        ? `发现新版本 ${u.latest}`
        : u.checkedAt
          ? "已是最新版本"
          : "";
  return (
    <div className="card">
      <h4>关于</h4>
      <div className="set-row">
        <div>
          <b>桌面看板 {u.current && "v" + u.current}</b>
          <div className="muted small">{status || "启动时会自动检查新版本"}</div>
          {hasUpdate(u) && <div className="muted small">下载新版安装包后直接双击安装即可覆盖旧版，布局、待办等数据都会保留</div>}
        </div>
        <span className="row">
          {hasUpdate(u) ? (
            <button className="btn primary" onClick={() => openUrl(u.url!)}>
              下载新版本
            </button>
          ) : (
            <button className="btn" disabled={!isTauri || u.checking} onClick={checkUpdate}>
              检查更新
            </button>
          )}
          <button className="btn" onClick={() => openUrl(RELEASES_URL)}>
            发布页
          </button>
        </span>
      </div>
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
      <AISection />

      <div className="card">
        <h4>窗口</h4>
        <WindowSizeRow />
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

      <AboutSection />
    </div>
  );
}
