"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { englishSixCollections, englishSixResources, englishSixResourceScope, englishSixResourceStage, englishSixResourceTitle, englishSixStages, type EnglishSixIndex, type SixCollection, type SixEdition, type SixStage } from "@/lib/english-six";
import styles from "./english-six.module.css";
import type { SixBankIndex } from "@/lib/english-six-bank";

export default function EnglishSixHub({ subjectId }: { subjectId: string }) {
  const params = useSearchParams();
  const [index, setIndex] = useState<EnglishSixIndex>();
  const [bank, setBank] = useState<SixBankIndex>();
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(30);
  const edition: SixEdition = params.get("edition") === "legacy" ? "legacy" : "new";
  const collection: SixCollection = params.get("view") === "exams" ? "exams" : params.get("view") === "books" || !params.get("view") && params.get("unit") === "all" ? "books" : "units";
  const startingUnit = Number(params.get("unit") === "all" ? params.get("lastUnit") : params.get("unit"));
  const unit = startingUnit >= 1 && startingUnit <= 8 ? startingUnit : 1;
  const requestedStage = params.get("stage");
  const candidateStage: SixStage | "all" = englishSixStages.some(s => s.id === requestedStage) ? requestedStage as SixStage : requestedStage === "all" || collection !== "units" ? "all" : "listen";
  const period = params.get("period") === "midterm" ? "midterm" : params.get("period") === "final" ? "final" : "all";
  const search = params.get("q") ?? "";
  const base = `/subjects/${subjectId}/english/six`;

  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key); else next.set(key, value);
    }
    setLimit(30);
    window.history.replaceState(null, "", `${base}?${next.toString()}`);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/english/six/index", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("六上资料暂时不可用");
      setIndex(await r.json());
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    void fetch("/api/english/six/bank", { signal: controller.signal, cache: "no-store" }).then(async r => {
      if (r.ok) setBank(await r.json() as SixBankIndex);
    }).catch(() => { /* Original resources remain available if the bank is not installed. */ });
    return () => controller.abort();
  }, []);

  const scoped = useMemo(() => index ? englishSixResources(index, edition, collection === "units" ? unit : null, "all", "", collection, collection === "exams" ? period : "all") : [], [index, edition, collection, unit, period]);
  const stageCounts = useMemo(() => Object.fromEntries(englishSixStages.map(s => [s.id, scoped.filter(r => englishSixResourceStage(r) === s.id).length])), [scoped]);
  const stage = candidateStage !== "all" && !stageCounts[candidateStage] && !(candidateStage === "test" && edition === "new" && collection === "units") ? "all" : candidateStage;
  const resources = useMemo(() => index ? englishSixResources(index, edition, collection === "units" ? unit : null, stage, search, collection, collection === "exams" ? period : "all") : [], [index, edition, collection, unit, stage, search, period]);
  const collectionCounts = useMemo(() => Object.fromEntries(englishSixCollections.map(c => [c.id, index?.resources.filter(r => r.edition === edition && englishSixResourceScope(r).collection === c.id).length ?? 0])), [index, edition]);
  const selected = index?.units.find(u => u.number === unit);
  const bankPapers = bank?.papers.filter(p => p.edition === edition && scoped.some(r => r.id === p.sourceId)) ?? [];
  const bankCount = bankPapers.reduce((count, p) => count + p.questionCount, 0);
  const heading = collection === "units" ? `Unit ${unit} · ${edition === "new" ? selected?.title : selected?.legacyTitle}` : collection === "books" ? "整册与跨单元资料" : period === "midterm" ? "期中复习与测评" : period === "final" ? "期末复习与测评" : "期中期末复习与测评";
  const practice = edition === "new" && collection === "units" && (stage === "test" || stage === "all");
  const resourceQuery = new URLSearchParams(params.toString());
  resourceQuery.set("view", collection);
  resourceQuery.set("unit", collection === "units" ? String(unit) : "all");
  resourceQuery.set("edition", edition);
  resourceQuery.set("stage", stage);

  return <main className={styles.page}>
    <Link className={styles.back} href={`/subjects/${subjectId}`}>← 返回英语主页</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>六年级上册 · 英语</p><h1>六上</h1></div>
      <div className={styles.editions} role="group" aria-label="教材版本">{(["new", "legacy"] as const).map(e => <button key={e} aria-pressed={edition === e} onClick={() => update({ edition: e, stage: "all", q: null })}>{e === "new" ? "2026 新版" : "旧版参考"}</button>)}</div>
    </header>
    {error && <p role="alert">{error}</p>}
    {!index && !error && <p role="status">正在载入资料…</p>}
    {index && <>
      <section className={styles.navigationBand} aria-label="目录导航">
      <p className={styles.controlLabel}>资料范围</p>
      <nav className={styles.collections} aria-label="资料范围">{englishSixCollections.map(c => <button key={c.id} aria-pressed={collection === c.id} onClick={() => update({ view: c.id, unit: c.id === "units" ? String(unit) : "all", lastUnit: String(unit), stage: c.id === "units" ? "listen" : "all", period: null, q: null })}>
        <strong>{c.label}</strong><span>{collectionCounts[c.id]} 份</span>
      </button>)}</nav>

      {collection === "units" && <><p className={styles.controlLabel}>选择单元</p><nav className={styles.units} aria-label="单元">{index.units.map(u => <button key={u.number} aria-label={`Unit ${u.number} ${edition === "new" ? u.title : u.legacyTitle}`} title={edition === "new" ? u.title : u.legacyTitle} aria-pressed={unit === u.number} onClick={() => update({ unit: String(u.number), stage: "listen", q: null })}>
        <span className={styles.unitNumber}>Unit {u.number}</span>
      </button>)}</nav></>}
      {collection === "exams" && <div className={styles.periods} role="group" aria-label="复习阶段">{(["all", "midterm", "final"] as const).map(p => <button key={p} aria-pressed={period === p} onClick={() => update({ period: p, stage: "all", q: null })}>{p === "all" ? "全部" : p === "midterm" ? "期中" : "期末"}</button>)}</div>}
      </section>

      <div className={styles.sectionHead}><h2>{heading}</h2><span className={styles.scopeCount}>{scoped.length} 份资料{edition === "new" && collection === "units" ? " · 1 套互动测评" : ""}</span></div>
      <div className={styles.filters}>
        <h3 className={styles.controlLabel}>学习阶段</h3>
        <nav className={styles.stages} aria-label="学习顺序">
          <button aria-pressed={stage === "all"} onClick={() => update({ stage: "all" })}>全部</button>
          {englishSixStages.slice(0, 6).filter(s => stageCounts[s.id] > 0 || s.id === "test" && edition === "new" && collection === "units").map(s => <button key={s.id} aria-pressed={stage === s.id} onClick={() => update({ stage: s.id })}>{s.id === "test" && collection !== "units" ? "综合测评" : s.label}<span>{stageCounts[s.id] + (s.id === "test" && edition === "new" && collection === "units" ? 1 : 0)}</span></button>)}
        </nav>
        {englishSixStages.slice(6).some(s => stageCounts[s.id] > 0) && <label className={styles.extraFilter}>补充资料<select aria-label="补充资料" value={stage === "reference" || stage === "teacher" ? stage : ""} onChange={e => update({ stage: e.target.value || "all" })}>
          <option value="">选择分类</option>{englishSixStages.slice(6).filter(s => stageCounts[s.id] > 0).map(s => <option key={s.id} value={s.id}>{s.label} · {stageCounts[s.id]}</option>)}
        </select></label>}
      </div>

      {(practice || !!bankCount) && <section className={styles.practiceBand} aria-label="练习与测评"><h3 className={styles.bandHeading}>练习与测评</h3>
      {practice && <div className={styles.practiceEntry}>
        <div><strong>Unit {unit} 单元测评</strong><p>66 题 · 选择 / 判断 / 填空 / 句型转换 / 阅读 / 写作</p><small>笔试练习 · 无配套录音</small></div>
        <Link className={styles.primary} href={`${base}/practice/${unit}`}>开始练习 →</Link>
        <Link className={styles.secondary} href={`${base}/practice/${unit}?mode=mistakes`}>错题复习</Link>
      </div>}
      {!!bankCount && <div className={styles.bankEntry}><strong>原题互动练习 · {bankCount} 题</strong><Link className={styles.primary} href={`${base}/bank?${resourceQuery.toString()}`}>选择题组 →</Link></div>}
      </section>}
      <section className={styles.resourceSection} aria-label="学习资料">
      <div className={styles.toolbar}><div className={styles.listHeading}><h3>学习资料</h3><span>{resources.length} 份{search ? "匹配资料" : "资料"}</span></div><label><span>查找资料</span><input type="search" value={search} placeholder="输入标题或来源" onChange={e => update({ q: e.target.value || null })} /></label></div>
      <div className={styles.resourceList}>
        {resources.slice(0, limit).map(r => <Link key={r.id} href={`${base}/resource/${r.id}?${resourceQuery.toString()}`} className={styles.resource}>
          <span className={styles.format} data-format={r.practice ? "quiz" : r.extension.slice(1)}>{r.practice ? "练习" : r.extension.slice(1).toUpperCase()}</span>
          <div><strong>{englishSixResourceTitle(r)}</strong><div className={styles.resourceMeta}><span className={styles.coverage}>{englishSixResourceScope(r).label}</span><span>{englishSixStages.find(s => s.id === englishSixResourceStage(r))?.label}</span><span>{r.practice ? `${r.practice.questionCount} 道互动题` : r.pageCount > 0 ? `${r.pageCount} 页` : `${(r.size / 1048576).toFixed(1)} MB`}</span>{!r.practice && ["practice", "targeted", "test", "advanced"].includes(englishSixResourceStage(r)) && [".pdf", ".docx"].includes(r.extension) && <span>原始资料 · 未全部转为互动题</span>}</div><p title={r.paths[0]}>来源：{r.paths[0].split(/[\\/]/).slice(0, -1).slice(-2).join(" / ")}</p></div>
          <span className={styles.resourceStatus}>{r.practice ? "做题 →" : r.status === "ready" ? "查看资料 →" : r.status === "download-only" ? "源文件 →" : r.status === "needs-ocr" ? "部分待提取 →" : "导入待处理"}</span>
        </Link>)}
        {!resources.length && <div className={styles.empty}><p>此分类暂无{search ? "匹配" : ""}资料</p><button className={styles.textButton} onClick={() => update({ stage: "all", q: null })}>查看当前范围全部资料 →</button></div>}
      </div>
      {limit < resources.length && <button className={styles.secondary} onClick={() => setLimit(v => v + 30)}>加载更多</button>}
      </section>
      <footer className={styles.footer}>{index.summary.uniqueResources} 份去重资料 · {index.summary.includedFiles} 个源文件</footer>
    </>}
  </main>;
}
