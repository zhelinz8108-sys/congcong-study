"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import index from "@/data/chinese-six-index.json";
import { scoreSixResponse, SIX_MODULES, type SixProgress, type SixFeedback } from "@/lib/chinese-six";
import styles from "./chinese-six.module.css";

export default function ChineseSixMistakes({ subjectId }: { subjectId: string }) {
  const [progress, setProgress] = useState<SixProgress | null>(null);
  const [error, setError] = useState("");
  const [module, setModule] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Record<string, SixFeedback>>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chinese/six/progress", { cache: "no-store", signal: controller.signal }).then(async res => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error); setProgress(data.progress); setFeedback(data.feedback);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "读取失败。"); });
    return () => controller.abort();
  }, []);
  const base = `/subjects/${subjectId}/chinese/six`;
  const attempts = Object.values(progress?.attempts ?? {});
  const records = index.items.flatMap(item => {
    const history = attempts.filter(a => a.itemId === item.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const latest = new Map<string, { id: string; value: string; result: string; date: string; reference?: SixFeedback }>();
    let errors = 0;
    for (const attempt of [...history].reverse()) for (const [id, response] of Object.entries(attempt.responses)) {
      if (response.correct === null && response.selfScore === undefined) continue;
      const wrong = scoreSixResponse(response) < 1;
      if (wrong) errors++;
      latest.set(id, { id, value: response.value, result: wrong ? "wrong" : "full", date: response.submittedAt, reference: feedback[attempt.id]?.[id] });
    }
    const wrong = [...latest.values()].filter(r => r.result === "wrong");
    return wrong.length ? [{ item, wrong, errors, attempts: history.length }] : [];
  });
  return <main className={styles.shell}><div className={styles.inner}>
    <nav className={styles.top}><Link className={styles.back} href={base}>← 返回六上</Link></nav>
    <header className={styles.heading}><div><p className={styles.eyebrow}>六上语文</p><h1>错题与成长档案</h1></div><div className={styles.stats}><div><strong>{attempts.length}</strong><span>累计练习</span></div><div><strong>{records.reduce((n, r) => n + r.wrong.length, 0)}</strong><span>待巩固题目</span></div></div></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.filters}><select className={styles.select} aria-label="筛选错题板块" value={module} onChange={e => setModule(e.target.value)}><option value="">全部板块</option>{SIX_MODULES.map(m => <option key={m.key} value={m.key}>{m.name}</option>)}</select></div>
    {progress === null && !error ? <p className={styles.empty}>正在读取学习记录…</p> : records.length === 0 && !error ? <p className={styles.empty}>暂时没有待巩固题目。</p> : records.filter(r => !module || r.item.module === module).map(record => <section className={styles.band} key={record.item.id}>
      <p className={styles.eyebrow}>{SIX_MODULES.find(m => m.key === record.item.module)?.name} · {record.item.group}</p>
      <h2>{record.item.title}</h2><p className={styles.muted}>待巩固 {record.wrong.length} 题 · 累计未达成 {record.errors} 次 · 已练习 {record.attempts} 次</p>
      <p className={styles.muted}>复习建议：先回看对应知识与方法，核对原文依据或句式要求，再开始新的一次练习。</p>
      <details style={{ margin: "12px 0" }}><summary>查看最近未达成的答案</summary>{record.wrong.map(r => <div key={r.id} className={styles.band}><h3>{r.reference?.topic}</h3><p className={styles.muted}>{r.reference?.prompt}</p><p className={styles.muted}>{new Date(r.date).toLocaleString("zh-CN")}</p><p className={styles.prose}>{r.value}</p><Link className={styles.back} href={`${base}/study/${record.item.id}?question=${encodeURIComponent(r.id)}`}>核对此题 →</Link></div>)}</details>
      <Link className={styles.back} href={`${base}/study/${record.item.id}`}>回到原题与参考答案 →</Link>
    </section>)}
  </div></main>;
}
