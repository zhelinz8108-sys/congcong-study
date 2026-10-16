"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { englishSixAccuracy, type SixFeedback, type SixPaper } from "@/lib/english-six";
import { useEnglishLocked } from "@/lib/use-english-locked";
import { sixAnswerDisplay, sixAnswerResponse, sixAnswerValues, sixQuestionInputCount } from "@/lib/english-six-answer";
import EnglishSixAnswerFields from "./english-six-answer-fields";
import styles from "./english-six.module.css";

type Rating = "mastered" | "retry";
type Progress = { index: number; drafts: Record<string, string>; results: Record<string, SixFeedback>; ratings?: Record<string, Rating> };
export default function EnglishSixPractice({ subjectId, unit }: { subjectId: string; unit: number }) {
  const locked = useEnglishLocked("six", subjectId);
  const [paper, setPaper] = useState<SixPaper>();
  const [progress, setProgress] = useState<Progress>({ index: 0, drafts: {}, results: {} });
  const [ready, setReady] = useState(false);
  const [loadedMode, setLoadedMode] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const params = useSearchParams();
  const mistakes = params.get("mode") === "mistakes";
  const storage = `english-six:${subjectId}:unit${unit}:v1`;
  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setFinished(false); setError("");
    setReviewIndex(0);
    fetch(`/api/english/six/practice/${unit}`, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("此单元练习暂时不可用");
      const data = await r.json() as SixPaper;
      setPaper(data);
      try {
        const saved = JSON.parse(localStorage.getItem(storage) ?? "null") as Progress | null;
        if (saved && saved.drafts && saved.results && Number.isInteger(saved.index)) {
          setProgress({ ...saved, index: Math.max(0, Math.min(data.questions.length - 1, saved.index)) });
        } else setProgress({ index: 0, drafts: {}, results: {} });
      } catch { setProgress({ index: 0, drafts: {}, results: {} }); }
      setReady(true);
      setLoadedMode(mistakes);
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [unit, storage, mistakes]);
  useEffect(() => {
    if (!ready || paper?.unit !== unit || loadedMode !== mistakes) return;
    try { localStorage.setItem(storage, JSON.stringify(progress)); } catch { /* Continue in memory. */ }
  }, [progress, ready, storage, paper?.unit, unit, loadedMode, mistakes]);
  const serverResults = useMemo(() => Object.fromEntries(Object.entries(locked.records).filter(([id]) => id.startsWith(`u${unit}-`)).map(([id, record]) => [id, { id, response: typeof record.response === "string" ? record.response : "", ...record.feedback } satisfies SixFeedback])), [locked.records, unit]);
  const questions = useMemo(() => paper?.questions.filter(q => !mistakes || serverResults[q.id]?.correct === false) ?? [], [paper, mistakes, serverResults]);
  const loaded = ready && locked.ready && loadedMode === mistakes && paper?.unit === unit;
  const position = Math.min(mistakes ? reviewIndex : progress.index, Math.max(0, questions.length - 1));
  const question = questions[position];
  const results = serverResults;
  const feedback = question && results[question.id];
  const draft = question ? feedback?.response ?? progress.drafts[question.id] ?? "" : "";
  const inputs = question ? sixAnswerValues(question.inputCount ?? sixQuestionInputCount(question), draft) : [];
  const complete = inputs.length > 0 && inputs.every(value => !!value.trim());
  const stats = englishSixAccuracy(results);
  const updateDraft = (value: string) => {
    if (!question || feedback || locked.busy || !locked.ready || mistakes) return;
    setProgress(p => ({ ...p, drafts: { ...p.drafts, [question.id]: value } }));
  };
  const submit = async () => {
    if (!question || feedback || !complete || busy || !locked.ready || mistakes) return;
    setBusy(true); setError("");
    try {
      const saved = await locked.submit(question.id, draft);
      const result: SixFeedback = { id: saved.id, response: typeof saved.response === "string" ? saved.response : draft, ...saved.feedback };
      setProgress(p => ({ ...p, drafts: { ...p.drafts, [question.id]: result.response }, results: { ...p.results, [question.id]: result } }));
    } catch (e) { setError(e instanceof Error ? e.message : "提交失败"); }
    finally { setBusy(false); }
  };
  const move = (n: number) => { if (mistakes) setReviewIndex(n); else setProgress(p => ({ ...p, index: n })); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const reviewFromStart = () => { move(0); setFinished(false); };
  return <main className={styles.practicePage}>
    <Link href={`/subjects/${subjectId}/english/six?unit=${unit}&stage=test`} className={styles.back}>← 返回六上目录</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>Unit {unit} · {mistakes ? "错题复习" : "单元测评"}</p><h1>{paper?.title ?? "单元测评"}</h1></div>
      <div className={styles.stats}><div><strong>{stats.answered}/{mistakes ? questions.length : 66}</strong><span>已答</span></div><div><strong>{stats.accuracy === null ? "--" : `${stats.accuracy}%`}</strong><span>客观题正确率</span></div><div><strong>{Object.values(results).filter(r => r.correct === false).length}</strong><span>错题</span></div></div>
    </header>
    {(error || locked.error) && <p role="alert" className={styles.warning}>{error || locked.error}</p>}
    {!loaded && !error && <p role="status">正在载入题目…</p>}
    {loaded && !question && <p className={styles.empty}>暂无已记录错题</p>}
    {loaded && question && !finished && <>
      <div className={styles.questionHead}><span>第 {position + 1} / {questions.length} 题</span><label>跳转<select aria-label="跳转题目" disabled={busy} value={position} onChange={e => move(Number(e.target.value))}>{questions.map((q, i) => <option key={q.id} value={i}>{i + 1}{results[q.id] ? " · 已答" : ""}</option>)}</select></label></div>
      <div className={styles.questionSurface} key={question.id}>
        <p className={styles.topic}>{question.topic}</p>
        {question.context && <details className={styles.passage} open><summary>阅读材料 / 题组说明</summary><p>{question.context}</p></details>}
        <EnglishSixAnswerFields question={question} values={inputs} disabled={!!feedback || busy || mistakes} feedback={feedback} onChange={values => updateDraft(sixAnswerResponse(values))} onSubmit={submit} />
        {feedback ? <section className={styles.feedback} aria-live="polite" data-result={feedback.correct === false ? "wrong" : "correct"}>
          <strong>{feedback.correct === null ? "已提交 · 待评价" : feedback.correct ? "回答正确 · 已锁定" : "回答错误 · 已锁定"}</strong>
          <p>你的首次答案：{sixAnswerDisplay(feedback.response)}</p>
          <p className={styles.answer}>答案：{feedback.answer}{question.options.find(o => o.id === feedback.answer) ? ` · ${question.options.find(o => o.id === feedback.answer)?.text}` : ""}</p>
          <p>{feedback.explanation}</p>
          {feedback.correct === null && <small>开放题不计入自动判题正确率，首次作答保留待教师评价。</small>}
        </section> : <button className={styles.primary} disabled={!complete || busy} onClick={submit}>{busy ? "提交中…" : "提交答案"}</button>}
      </div>
      <div className={styles.bottomNav}><button className={styles.secondary} disabled={!position || busy} onClick={() => move(position - 1)}>← 上一题</button>
        <span>{position + 1} / {questions.length}</span>
        <button className={styles.primary} disabled={!feedback || busy} onClick={() => position + 1 < questions.length ? move(position + 1) : setFinished(true)}>{position + 1 < questions.length ? "下一题 →" : "查看成绩"}</button></div>
      <p className={styles.textButton}>提交后永久锁定，成绩按首次作答统计。</p>
    </>}
    {finished && <section className={styles.results}><h2>{stats.answered === questions.length ? "本套练习完成" : "本套练习进度"}</h2><p>已答 {stats.answered} / {questions.length} 题 · 客观题答对 {stats.correct} / {stats.graded} · 正确率 {stats.accuracy ?? 0}%</p><p>开放题不计入客观题正确率，原答案保留待教师评价。</p><button className={styles.primary} onClick={reviewFromStart}>回看首次作答</button>{unit < 8 && <Link href={`/subjects/${subjectId}/english/six/practice/${unit + 1}`} className={styles.secondary}>Unit {unit + 1} →</Link>}</section>}
  </main>;
}
