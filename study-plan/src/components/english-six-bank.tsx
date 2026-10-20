"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { englishSixResourceScope, type EnglishSixIndex } from "@/lib/english-six";
import type { SixBankEntry, SixBankIndex } from "@/lib/english-six-bank";
import styles from "./english-six.module.css";

export default function EnglishSixBank({ subjectId }: { subjectId: string }) {
  const params = useSearchParams();
  const [data, setData] = useState<{ bank: SixBankIndex; sources: EnglishSixIndex }>();
  const [error, setError] = useState("");
  const base = `/subjects/${subjectId}/english/six`;
  const source = params.get("source");
  const unit = params.get("unit") === "all" ? 0 : Number(params.get("unit")) || 1;
  const edition = "new";
  const query = params.get("q") ?? "";
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const bank = await fetch("/api/english/six/bank", { signal: controller.signal, cache: "no-store" });
      if (!bank.ok) throw new Error("互动练习暂时不可用");
      const sources = await fetch("/api/english/six/index", { signal: controller.signal, cache: "no-store" });
      if (!sources.ok) throw new Error("资料目录暂时不可用");
      setData({ bank: await bank.json() as SixBankIndex, sources: await sources.json() as EnglishSixIndex });
    })().catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "读取失败"); });
    return () => controller.abort();
  }, []);
  const papers = useMemo(() => data?.bank.papers.filter(p => {
    const r = data.sources.resources.find(r => r.id === p.sourceId);
    return p.edition === edition && (!source || p.sourceId === source) && (!unit || p.unit === unit) &&
      (!params.get("view") || source || r && englishSixResourceScope(r).collection === params.get("view")) &&
      (!query || `${p.title} ${p.sourceTitle}`.toLowerCase().includes(query.toLowerCase()));
  }) ?? [], [data, source, unit, edition, query, params]);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("edition", edition);
    if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, "", `${base}/bank?${next}`);
  }
  const sourceTitle = data?.sources.resources.find(r => r.id === source)?.title;
  const groups = useMemo(() => {
    const result = new Map<string, { title: string; papers: SixBankEntry[] }>();
    for (const paper of papers) {
      const key = `${paper.unit}:${paper.sourceId}`;
      if (!result.has(key)) result.set(key, { title: paper.sourceTitle, papers: [] });
      result.get(key)!.papers.push(paper);
    }
    return [...result.entries()];
  }, [papers]);
  return <main className={styles.page}>
    <Link className={styles.back} href={`${base}?${params.toString()}`}>← 返回六上目录</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>六上 · 原题练习</p><h1>互动练习</h1>{sourceTitle && <p className={styles.bankSource}>{sourceTitle}</p>}</div>
      <div className={styles.stats}><div><strong>{papers.reduce((n, p) => n + p.questionCount, 0)}</strong><span>当前题目</span></div><div><strong>{papers.length}</strong><span>题组</span></div></div>
    </header>
    <div className={styles.bankFilters}><label>单元<select aria-label="练习单元" value={unit || "all"} onChange={e => update("unit", e.target.value)}><option value="all">全部单元</option>{Array.from({ length: 8 }, (_, i) => <option value={i + 1} key={i}>Unit {i + 1}</option>)}</select></label>
      <label>查找<input type="search" value={query} onChange={e => update("q", e.target.value)} placeholder="题型或资料名称" /></label>
    </div>
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    {!data && !error && <p role="status">正在载入题组…</p>}
    {data && !data.bank.complete && <p className={styles.bankCoverage}>已匹配 {data.bank.questionCount} 题 · 原单元测评 {data.bank.existingQuestionCount} 题 · 其余原题仍在提取与核验</p>}
    <div className={styles.resourceList}>{groups.map(([key, group], i) => <details className={styles.bankGroup} key={key} open={!!source || !!query || i === 0}>
      <summary><span><strong>{group.title}</strong><small>Unit {group.papers[0].unit} · {group.papers.length} 个题组 · {group.papers.reduce((n, p) => n + p.questionCount, 0)} 题</small></span></summary>
      <div>{group.papers.map(p => <Link key={p.id} className={styles.resource} href={`${base}/bank/${p.id}?${params.toString()}`}>
        <span className={styles.format}>{p.questionCount} 题</span><div><strong>{p.title}</strong><small>原文第 {p.page} 页</small></div><span className={styles.resourceStatus}>开始练习 →</span>
      </Link>)}</div>
    </details>)}</div>
    {data && !papers.length && <p className={styles.empty}>当前范围暂无已匹配题组</p>}
  </main>;
}
