import { useState } from "react";
import { Icon } from "../icons";
import { freeSpot, gridState } from "../layout";
import { setState } from "../store";
import type { WidgetInst, WidgetSize } from "../types";
import { uid } from "../utils";
import { SIZE_LABEL, SIZE_SPAN, WIDGETS, type WidgetDef } from "../widgets/registry";
import Sheet from "./Sheet";

const CELL = 140;
const GAP = 14;

export default function AddWidgetSheet({ onClose }: { onClose: () => void }) {
  const [def, setDef] = useState<WidgetDef>(WIDGETS[0]);
  const [size, setSize] = useState<WidgetSize>(WIDGETS[0].sizes[0]);

  const pick = (d: WidgetDef) => {
    setDef(d);
    setSize(d.sizes.includes(size) ? size : d.sizes[0]);
  };

  const preview: WidgetInst = { id: "preview", type: def.type, size, config: {} };
  const [cw, ch] = SIZE_SPAN[size];

  const add = () => {
    setState((s) => {
      const w: WidgetInst = { id: uid(), type: def.type, size, config: {}, ...freeSpot(s.widgets, size, gridState.cols) };
      return { ...s, widgets: [...s.widgets, w] };
    });
    onClose();
  };

  return (
    <Sheet title="添加小组件" onClose={onClose} size="lg">
      <div className="gallery">
        <div className="gallery-list">
          {WIDGETS.map((d) => (
            <button key={d.type} className={"gallery-item" + (d.type === def.type ? " on" : "")} onClick={() => pick(d)}>
              <span className="gallery-ic" style={{ background: d.color }}>
                <Icon name={d.icon} size={20} stroke={2} />
              </span>
              <span>
                <b>{d.name}</b>
                <small>{d.desc}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="gallery-preview">
          <div className="seg">
            {def.sizes.map((s) => (
              <button key={s} className={s === size ? "on" : ""} onClick={() => setSize(s)}>
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="gallery-stage">
            <div
              className={`widget size-${size} preview`}
              style={{ width: cw * CELL + (cw - 1) * GAP, height: ch * CELL + (ch - 1) * GAP }}
            >
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
