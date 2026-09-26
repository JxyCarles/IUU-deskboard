import { useMemo, useState } from "react";
import { Icon } from "../icons";
import { freeSpot, gridState } from "../layout";
import { setState, useStore } from "../store";
import type { WidgetInst, WidgetSize } from "../types";
import { uid } from "../utils";
import { useNav } from "../widgets/common";
import { SIZE_LABEL, SIZE_SPAN, WIDGETS, widgetDefOf, type WidgetDef } from "../widgets/registry";
import Sheet from "./Sheet";

const CELL = 140;
const GAP = 14;

/** 可添加的选项：内置小组件 + 创造台里安装的自定义小组件 */
interface Option {
  key: string;
  def: WidgetDef;
  config: Record<string, string>;
}

export default function AddWidgetSheet({ onClose }: { onClose: () => void }) {
  const specs = useStore((s) => s.customWidgets);
  const nav = useNav();
  const options = useMemo<Option[]>(
    () => [
      ...WIDGETS.map((d) => ({ key: d.type, def: d, config: {} })),
      ...specs.map((sp) => ({ key: "custom:" + sp.id, def: widgetDefOf({ type: "custom", config: { specId: sp.id } }), config: { specId: sp.id } })),
    ],
    [specs],
  );
  const [key, setKey] = useState(options[0].key);
  const opt = options.find((o) => o.key === key) ?? options[0];
  const def = opt.def;
  const [size, setSize] = useState<WidgetSize>(def.sizes[0]);
  const curSize = def.sizes.includes(size) ? size : def.sizes[0];

  const preview: WidgetInst = { id: "preview", type: def.type, size: curSize, config: opt.config };
  const [cw, ch] = SIZE_SPAN[curSize];

  const add = () => {
    setState((s) => {
      const w: WidgetInst = { id: uid(), type: def.type, size: curSize, config: { ...opt.config }, ...freeSpot(s.widgets, curSize, gridState.cols) };
      return { ...s, widgets: [...s.widgets, w] };
    });
    onClose();
  };

  const item = (o: Option) => (
    <button key={o.key} className={"gallery-item" + (o.key === opt.key ? " on" : "")} onClick={() => setKey(o.key)}>
      <span className="gallery-ic" style={{ background: o.def.color }}>
        <Icon name={o.def.icon} size={20} stroke={2} />
      </span>
      <span>
        <b>{o.def.name}</b>
        <small>{o.def.desc}</small>
      </span>
    </button>
  );

  return (
    <Sheet title="添加小组件" onClose={onClose} size="lg">
      <div className="gallery">
        <div className="gallery-list">
          {options.filter((o) => o.def.type !== "custom").map(item)}
          <div className="gallery-group">
            自定义小组件
            <button
              className="btn sm"
              onClick={() => {
                onClose();
                nav.open("studio", "widgets");
              }}
            >
              去创造台制作
            </button>
          </div>
          {options.filter((o) => o.def.type === "custom").map(item)}
          {specs.length === 0 && <div className="muted small pad">还没有。可以在创造台里用 JSON 或 AI 制作。</div>}
        </div>
        <div className="gallery-preview">
          <div className="seg">
            {def.sizes.map((s) => (
              <button key={s} className={s === curSize ? "on" : ""} onClick={() => setSize(s)}>
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="gallery-stage">
            <div className={`widget size-${curSize} preview`} style={{ width: cw * CELL + (cw - 1) * GAP, height: ch * CELL + (ch - 1) * GAP }}>
              <div className="widget-inner">
                <def.Component w={preview} />
              </div>
            </div>
          </div>
          <p className="muted small center">{def.desc}</p>
          <button className="btn primary big" onClick={add}>
            ＋ 添加小组件
          </button>
        </div>
      </div>
    </Sheet>
  );
}
