import { useEffect, useState } from "react";
import { call, isTauri, openUrl } from "../api";
import { DEFAULT_QUERY, fmtStars, keyOf, LANGUAGES, refreshTrending, SINCE_LABEL, type TrendingQuery } from "../services/github";
import { useStore } from "../store";
import { relTime } from "../utils";
import { LangDot } from "../widgets/GithubWidget";

function TokenInput() {
  const [has, setHas] = useState<boolean | null>(null);
  const [val, setVal] = useState("");
  useEffect(() => {
    if (isTauri) call<boolean>("has_secret", { name: "github" }).then(setHas);
  }, []);
  const save = async (v: string) => {
    await call("set_secret", { name: "github", value: v });
    setHas(!!v.trim());
    setVal("");
  };
  return (
    <div className="row">
      <input
        type="password"
        className="input grow"
        placeholder={has ? "Token 已保存（输入新值可替换）" : "可选：GitHub Token（github.com/settings/tokens，无需任何权限），提高 API 频率限制"}
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      <button className="btn" disabled={!val} onClick={() => save(val)}>
        保存
      </button>
      {has && (
        <button className="btn" onClick={() => save("")}>
          清除
        </button>
      )}
    </div>
  );
}

export default function GithubPage() {
  const [q, setQ] = useState<TrendingQuery>(DEFAULT_QUERY);
  const data = useStore((s) => s.cache.github?.[keyOf(q)]);
  const [busy, setBusy] = useState(false);

  const load = async (next = q) => {
    setBusy(true);
    await refreshTrending(next);
    setBusy(false);
  };
  useEffect(() => {
    if (isTauri) load(q);
  }, [keyOf(q)]);

  const items = data?.items ?? [];

  return (
    <div className="gh-page">
      <div className="row wrap gap-s">
        <div className="seg">
          {(Object.keys(SINCE_LABEL) as TrendingQuery["since"][]).map((k) => (
            <button key={k} className={q.since === k ? "on" : ""} onClick={() => setQ({ ...q, since: k })}>
              {SINCE_LABEL[k]}
            </button>
          ))}
        </div>
        <input
          className="input"
          list="gh-langs"
          placeholder="全部语言"
          value={q.language}
          onChange={(e) => setQ({ ...q, language: e.target.value })}
          style={{ width: 160 }}
        />
        <datalist id="gh-langs">
          {LANGUAGES.filter(Boolean).map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <div className="seg" title="GitHub 没有官方 Trending API">
          <button className={q.mode === "web" ? "on" : ""} onClick={() => setQ({ ...q, mode: "web" })}>
            Trending 页面
          </button>
          <button className={q.mode === "api" ? "on" : ""} onClick={() => setQ({ ...q, mode: "api" })}>
            Search API
          </button>
        </div>
        <button className="btn" onClick={() => load()} disabled={busy || !isTauri}>
          {busy ? "刷新中…" : "刷新"}
        </button>
        {data && <span className="muted small">更新于 {relTime(data.ts)}</span>}
      </div>
      <p className="muted tiny">
        {q.mode === "web"
          ? "解析 github.com/trending 页面，与网页上的排行一致，含本周期新增星标。"
          : "GitHub 没有官方 Trending API，这里用官方 Search API 近似：所选时间段内新建、按星标排序的仓库。未登录每分钟限 10 次。"}
      </p>
      {q.mode === "api" && <TokenInput />}
      {data?.error && <div className="err">{data.error}</div>}
      {!isTauri && <div className="err">当前是浏览器预览模式，需要在桌面客户端中使用。</div>}
      <div className="gh-page-list">
        {items.map((r, i) => (
          <div key={r.name} className="gh-card" onClick={() => openUrl(r.url)}>
            <div className="gh-card-head">
              <span className="gh-rank">{i + 1}</span>
              <b className="gh-card-name">
                <span className="muted">{r.name.split("/")[0]} / </span>
                {r.name.split("/")[1]}
              </b>
            </div>
            {r.description && <div className="gh-card-desc">{r.description}</div>}
            <div className="gh-card-foot">
              <LangDot r={r} />
              <span>★ {r.stars.toLocaleString()}</span>
              <span>⑂ {r.forks.toLocaleString()}</span>
              {r.period_stars != null && (
                <b className="gh-period">
                  +{fmtStars(r.period_stars)} {SINCE_LABEL[q.since]}
                </b>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
