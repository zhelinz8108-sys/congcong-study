"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGrade6BankProgress } from "@/lib/grade6-bank-progress";
import { BANK_DIFFICULTIES, bankStats, type BankAnswers, type BankCollection, type BankFeedback, type BankManifest, type BankQuestion, type BankResponse } from "@/lib/grade6-bank-types";
import { bankCurrentAnswers, bankLegacyAnswerEntries } from "@/lib/grade6-bank-input-schema";
import { bankDrawingCompleted, Grade6BankNative } from "./grade6-bank-native";
import { Grade6BankSolution } from "./grade6-bank-solution";
import styles from "./grade6-bank.module.css";

// Remaining legacy crops and post-submit private images must bypass the public
// image optimizer/cache. Reviewed native questions do not display these crops.
/* eslint-disable @next/next/no-img-element */

const palettes = [
  ["#b66a32", "#fff3df", "#f1d9b5"], ["#b76142", "#fff0e8", "#f0d0bc"],
  ["#a57628", "#fff6df", "#eedcab"], ["#a46953", "#fff0e9", "#e8cec0"],
  ["#b96269", "#fff1ed", "#edcdd0"], ["#a6763e", "#fcf2e2", "#e8d5b6"],
  ["#bc7651", "#fff1e1", "#eed4bc"], ["#af6834", "#fff5e9", "#efd6bd"],
];
function palette(index: number): CSSProperties {
  const [accent, soft, line] = palettes[index % palettes.length];
  return { "--accent": accent, "--soft": soft, "--line": line } as CSSProperties;
}
const syncText = { loading: "正在读取学习记录…", saved: "已同步云端", saving: "正在保存…", offline: "草稿保留在本机，云端暂未同步", conflict: "云端记录已更新，本机草稿已保留；请确认后再次手动提交，不会自动覆盖", legacy: "原作答已保留，重新填写后保存" };

function SourceImage({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><button type="button" className={styles.imageButton} onClick={() => dialog.current?.showModal()} aria-label={`放大查看：${alt}`}><img className={styles.questionImage} src={src} alt={alt} /></button><dialog ref={dialog} className={styles.zoomDialog} onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}><header><button type="button" onClick={() => dialog.current?.close()} aria-label="关闭放大图">关闭 ×</button></header><div><img src={src} alt={alt} /></div></dialog></>;
}

function CollectionCard({ collection, subjectId, responses, ready }: { collection: BankCollection; subjectId: string; responses: Parameters<typeof bankStats>[1]; ready: boolean }) {
  const stats = bankStats(collection.questions.map((q) => q.id), responses);
  return <Link className={`${styles.card} ${styles.directoryCard}`} style={palette(collection.palette)} href={`/subjects/${subjectId}/math/problem-bank/${collection.id}`} prefetch={false}>
    <div className={styles.cardHead}><h3>{collection.title}</h3><span className={styles.arrow} aria-hidden="true">↗</span></div>
    <div className={styles.cardStats}><span>{collection.questionCount} 题</span><span>已答 {ready ? stats.answered : "—"}</span><span title="只统计系统能可靠判分的题；过程、画图及答案待核验题不计入">正确率 {ready && stats.accuracy !== null ? `${stats.accuracy}%` : "—"}</span>{stats.review > 0 && <span>待核验 {stats.review}</span>}</div>
    <div className={styles.track}><div className={styles.fill} style={{ width: `${stats.answered / Math.max(1, collection.questionCount) * 100}%` }} /></div>
    {collection.mode === "chapter" && <div className={styles.note}>{BANK_DIFFICULTIES.filter((d) => collection.difficultyCounts[d.value]).map((d) => `${d.label} ${collection.difficultyCounts[d.value]}`).join(" · ")}</div>}
  </Link>;
}

