import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { assetUrl, loadScene, motionOf, type SceneDesc } from "../scene";
import { getState, setSettings } from "../store";
import type { Background } from "../types";

/** 把 Wallpaper Engine 场景的图层按原始画布叠起来，等比铺满窗口 */
export default function SceneWall({ bg, motion, parallax, blur }: { bg: Background; motion: boolean; parallax: boolean; blur: number }) {
  const [desc, setDesc] = useState<SceneDesc | null>(null);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(0);
  const [box, setBox] = useState({ w: window.innerWidth, h: window.innerHeight });
  const stage = useRef<HTMLDivElement>(null);
  const propsKey = JSON.stringify(bg.props ?? {});

  useEffect(() => {
    if (!bg.dir) return;
    let alive = true;
    loadScene(bg.dir, bg.props ?? {})
      .then(async (d) => {
        const u: Record<number, string> = {};
        for (const l of d.layers) u[l.id] = await assetUrl(l.file);
        if (!alive) return;
        setLoaded(0);
        setUrls(u);
        setDesc(d);
        setError("");
        // 切换主题后按新画面重新取色
        const cur = getState().settings.background;
        if (d.palette && cur.kind === "scene" && cur.palette?.colors[0]?.hex !== d.palette.colors[0]?.hex) {
          setSettings({ background: { ...cur, palette: d.palette } });
        }
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [bg.dir, propsKey]);

  useLayoutEffect(() => {
    const onResize = () => setBox({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 鼠标视差：只改 CSS 变量，不触发重新渲染
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    if (!parallax) {
      el.style.setProperty("--mx", "0");
      el.style.setProperty("--my", "0");
      return;
    }
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", String((e.clientX / window.innerWidth) * 2 - 1));
        el.style.setProperty("--my", String((e.clientY / window.innerHeight) * 2 - 1));
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [parallax, desc]);

  if (error) return <div className="scene-error">场景壁纸加载失败：{error}</div>;
  if (!desc) return null;

  // cover：取较大的缩放比，居中裁切；开视差时多放大一点，避免边缘露底
  const k = Math.max(box.w / desc.width, box.h / desc.height) * (parallax ? 1.04 : 1);
  const ox = (box.w - desc.width * k) / 2;
  const oy = (box.h - desc.height * k) / 2;
  const n = desc.layers.length;

  return (
    <div
      ref={stage}
      className={"scene-stage" + (motion ? " moving" : "") + (loaded >= n ? " ready" : "")}
      style={{
        width: desc.width,
        height: desc.height,
        background: desc.clear,
        transform: `translate(${ox}px, ${oy}px) scale(${k})`,
        filter: blur ? `blur(${blur / k}px)` : undefined,
      }}
    >
      {desc.layers.map((l, i) => {
        // 越靠前（后画）的图层视差越大，形成景深
        const depth = parallax ? 6 + (i / Math.max(1, n - 1)) * 34 : 0;
        const anim = motionOf(l);
        return (
          <div
            key={l.id}
            className="scene-layer"
            style={{
              width: l.w,
              height: l.h,
              opacity: l.alpha,
              mixBlendMode: l.blend === "additive" ? "plus-lighter" : undefined,
              transform: `translate(calc(var(--mx, 0) * ${-depth}px), calc(var(--my, 0) * ${-depth}px)) matrix(${l.m.join(",")})`,
            }}
          >
            <img className={anim} src={urls[l.id]} alt="" draggable={false} onLoad={() => setLoaded((c) => c + 1)} onError={() => setLoaded((c) => c + 1)} style={{ animationDelay: `${-(l.id % 7) * 0.9}s` }} />
          </div>
        );
      })}
    </div>
  );
}
