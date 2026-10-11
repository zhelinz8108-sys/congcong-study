"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { emptySixProgress, scoreSixResponse, sixAttemptStats, type SixAttempt, type SixFeedback, type SixItem, type SixProgress, type SixResponse } from "@/lib/chinese-six";
import type { SixGuide } from "@/lib/chinese-six-guides";
import styles from "./chinese-six.module.css";

type ProgressResult = { progress: SixProgress; feedback: Record<string, Record<string, SixFeedback>>; storage: "local" | "cloud" };
const rates = [{ value: "full", label: "满分" }, { value: "partial", label: "部分正确" }, { value: "none", label: "不会" }] as const;

function resultOf(response?: SixResponse) {
  if (!response || (response.correct === null && !response.selfScore)) return "pending";
  const score = scoreSixResponse(response);
  return score === 1 ? "full" : score === 0.5 ? "partial" : "none";
}

function SourcePages({ item, open = false }: { item: SixItem; open?: boolean }) {
  return <details className={styles.source} open={open}>
    <summary>{item.module === "writing" ? "范文原页" : "查看资料原页"} · 第 {item.pages.join("、")} 页</summary>
    {item.pages.map(page => <div key={page}>
      <p className={styles.muted}>第 {page} 页 · <a href={`/api/chinese/six/source/${item.source}/${page}`} target="_blank" rel="noopener noreferrer">打开原页 ↗</a></p>
      {/* Source pages preserve underlines, tables and the original answer spaces. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.pageImage} src={`/api/chinese/six/source/${item.source}/${page}`} alt={`${item.title}，资料第 ${page} 页`} loading="lazy" width={1309} height={1853} />
    </div>)}
  </details>;
}

export default function ChineseSixWorkspace({ subjectId, item, guide, initialQuestion }: { subjectId: string; item: SixItem; guide: SixGuide; initialQuestion?: string }) {
  const [tab, setTab] = useState<"learn" | "practice">("learn");
  const [progress, setProgress] = useState<SixProgress>(emptySixProgress);
  const [feedback, setFeedback] = useState<ProgressResult["feedback"]>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [clock, setClock] = useState(0);
  const busyRef = useRef(false);
  const base = `/subjects/${subjectId}/chinese/six`;
  const attempt = progress.attempts[progress.current[item.id]];
  const question = item.questions[current];
  const response = question && attempt?.responses[question.id];
  const currentFeedback = question && attempt && feedback[attempt.id]?.[question.id];
  const stats = attempt ? sixAttemptStats(attempt, item.questions.length) : null;
  const history = Object.values(progress.attempts).filter(a => a.itemId === item.id && a.id !== attempt?.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  function applyResult(data: ProgressResult) {
    setProgress(data.progress); setFeedback(data.feedback); setReady(true);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/chinese/six/progress?item=${encodeURIComponent(item.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data as ProgressResult; })
      .then(data => {
        applyResult(data);
        const saved = data.progress.attempts[data.progress.current[item.id]];
        if (saved) {
          const requested = item.questions.findIndex(q => q.id === initialQuestion);
          const next = item.questions.findIndex(q => !saved.responses[q.id] || (saved.responses[q.id].correct === null && !saved.responses[q.id].selfScore));
          setCurrent(requested >= 0 ? requested : next < 0 ? 0 : next);
          if (requested >= 0) setTab("practice");
        }
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "读取记录失败。"); });
    return () => controller.abort();
  }, [item.id, item.questions, initialQuestion]);

  useEffect(() => {
    if (!attempt || attempt.finishedAt) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempt?.id, attempt?.finishedAt, attempt]);

  async function act(body: Record<string, unknown>) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const res = await fetch("/api/chinese/six/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, ...body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败。");
      applyResult(data);
      return true;
    } catch (e) {
      // A response may be lost after saving; refresh before allowing another submission.
      try {
        const res = await fetch(`/api/chinese/six/progress?item=${encodeURIComponent(item.id)}`, { cache: "no-store" });
        if (res.ok) applyResult(await res.json());
      } catch { /* The next explicit retry refreshes the server state again. */ }
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function startPractice(fresh = false) {
    if (!ready || busy) return;
    if (fresh || !attempt) {
      if (!await act({ action: "start" })) return;
      setCurrent(0); setDrafts({});
    }
    setTab("practice");
  }

  async function submit(value: string) {
    if (!question || !attempt || response || !value.trim() || !ready) return;
    await act({ action: "answer", attemptId: attempt.id, questionId: question.id, value });
  }

  function oldAttempt(attempt: SixAttempt) {
    const oldStats = sixAttemptStats(attempt, item.questions.length);
    return <details key={attempt.id}>
      <summary>{new Date(attempt.startedAt).toLocaleString("zh-CN")} · 已提交 {oldStats.answered}/{item.questions.length} · 要点达成 {oldStats.mastery}%</summary>
      {item.questions.filter(q => attempt.responses[q.id]).map((q, i) => <div key={q.id} className={styles.band}>
        <h3>{i + 1}. {q.topic}</h3><p className={styles.muted}>{q.prompt}</p>
        <p className={styles.prose}>{attempt.responses[q.id].value}</p>
        <p className={styles.muted}>{rates.find(r => r.value === resultOf(attempt.responses[q.id]))?.label ?? "待自评"}</p>
      </div>)}
    </details>;
  }

  const seconds = attempt ? Math.max(0, Math.floor(((attempt.finishedAt ? Date.parse(attempt.finishedAt) : clock || Date.parse(attempt.startedAt)) - Date.parse(attempt.startedAt)) / 1000)) : 0;
  return <main className={styles.shell}>
    <div className={styles.inner}>
      <nav className={styles.top}><Link href={base} className={styles.back}>← 返回六上</Link><Link href={`${base}/mistakes`} className={styles.back}>错题与成长档案 →</Link></nav>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>{item.group}</p><h1>{item.title}</h1><p className={styles.muted}>六上语文 · 原资料第 {item.pages.join("、")} 页</p></div>
        {item.questions.length > 0 && <div className={styles.stats}><div><strong>{stats?.answered ?? 0}/{item.questions.length}</strong><span>本次提交</span></div><div><strong>{stats?.mastery ?? 0}%</strong><span>要点达成（含自评）</span></div></div>}
      </header>
      {error && <div role="alert" className={styles.error}>{error}{!ready && <button className={styles.secondary} onClick={() => window.location.reload()}>重新读取</button>}</div>}
      <div className={styles.workspace} aria-busy={busy}>
        <aside className={styles.sidebar}>
          <button aria-current={tab === "learn"} onClick={() => setTab("learn")}>知识与方法</button>
          {item.questions.length > 0 && <button aria-current={tab === "practice"} disabled={!ready || busy} onClick={() => void startPractice()}>练习与复盘</button>}
          <button disabled={!ready || busy || progress.reviewed.includes(item.id)} onClick={() => void act({ action: "review" })}>{progress.reviewed.includes(item.id) ? "✓ 已完成复习" : "标记已复习"}</button>
          {tab === "practice" && <>
            <p className={styles.muted}>用时 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}{item.module === "reading" ? " · 建议 20 分钟" : ""}</p>
            <div className={styles.numberGrid} aria-label="选择题号">{item.questions.map((q, i) => <button key={q.id} aria-label={`第${i + 1}题`} aria-current={current === i} data-result={resultOf(attempt?.responses[q.id])} disabled={busy} onClick={() => setCurrent(i)}>{i + 1}</button>)}</div>
          </>}
        </aside>
        <div className={styles.study}>
          {tab === "learn" ? <>
            <section className={styles.band}><h2>学习重点</h2><p>{guide.goal}</p></section>
            {item.module === "writing" && <SourcePages item={item} open />}
            <section className={styles.band}><h2>{item.module === "writing" ? "范文精读" : "学习步骤"}</h2><div className={styles.stepList}>{guide.steps.map(step => <p key={step} className={styles.step}>{step}</p>)}</div></section>
            {item.sections.map((section, i) => <section className={styles.band} key={`${section.title}-${i}`}><h2>{section.title}</h2><div className={styles.prose}>{section.text}</div></section>)}
            {item.module !== "writing" && <SourcePages item={item} open={item.id.startsWith("skill-")} />}
            <section className={styles.band}><h2>{item.module === "writing" ? "写作检查" : "复习检查"}</h2><ul className={styles.checks}>{guide.checks.map(point => <li key={point}>{point}</li>)}</ul></section>
            {item.questions.length > 0 && <div className={styles.row} style={{ paddingTop: 24 }}><button disabled={!ready || busy} className={styles.primary} onClick={() => void startPractice()}>{attempt ? "继续本次练习" : item.module === "writing" ? "开始练笔" : "开始练习"}</button><span className={styles.muted}>{!ready ? "正在读取学习记录…" : `${item.questions.length} 道练习`}</span></div>}
          </> : question && attempt ? <>
            {stats?.complete && <section className={styles.summary}><h2>本次练习已完成</h2><p>要点达成 {stats.mastery}% · 用时 {Math.floor(seconds / 60)} 分 {seconds % 60} 秒</p><p className={styles.muted}>待复习：{[...new Set(item.questions.filter(q => scoreSixResponse(attempt.responses[q.id]) < 1).map(q => q.topic))].join("、") || "本次全部达成，可以尝试新的练习。"}</p><Link href={`${base}/mistakes`}>查看错题与复习建议 →</Link></section>}
            <div className={styles.row}><span className={styles.eyebrow}>第 {current + 1} / {item.questions.length} 题 · {question.topic}</span><button className={styles.secondary} disabled={busy} onClick={() => void startPractice(true)}>重新练习</button></div>
            {(item.module === "reading" || item.module === "lessons") && <details className={styles.band}><summary>查看原文与知识点</summary>{item.sections.map((s, i) => <section key={i} className={styles.band}><h3>{s.title}</h3><p className={styles.prose}>{s.text}</p></section>)}<SourcePages item={item} /></details>}
            {item.module === "writing" && <details className={styles.band}><summary>回看范文</summary><SourcePages item={item} open /></details>}
            <section className={styles.question} data-question={question.id}>
              <p className={styles.prompt}>{question.prompt}</p>
              {question.kind === "choice" ? <div className={styles.answers}>{question.options.map(option => <button key={option.value} className={styles.option} disabled={!!response || busy || !ready} data-selected={response?.value === option.value} onClick={() => void submit(option.value)}><strong>{option.value}</strong><span>{option.text}</span></button>)}</div> : <>
                <textarea className={styles.textarea} aria-label="你的答案" maxLength={8000} disabled={!!response || busy || !ready} value={response?.value ?? drafts[question.id] ?? ""} placeholder={item.module === "writing" ? "写下你的提纲或练笔…" : "写下你的答案…"} onChange={e => setDrafts(d => ({ ...d, [question.id]: e.target.value }))} />
                {!response && <button className={styles.primary} disabled={busy || !ready || !(drafts[question.id]?.trim())} onClick={() => void submit(drafts[question.id] ?? "")}>{busy ? "提交中…" : "提交答案"}</button>}
              </>}
              {response && <p className={styles.muted} data-answer-locked>本题已提交 · 答案已锁定{response.correct !== null ? response.correct ? " · 回答正确" : " · 回答有误" : ""}</p>}
              {currentFeedback && response && <section className={styles.feedback} data-feedback={question.id}>
                <h2>参考答案</h2><p>{currentFeedback.answer}</p>
                <h3>解题思路</h3><p>{currentFeedback.explanation}</p>
                <h3>核对要点</h3><ul className={styles.checks}>{currentFeedback.points.map((point, i) => <li key={i}>{point}</li>)}</ul>
                {response.correct === null && <div className={styles.row} style={{ marginTop: 22 }}>{rates.map(rate => <button className={response.selfScore === rate.value ? styles.primary : styles.secondary} key={rate.value} disabled={busy || !!response.selfScore} onClick={() => void act({ action: "rate", attemptId: attempt.id, questionId: question.id, score: rate.value })}>{rate.label}</button>)}{response.selfScore && <span className={styles.muted}>自评已记录</span>}</div>}
              </section>}
            </section>
            <nav className={styles.row}><button className={styles.secondary} disabled={current === 0 || busy} onClick={() => setCurrent(i => i - 1)}>← 上一题</button><button className={styles.primary} disabled={current === item.questions.length - 1 || busy} onClick={() => setCurrent(i => i + 1)}>下一题 →</button></nav>
          </> : null}
          {history.length > 0 && <section className={styles.history}><h2>以前的练习 · {history.length} 次</h2>{history.map(oldAttempt)}</section>}
        </div>
      </div>
    </div>
  </main>;
}