export function Grade6BankDirectory({ subjectId, manifest }: { subjectId: string; manifest: BankManifest }) {
  const { progress, ready, sync } = useGrade6BankProgress(subjectId);
  const stats = bankStats(manifest.collections.flatMap((c) => c.questions.map((q) => q.id)), progress.responses);
  return <main className={styles.page}><div className={styles.wrap}>
    <Link className={styles.back} href={`/subjects/${subjectId}`}>← 返回数学</Link>
    <h1 className={styles.pageTitle}>六上数学题库</h1>
    <section className={styles.overview} aria-label="题库学习进度"><div className={styles.overviewTop}><h2>我的练习进度</h2><div className={styles.stats}><span>已答<b>{ready ? stats.answered : "—"} / {manifest.total}</b></span><span>答对<b>{ready ? stats.correct : "—"}</b></span><span>正确率<b>{ready && stats.accuracy !== null ? `${stats.accuracy}%` : "—"}</b></span>{stats.review > 0 && <span>待核验<b>{stats.review}</b></span>}</div></div><div className={styles.track}><div className={styles.fill} style={{ width: `${stats.answered / Math.max(1, manifest.total) * 100}%` }} /></div>{sync !== "saved" && <p className={styles.note} role="status">{syncText[sync]}</p>}</section>
    <div className={styles.columns}>
      {(["chapter", "exam"] as const).map((mode) => {
        const collections = manifest.collections.filter((c) => c.mode === mode);
        const total = collections.reduce((sum, c) => sum + c.questionCount, 0);
        const headingId = `bank-directory-${mode}`;
        return <section key={mode} className={styles.collectionPanel} data-mode={mode} aria-labelledby={headingId}>
          <header className={styles.sectionTitle}>
            <div className={styles.panelEyebrow}><span className={styles.panelCount}>{collections.length} {mode === "chapter" ? "组" : "套"} · {total.toLocaleString()} 题</span></div>
            <div className={styles.panelHeading}>
              <span className={styles.panelIcon} aria-hidden="true">
                {mode === "chapter" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M12 6c-2.5-2-5.5-2.5-9-2v15c3.5-.5 6.5 0 9 2 2.5-2 5.5-2.5 9-2V4c-3.5-.5-6.5 0-9 2Z" /><path d="M12 6v15M6 8l3 1M6 12l3 1M15 9l3-1M15 13l3-1" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="m8 11 1.5 1.5L12 10M15 11h2M8 17h9" /></svg>}
              </span>
              <h2 id={headingId}>{mode === "chapter" ? "章节专项训练" : "综合练习"}</h2>
            </div>
          </header>
          <div className={styles.cards}>{collections.map((c) => <CollectionCard key={c.id} collection={c} subjectId={subjectId} responses={progress.responses} ready={ready} />)}</div>
        </section>;
      })}
    </div>
  </div></main>;
}

type ProgressHook = ReturnType<typeof useGrade6BankProgress>;
function QuestionSession({ question, collection, position, count, progress, go }: { question: BankQuestion; collection: BankCollection; position: number; count: number; progress: ProgressHook; go: (offset: number) => void }) {
  const existing = progress.progress.responses[question.id];
  const locked = existing?.submitted || (existing?.submissions ?? 0) > 0;
  const controlsDisabled = !progress.ready || locked;
  // One authoritative input state: the hook already preserves dirty drafts.
  // A clean cloud refresh must update every control before a partial edit can
  // spread old values from other blanks back into a newly based draft.
  // A native migration can split one historic response into several fields.
  // Keep that old response readable, but never guess a comma-separated mapping
  // or send unknown legacy keys to the current question API.
  const drawingBox = (id: string) => { for (const block of question.native?.blocks ?? []) if (block.type === "drawing" && block.fieldId === id) return block.viewBox; };
  const pickAnswers = (record?: BankResponse): BankAnswers => bankCurrentAnswers(question, record?.answers, record?.nativeInputSchema);
  const answers: BankAnswers = pickAnswers(existing);
  const { getLegacyAnswers, observeQuestion } = progress;
  const savedHistoric = getLegacyAnswers?.(question.id);
  useEffect(() => { observeQuestion?.(question); }, [question, observeQuestion]);
  const currentHistoric = useMemo(() => [...new Map([...Object.entries(savedHistoric ?? {}), ...bankLegacyAnswerEntries(question, existing?.answers, existing?.nativeInputSchema)])].filter(([, value]) => value.trim()), [existing?.answers, existing?.nativeInputSchema, question, savedHistoric]);
  const [retainedHistoric, setRetainedHistoric] = useState(currentHistoric);
  // A late read-only GET can introduce legacy fields after this session mounts.
  // Display them immediately and retain them if an explicit new edit drops the
  // unknown payload keys; capturing history must never create a learner write.
  useEffect(() => {
    if (!currentHistoric.length) return;
    setRetainedHistoric((previous) => {
      const merged = [...new Map([...previous, ...currentHistoric])];
      return merged.length === previous.length && merged.every(([id, value], index) => previous[index]?.[0] === id && previous[index]?.[1] === value) ? previous : merged;
    });
  }, [currentHistoric]);
  const historicAnswers = [...new Map([...retainedHistoric, ...currentHistoric])];
  const [feedbackState, setFeedback] = useState<{ revision: number; value: BankFeedback } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const feedback = locked && existing?.revision === feedbackState?.revision ? feedbackState.value : null;
  const readFeedback = progress.feedback;
  const getResponse = progress.getResponse;
  useEffect(() => {
    if (!locked || !readFeedback) return;
    let active = true;
    void readFeedback(question.id).then(value => { if (active) setFeedback({ revision: getResponse(question.id)?.revision ?? -1, value }); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "解析读取失败"); });
    return () => { active = false; };
  }, [locked, question.id, readFeedback, getResponse]);
  const canSubmit = question.inputs.every((field) => field.kind === "drawing" ? bankDrawingCompleted(answers[field.id] ?? "", drawingBox(field.id)) : (answers[field.id] ?? "").trim());
  const change = (id: string, value: string) => { if (locked || !progress.ready) return; observeQuestion?.(question); const next = { ...pickAnswers(progress.getResponse(question.id)), [id]: value }; setFeedback(null); setError(""); progress.draft(question.id, next); };
  const submit = async () => {
    if (!canSubmit || busy || locked || !progress.ready) return;
    setBusy(true); setError("");
    try {
      const value = await progress.submit(question.id, answers);
      setFeedback({ revision: progress.getResponse(question.id)?.revision ?? -1, value });
    } catch (e) { setError(e instanceof Error ? e.message : "提交失败，请稍后重试"); } finally { setBusy(false); }
  };
  const resultTitle = feedback?.outcome === "correct" ? "答对了" : feedback?.outcome === "incorrect" ? "需要订正" : "待核验";
  return <article className={styles.question} style={palette(collection.palette)}>
    <header className={styles.questionTop}><h2>第 {String(question.number).padStart(3, "0")} 题</h2><span className={styles.badge}>{BANK_DIFFICULTIES.find((d) => d.value === question.difficulty)?.label}</span></header>
    <div className={styles.questionBody}>
      {question.native ? <Grade6BankNative content={question.native} inputs={question.inputs} answers={answers} disabled={busy || controlsDisabled} onChange={change} results={feedback?.fields} /> : <>
      {question.questionImages.length ? question.questionImages.map((src, index) => <SourceImage key={src} src={src} alt={`第${question.number}题，第${index + 1}部分`} />) : <p className={styles.prompt}>{question.prompt}</p>}
      <div className={styles.inputArea}>
        {question.inputs.map((field) => <div key={field.id} className={styles.field}>
          {question.inputs.length > 1 && <span>{field.label}</span>}
          {field.kind === "choice" && field.choices?.length ? <div className={styles.choices} role="group" aria-label={field.label}>{field.choices.map((value) => <button key={value} type="button" className={styles.choice} aria-pressed={answers[field.id] === value} disabled={busy || controlsDisabled} onClick={() => change(field.id, value)}><b>{value}</b></button>)}</div> : /^第\s*\d+\s*空|算式的结果/.test(field.label) ? <input type="text" aria-label={field.label} value={answers[field.id] ?? ""} onChange={(e) => change(field.id, e.target.value)} disabled={busy || controlsDisabled} placeholder="答案" /> : <textarea aria-label={field.label} value={answers[field.id] ?? ""} onChange={(e) => change(field.id, e.target.value)} disabled={busy || controlsDisabled} rows={question.inputs.length > 1 ? 2 : 3} placeholder="作答" />}
        </div>)}
      </div></>}
      {historicAnswers.length > 0 && <details className={styles.history}><summary>原作答记录</summary>{historicAnswers.map(([id, value]) => <p key={id}>{value}</p>)}</details>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {feedback && <section className={styles.feedback} data-outcome={feedback.outcome} aria-live="polite"><h3>{resultTitle}</h3>{feedback.message && <p>{feedback.message}</p>}{feedback.score !== null && <p>本题得分：{feedback.score} / {feedback.maxScore}</p>}{feedback.fields.length > 1 && <p>{feedback.fields.map((f, i) => `第 ${i + 1} 项${f.correct ? " ✓" : " 待订正"}`).join(" · ")}</p>}{feedback.detailedSolution ? <Grade6BankSolution solution={feedback.detailedSolution} /> : feedback.answerText && <p style={{ marginTop: 12 }}>{feedback.answerText}</p>}{feedback.answerImages.map((src, index) => <SourceImage key={index} src={src} alt={`提交后显示的配套答案与解析，第${index + 1}部分`} />)}</section>}
    </div>
    <footer className={styles.actions}><div className={styles.buttonRow}><button className={styles.button} disabled={busy || position === 0} onClick={() => go(-1)}>← 上一题</button><button className={`${styles.button} ${styles.primary}`} disabled={busy || !canSubmit || controlsDisabled} onClick={() => void submit()}>{busy ? "正在提交…" : locked ? "已提交 · 已锁定" : "提交答案"}</button><button className={styles.button} disabled={busy || position >= count - 1 || !locked} onClick={() => go(1)}>下一题 →</button></div>{position < count - 1 && <div className={styles.subActions}><button disabled={busy} onClick={() => go(1)}>跳过 →</button></div>}{position === count - 1 && <p className={styles.summary}>本组最后一题</p>}</footer>
  </article>;
}

export function Grade6BankPractice({ subjectId, collection, initialQuestionId }: { subjectId: string; collection: BankCollection; initialQuestionId?: string }) {
  const progress = useGrade6BankProgress(subjectId);
  const [filter, setFilter] = useState("all"), [currentId, setCurrentId] = useState(initialQuestionId ?? collection.questions[0]?.id ?? "");
  const [loaded, setLoaded] = useState<{ id: string; question: BankQuestion } | null>(null), [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null);
  const questions = useMemo(() => collection.questions.filter((q) => filter === "all" || String(q.difficulty) === filter), [collection, filter]);
  const position = Math.max(0, questions.findIndex((q) => q.id === currentId));
  const activeId = questions[position]?.id ?? "";
  const error = loadError?.id === activeId ? loadError.message : "";
  const stats = bankStats(collection.questions.map((q) => q.id), progress.progress.responses);
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController(); let canceled = false;
    void fetch(`/api/math/grade6-bank/questions/${encodeURIComponent(activeId)}`, { cache: "no-store", signal: controller.signal }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "题目加载失败"); if (!canceled) { setLoaded({ id: activeId, question: data }); setLoadError(null); } }).catch((e) => { if (!canceled) setLoadError({ id: activeId, message: e instanceof Error ? e.message : "题目加载失败，请刷新重试" }); });
    const url = new URL(window.location.href); url.searchParams.set("q", activeId); window.history.replaceState(null, "", url);
    return () => { canceled = true; controller.abort(); };
  }, [activeId]);
  const go = (offset: number) => { const next = questions[position + offset]; if (!next) return; void progress.flush(); setCurrentId(next.id); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <main className={styles.page} style={palette(collection.palette)}><div className={styles.practiceWrap}>
    <Link className={styles.back} href={`/subjects/${subjectId}/math/problem-bank`}>← 返回题库目录</Link>
    <header className={styles.practiceHeader}><h1>{collection.title}</h1></header>
    <section className={styles.overview} style={{ margin: "0 0 18px" }}><div className={styles.overviewTop}><div className={styles.stats}><span>已答<b>{progress.ready ? stats.answered : "—"} / {collection.questionCount}</b></span><span>答对<b>{progress.ready ? stats.correct : "—"}</b></span><span>正确率<b>{progress.ready && stats.accuracy !== null ? `${stats.accuracy}%` : "—"}</b></span>{stats.review > 0 && <span>待核验<b>{stats.review}</b></span>}</div>{progress.sync !== "saved" && <span className={styles.note} role="status">{syncText[progress.sync]}</span>}</div></section>
    <div className={styles.tools}>{collection.mode === "chapter" ? <label className={styles.note}>练习层级 <select aria-label="练习层级" value={filter} onChange={(e) => { void progress.flush(); setFilter(e.target.value); setCurrentId(collection.questions.find((q) => e.target.value === "all" || String(q.difficulty) === e.target.value)?.id ?? ""); }}><option value="all">全部 · 从简单到难</option>{BANK_DIFFICULTIES.filter((d) => collection.difficultyCounts[d.value]).map((d) => <option key={d.value} value={d.value}>{d.label} · {collection.difficultyCounts[d.value]} 题</option>)}</select></label> : <span className={styles.note}>按原卷顺序练习</span>}<label className={styles.note}>题号 <select aria-label="跳转到题号" value={activeId} onChange={(e) => { void progress.flush(); setCurrentId(e.target.value); }}>{questions.map((q) => <option key={q.id} value={q.id}>第 {String(q.number).padStart(3, "0")} 题{progress.progress.responses[q.id]?.submitted ? " · 已答" : ""}</option>)}</select></label></div>
    {error ? <div role="alert" className={styles.error}>{error} <button onClick={() => window.location.reload()}>重新加载</button></div> : !progress.ready || loaded?.id !== activeId ? <div className={styles.loading}>正在准备这道题…</div> : <QuestionSession key={activeId} question={loaded.question} collection={collection} position={position} count={questions.length} progress={progress} go={go} />}
  </div></main>;
}
