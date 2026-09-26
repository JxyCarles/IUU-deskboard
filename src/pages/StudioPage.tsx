import { useEffect, useMemo, useState } from "react";
import { call, isTauri } from "../api";
import { freeSpot, gridState } from "../layout";
import { AI_PROVIDERS, aiMakeWidget, aiOrganize, parseJsonLoose, SPEC, specSection } from "../services/ai";
import { installSpec, previewSpec, specExamples, uninstallSpec, validateSpec } from "../services/customWidgets";
import { applyImport, canUndoImport, exportProjects, planImport, planIsEmpty, undoImport, type ImportPlan } from "../services/importer";
import { setState, useStore } from "../store";
import type { CustomItem, WidgetSize, WidgetSpec } from "../types";
import { md, plain, uid } from "../utils";
import { useNav } from "../widgets/common";
import { CustomView } from "../widgets/CustomWidget";

type Tab = "import" | "widgets" | "spec";

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

function AiBadge() {
  const ai = useStore((s) => s.settings.ai);
  const nav = useNav();
  return (
    <span className="muted small">
      AI：{AI_PROVIDERS[ai.provider].name}
      {ai.model ? ` · ${ai.model}` : ""}{" "}
      <button className="link-btn" onClick={() => nav.open("settings")}>
        更换
      </button>
    </span>
  );
}

// ---------------- 导入数据 ----------------

