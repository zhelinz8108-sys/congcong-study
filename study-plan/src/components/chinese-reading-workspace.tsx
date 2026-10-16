"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReadingPublicPassage, ReadingPublicTopic, ReadingSubmission } from "@/lib/chinese-reading-model";
import styles from "./chinese-six.module.css";

type Results = { records: Record<string, ReadingSubmission>; replayed?: boolean; error?: string };

export default function ChineseReadingWorkspace({ subjectId, passage, topic }: {
  subjectId: string; passage: ReadingPublicPassage; topic: ReadingPublicTopic;
}) {
  const [current, setCurrent] = useState(0);
  const [records, setRecords] = useState<Results["records"]>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const question = passage.questions[current];
  const response = records[question.id];
  const answered = Object.values(records).length;
  const graded = Object.values(records).filter(r => r.feedback.isCorrect !== null);
  const correct = graded.filter(r => r.feedback.isCorrect).length;
  const base = `/subjects/${subjectId}/chinese`;

  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setRecords({});
    fetch(`/api/chinese/reading/progress?passage=${encodeURIComponent(passage.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async res => { const data = await res.json() as Results; if (!res.ok) throw new Error(data.error || "读取失败。"); return data; })
      .then(data => {
        setRecords(data.records); setReady(true);
        const next = passage.questions.findIndex(q => !data.records[q.id]); setCurrent(next < 0 ? 0 : next);
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "读取失败。"); });
    return () => controller.abort();
  }, [passage.id, passage.questions]);

  async function submit() {
    const value = drafts[question.id]?.trim();
    if (!ready || response || !value || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const res = await fetch("/api/chinese/reading/progress", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passageId: passage.id, questionId: question.id, value }) });
      const data = await res.json() as Results;
      if (!res.ok) throw new Error(data.error || "提交失败。");
      setRecords(data.records);
      if (data.replayed) setError("本题已有锁定答案，已显示原提交记录。");
    } catch (e) {
      setReady(false);
      try {
        const res = await fetch(`/api/chinese/reading/progress?passage=${encodeURIComponent(passage.id)}`, { cache: "no-store" });
        if (res.ok) { const data = await res.json() as Results; setRecords(data.records); setReady(true); }
      } catch { /* Fail closed until explicit reload. */ }
      setError(e instanceof Error ? e.message : "提交失败。");
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <main className={styles.shell}><div className={styles.inner}>
    <nav className={styles.top}><Link href={`${base}/reading`} className={styles.back}>← 返回阅读专题</Link><Link href={`${base}/mistakes`} className={styles.back}>错题与复核 →</Link></nav>
    <header className={styles.heading}><div><p className={styles.eyebrow}>{topic.name} · {passage.difficulty}</p><h1>{passage.title}</h1></div>
      <div className={styles.stats}><div><strong>{answered}/{passage.questions.length}</strong><span>已提交</span></div><div><strong>{graded.length ? `${Math.round(correct / graded.length * 100)}%` : "—"}</strong><span>客观题正确率</span></div><div><strong>{answered - graded.length}</strong><span>待复核</span></div></div>
    </header>
    {error && <div role="alert" className={styles.error}>{error}{!ready && <button className={styles.secondary} onClick={() => window.location.reload()}>重新读取</button>}</div>}
    <section className={styles.band}><h2>阅读材料</h2><p className={styles.prose}>{passage.body}</p></section>
    <div className={styles.numberGrid} aria-label="选择题号">{passage.questions.map((q, i) => <button key={q.id} disabled={busy} aria-current={current === i}
      data-result={!records[q.id] ? "pending" : records[q.id].feedback.isCorrect === null ? "partial" : records[q.id].feedback.isCorrect ? "full" : "none"}
      onClick={() => setCurrent(i)}>{i + 1}</button>)}</div>
    <section className={styles.question} data-question={question.id} aria-busy={busy}>
      <p className={styles.eyebrow}>第 {current + 1} / {passage.questions.length} 题 · {question.type === "choice" ? "选择题" : question.type === "fill" ? "填空题" : "简答题"}</p>
      <p className={styles.prompt}>{question.prompt}</p>
      {question.type === "choice" ? <div className={styles.answers}>{question.options?.map((option, i) => <button key={option} className={styles.option}
        disabled={!ready || busy || !!response} data-selected={(response?.answer ?? drafts[question.id]) === option}
        onClick={() => setDrafts(d => ({ ...d, [question.id]: option }))}><strong>{String.fromCharCode(65 + i)}</strong><span>{option}</span></button>)}</div>
        : <textarea className={styles.textarea} aria-label="你的答案" maxLength={8000} value={response?.answer ?? drafts[question.id] ?? ""}
          disabled={!ready || busy || !!response} onChange={e => setDrafts(d => ({ ...d, [question.id]: e.target.value }))} placeholder="写下你的答案…" />}
      {!response && <button className={styles.primary} disabled={!ready || busy || !drafts[question.id]?.trim()} onClick={() => void submit()}>{busy ? "提交中…" : "提交答案"}</button>}
      {response && <section className={styles.feedback} data-answer-locked>
        <p className={styles.eyebrow}>答案已永久锁定 · {response.feedback.isCorrect === null ? "待复核" : response.feedback.isCorrect ? "回答正确" : "回答有误"}</p>
        <h2>你的答案</h2><p className={styles.prose}>{response.answer}</p><h2>参考答案</h2><p>{response.feedback.answer}</p>
        <h3>解题思路</h3><p>{response.feedback.explanation}</p><h3>核对要点</h3><ul className={styles.checks}>{response.feedback.scoringPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
      </section>}
    </section>
    <nav className={styles.row}><button className={styles.secondary} disabled={current === 0 || busy} onClick={() => setCurrent(i => i - 1)}>← 上一题</button>
      <span className={styles.muted}>首次提交后不可修改</span><button className={styles.primary} disabled={current === passage.questions.length - 1 || busy} onClick={() => setCurrent(i => i + 1)}>下一题 →</button></nav>
  </div></main>;
}