function ImportTab() {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [mode, setMode] = useState<"merge" | "new">("merge");
  const [done, setDone] = useState("");

  const parse = (t = text) => {
    setErr("");
    setDone("");
    try {
      setPlan(planImport(parseJsonLoose(t)));
    } catch (e) {
      setPlan(null);
      setErr("不是有效的 deskboard.import/v1 JSON：" + (e instanceof Error ? e.message : String(e)) + "。如果粘贴的是原始材料，请点「AI 整理」。");
    }
  };

  const organize = async () => {
    if (!text.trim()) return;
    setBusy("AI 正在整理…");
    setErr("");
    setDone("");
    try {
      const out = await aiOrganize(text);
      const json = JSON.stringify(out, null, 2);
      setText(json);
      parse(json);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
    setBusy("");
  };

  const doImport = async () => {
    if (!plan) return;
    await applyImport(plan, mode);
    const n = (l: { dup: boolean }[]) => l.filter((x) => !x.dup).length;
    setDone(
      `已导入：${plan.projects.length} 个项目，${n(plan.tasks)} 条待办，${n(plan.events)} 个日程，${n(plan.notes)} 条备忘录，${n(plan.feeds)} 个资讯源。导入前的数据已备份。`,
    );
    setPlan(null);
    setText("");
  };

  const fresh = <T,>(l: { item: T; dup: boolean }[]) => l.filter((x) => !x.dup);

  return (
    <div className="studio-split">
      <div className="studio-col">
        <div className="row between">
          <b>粘贴 JSON 或原始材料</b>
          <AiBadge />
        </div>
        <textarea
          className="input mono studio-text"
          placeholder={"两种用法：\n1. 粘贴 deskboard.import/v1 JSON，点「解析」\n2. 粘贴会议记录、需求文档、待办清单等任意材料，点「AI 整理」自动转成 JSON\n\n格式说明见「规范」标签页。"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row wrap">
          <button className="btn primary" disabled={!text.trim() || !!busy || !isTauri} onClick={organize}>
            ✨ AI 整理
          </button>
          <button className="btn" disabled={!text.trim() || !!busy} onClick={() => parse()}>
            解析 JSON
          </button>
          <button className="btn" onClick={() => copy(JSON.stringify(exportProjects(), null, 2)).then(() => setDone("已把全部项目以 JSON 复制到剪贴板"))}>
            导出全部项目
          </button>
          {busy && <span className="muted small">{busy}</span>}
        </div>
        {err && <div className="err">{err}</div>}
        {done && (
          <div className="note row between">
            <span>{done}</span>
            {canUndoImport() && (
              <button
                className="btn sm"
                onClick={() => {
                  undoImport();
                  setDone("已撤销上次导入");
                }}
              >
                撤销
              </button>
            )}
          </div>
        )}
      </div>

      <div className="studio-col">
        <b>导入预览</b>
        {!plan && <div className="placeholder small">解析或 AI 整理后，这里会列出将要导入的内容</div>}
        {plan && (
          <div className="plan">
            {planIsEmpty(plan) && <div className="note">没有新内容：全部与现有数据重复。</div>}
            {plan.warnings.length > 0 && (
              <div className="err">
                {plan.warnings.map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            )}
            {plan.projects.length > 0 && (
              <div className="plan-sec">
                <div className="row between">
                  <h4>项目 {plan.projects.length}</h4>
                  {plan.projects.some((p) => p.existing) && (
                    <div className="seg">
                      <button className={mode === "merge" ? "on" : ""} onClick={() => setMode("merge")}>
                        合并到同名项目
                      </button>
                      <button className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>
                        另建新项目
                      </button>
                    </div>
                  )}
                </div>
                {plan.projects.map((p, i) => {
                  const merging = p.existing && mode === "merge";
                  const items = merging ? p.newItems : p.input.items;
                  return (
                    <div key={i} className="plan-card">
                      <div className="row between">
                        <b>
                          {p.input.emoji} {p.input.name}
                        </b>
                        <span className={"plan-tag" + (merging ? " merge" : "")}>{merging ? "合并" : "新建"}</span>
                      </div>
                      {(merging ? p.overview : p.input.overview) && <div className="muted small clamp-2">{plain((merging ? p.overview : p.input.overview) ?? "")}</div>}
                      <div className="plan-items">
                        {(["todo", "doing", "done"] as const).map((st) => {
                          const list = items.filter((x) => x.status === st);
                          return list.length ? (
                            <div key={st}>
                              <small className="muted">{{ todo: "待办", doing: "进行中", done: "已完成" }[st]}</small>
                              {list.map((x) => (
                                <div key={x.id} className="plan-item">
                                  · {x.text}
                                  {x.due && <span className="muted"> （{x.due}）</span>}
                                </div>
                              ))}
                            </div>
                          ) : null;
                        })}
                      </div>
                      <div className="muted tiny">
                        {merging ? `新增 ${p.newItems.length} 项、${p.newLogs.length} 条日志（重复的已跳过）` : `${p.input.items.length} 项、${p.input.logs.length} 条日志`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(
              [
                ["待办", plan.tasks, (t: any) => `${t.title}${t.due ? `（${t.due}）` : ""}`],
                ["日程", plan.events, (e: any) => `${e.date} ${e.start ?? "全天"} ${e.title}`],
                ["备忘录", plan.notes, (n: any) => n.title || "（无标题）"],
                ["资讯源", plan.feeds, (f: any) => `${f.name} · ${f.url}`],
              ] as const
            ).map(([name, list, fmt]) =>
              list.length ? (
                <div key={name} className="plan-sec">
                  <h4>
                    {name} {fresh(list as any[]).length}
                    {list.length > fresh(list as any[]).length && <span className="muted small">（{list.length - fresh(list as any[]).length} 条重复已跳过）</span>}
                  </h4>
                  {(list as { item: unknown; dup: boolean }[]).map((x, i) => (
                    <div key={i} className={"plan-item" + (x.dup ? " dup" : "")}>
                      · {(fmt as (v: unknown) => string)(x.item)}
                    </div>
                  ))}
                </div>
              ) : null,
            )}
            <button className="btn primary big" disabled={planIsEmpty(plan)} onClick={doImport}>
              确认导入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- 小组件工坊 ----------------

const EXAMPLES = specExamples(SPEC);

function SecretInput({ name }: { name: string }) {
  const [val, setVal] = useState("");
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    if (isTauri) call<boolean>("has_secret", { name: "widget:" + name }).then(setHas);
  }, [name]);
  const save = async (v: string) => {
    await call("set_secret", { name: "widget:" + name, value: v });
    setHas(!!v.trim());
    setVal("");
  };
  return (
    <div className="field">
      <span>
        这个小组件需要密钥「{name}」 {has ? <b className="ok">● 已保存</b> : <b className="warn">● 未填写</b>}
      </span>
      <div className="row">
        <input type="password" className="input grow" placeholder="保存在 Windows 凭据管理器，不写进 JSON" value={val} onChange={(e) => setVal(e.target.value)} />
        <button className="btn" disabled={!val} onClick={() => save(val)}>
          保存
        </button>
      </div>
    </div>
  );
}

function WidgetsTab() {
  const specs = useStore((s) => s.customWidgets);
  const [text, setText] = useState("");
  const [desc, setDesc] = useState("");
  const [spec, setSpec] = useState<WidgetSpec | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [items, setItems] = useState<CustomItem[]>([]);
  const [fetchErr, setFetchErr] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [size, setSize] = useState<WidgetSize>("m");

  const check = async (t = text) => {
    setMsg("");
    setFetchErr("");
    setItems([]);
    let raw: unknown;
    try {
      raw = parseJsonLoose(t);
    } catch (e) {
      setSpec(null);
      setErrors(["不是有效的 JSON：" + (e instanceof Error ? e.message : String(e))]);
      return;
    }
    const { spec: sp, errors: errs } = validateSpec(raw);
    setErrors(errs);
    setSpec(sp ?? null);
    if (!sp || !isTauri) return;
    setBusy("正在取数据预览…");
    try {
      setItems(await previewSpec(sp));
    } catch (e) {
      setFetchErr(String(e instanceof Error ? e.message : e));
    }
    setBusy("");
    if (sp.display?.type === "stat") setSize("s");
  };

  const generate = async () => {
    if (!desc.trim()) return;
    setBusy("AI 正在设计小组件…");
    setErrors([]);
    try {
      const out = await aiMakeWidget(desc);
      const json = JSON.stringify(out, null, 2);
      setText(json);
      await check(json);
    } catch (e) {
      setErrors([String(e instanceof Error ? e.message : e)]);
    }
    setBusy("");
  };

  const install = (addToBoard: boolean) => {
    if (!spec) return;
    const updating = specs.some((s) => s.id === spec.id);
    installSpec(spec);
    if (addToBoard) {
      const size: WidgetSize = spec.display?.sizes?.[0] ?? (spec.display?.type === "stat" ? "s" : "m");
      setState((s) => ({ ...s, widgets: [...s.widgets, { id: uid(), type: "custom", size, config: { specId: spec.id }, ...freeSpot(s.widgets, size, gridState.cols) }] }));
    }
    setMsg(`${updating ? "已更新" : "已安装"}「${spec.name}」${addToBoard ? "，并添加到看板" : "，可以在「添加小组件」里找到它"}`);
  };

  const load = (sp: WidgetSpec) => {
    const json = JSON.stringify(sp, null, 2);
    setText(json);
    check(json);
  };

  return (
    <div className="studio-split">
      <div className="studio-col">
        <div className="row between">
          <b>用一句话描述想要的小组件</b>
          <AiBadge />
        </div>
        <div className="row">
          <input
            className="input grow"
            placeholder="例如：显示 Hugging Face 本周最热门的数据集；显示比特币价格；显示北京的天气"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
          />
          <button className="btn primary" disabled={!desc.trim() || !!busy || !isTauri} onClick={generate}>
            ✨ AI 生成
          </button>
        </div>
        <div className="row between">
          <b>或者粘贴 / 编辑 JSON</b>
          <select className="input" value="" onChange={(e) => e.target.value && load(EXAMPLES[Number(e.target.value)])}>
            <option value="">从示例开始…</option>
            {EXAMPLES.map((x, i) => (
              <option key={x.id} value={i}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <textarea className="input mono studio-text" placeholder="deskboard.widget/v1 JSON" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row wrap">
          <button className="btn" disabled={!text.trim() || !!busy} onClick={() => check()}>
            检查并预览
          </button>
          <button className="btn primary" disabled={!spec} onClick={() => install(true)}>
            安装并添加到看板
          </button>
          <button className="btn" disabled={!spec} onClick={() => install(false)}>
            只安装
          </button>
          {busy && <span className="muted small">{busy}</span>}
        </div>
        {errors.length > 0 && (
          <div className="err">
            {errors.map((e, i) => (
              <div key={i}>⚠ {e}</div>
            ))}
          </div>
        )}
        {msg && <div className="note">{msg}</div>}
        {spec?.source.auth && <SecretInput name={spec.source.auth.secret} />}
      </div>

      <div className="studio-col">
        <div className="row between">
          <b>预览</b>
          <div className="seg">
            {(["s", "m", "l"] as WidgetSize[]).map((s) => (
              <button key={s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                {{ s: "小", m: "中", l: "大" }[s as "s" | "m" | "l"]}
              </button>
            ))}
          </div>
        </div>
        <div className="studio-stage">
          {spec ? (
            <div className={`widget size-${size} preview`} style={{ width: size === "s" ? 150 : 316, height: size === "l" ? 316 : 150 }}>
              <div className="widget-inner">
                <CustomView spec={spec} items={items} size={size} error={fetchErr || (isTauri ? undefined : "浏览器预览模式无法取数据")} />
              </div>
            </div>
          ) : (
            <div className="muted small">检查通过后在这里显示效果</div>
          )}
        </div>
        {fetchErr && <div className="err">取数据失败：{fetchErr}</div>}
        {spec && items.length > 0 && <div className="muted tiny">取到 {items.length} 条数据</div>}

        <b>已安装 {specs.length}</b>
        <div className="installed">
          {specs.length === 0 && <div className="muted small">还没有</div>}
          {specs.map((sp) => (
            <div key={sp.id} className="installed-row">
              <div className="grow">
                <div>{sp.name}</div>
                <div className="muted tiny ellipsis">
                  {sp.id} · {sp.source.type.toUpperCase()} · {(() => {
                    try {
                      return new URL(sp.source.url).hostname;
                    } catch {
                      return sp.source.url;
                    }
                  })()}
                </div>
              </div>
              <button className="btn sm" onClick={() => load(sp)}>
                编辑
              </button>
              <button className="btn sm" onClick={() => copy(JSON.stringify(sp, null, 2)).then(() => setMsg(`已复制「${sp.name}」的 JSON`))}>
                复制
              </button>
              <button className="btn sm danger" onClick={() => uninstallSpec(sp.id)} title="同时会从看板上移除用到它的小组件">
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- 规范 ----------------

function SpecTab() {
  const [msg, setMsg] = useState("");
  const html = useMemo(() => md(SPEC), []);
  const doCopy = (t: string, what: string) => copy(t).then(() => setMsg(`已复制${what}，粘贴给任意 AI，再描述你的需求即可`));
  return (
    <div className="spec">
      <div className="row wrap spec-tools">
        <button className="btn primary" onClick={() => doCopy(SPEC, "完整规范")}>
          复制完整规范
        </button>
        <button className="btn" onClick={() => doCopy(specSection("一"), "「数据导入」规范")}>
          只复制数据导入部分
        </button>
        <button className="btn" onClick={() => doCopy(specSection("二"), "「自定义小组件」规范")}>
          只复制小组件部分
        </button>
        <span className="muted small">文件位置：项目目录下 docs/扩展规范.md</span>
      </div>
      {msg && <div className="note">{msg}</div>}
      <div className="md spec-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default function StudioPage({ arg }: { arg?: string }) {
  const [tab, setTab] = useState<Tab>((["import", "widgets", "spec"] as Tab[]).includes(arg as Tab) ? (arg as Tab) : "import");
  return (
    <div className="studio">
      <div className="seg studio-tabs">
        <button className={tab === "import" ? "on" : ""} onClick={() => setTab("import")}>
          导入数据 · AI 整理
        </button>
        <button className={tab === "widgets" ? "on" : ""} onClick={() => setTab("widgets")}>
          小组件工坊
        </button>
        <button className={tab === "spec" ? "on" : ""} onClick={() => setTab("spec")}>
          扩展规范
        </button>
      </div>
      {tab === "import" && <ImportTab />}
      {tab === "widgets" && <WidgetsTab />}
      {tab === "spec" && <SpecTab />}
    </div>
  );
}
