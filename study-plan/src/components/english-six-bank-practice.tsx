"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { sixBankInputs, sixBankResponse, type SixBankPaper } from "@/lib/english-six-bank";
import { englishSixAccuracy, type SixFeedback } from "@/lib/english-six";
import { useEnglishLocked } from "@/lib/use-english-locked";
import { sixAnswerDisplay } from "@/lib/english-six-answer";
import EnglishSixAnswerFields from "./english-six-answer-fields";
import styles from "./english-six.module.css";

type Drafts = { position: number; values: Record<string, string> };
export default function EnglishSixBankPractice({ subjectId, paperId, resourceId }: { subjectId: string; paperId: string; resourceId?: string }) {
  const params = useSearchParams();
  const locked = useEnglishLocked("six", subjectId);
  const [paper, setPaper] = useState<SixBankPaper>();
  const [state, setState] = useState<Drafts>({ position: 0, values: {} });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const initialized = useRef(false);
  const storage = `english-six:bank:${subjectId}:${paperId}:v1`;
  const base = `/subjects/${subjectId}/english/six`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(resourceId ? `/api/english/six/resource/${resourceId}/practice` : `/api/english/six/bank/${paperId}`, { signal: controller.signal, cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error("此题组尚未完成匹配或不存在");
      const p = await r.json() as SixBankPaper;
      if (controller.signal.aborted) return;
      let saved: Drafts = { position: 0, values: {} };
      try {
        const candidate = JSON.parse(localStorage.getItem(storage) ?? "null") as Drafts | null;
        if (candidate && Number.isInteger(candidate.position) && candidate.values && typeof candidate.values === "object") saved = {
          position: Math.max(0, Math.min(p.questions.length - 1, candidate.position)),
          values: Object.fromEntries(Object.entries(candidate.values).filter(([id, v]) => typeof v === "string" && p.questions.some(q => q.id === id))),
        };
      } catch { /* Continue without browser storage. */ }
      if (!initialized.current) { initialized.current = true; setState(saved); }
      setPaper(p);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "读取失败"); });
    return () => controller.abort();
  }, [paperId, resourceId, storage]);
  useEffect(() => {
    if (paper?.id !== paperId) return;
    try { localStorage.setItem(storage, JSON.stringify(state)); } catch { /* Cloud submissions remain available. */ }
  }, [state, paper?.id, paperId, storage]);
  const results = useMemo(() => Object.fromEntries((paper?.questions ?? []).filter(q => locked.records[q.id]).map(q => {
    const r = locked.records[q.id];
    return [q.id, { id: q.id, response: typeof r.response === "string" ? r.response : "", ...r.feedback } satisfies SixFeedback];
  })), [paper, locked.records]);
  const stats = englishSixAccuracy(results);
  const question = paper?.questions[state.position];
  const feedback = question && results[question.id];
  const draft = question ? feedback?.response ?? state.values[question.id] ?? "" : "";
  const inputs = question ? sixBankInputs(question, draft) : [];
  const canSubmit = !!question && locked.ready && !feedback && !busy && inputs.every(v => !!v.trim());
  function update(value: string) {
    if (!question || feedback || busy) return;
    setState(p => ({ ...p, values: { ...p.values, [question.id]: value } }));
  }
  async function submit() {
    if (!question || !canSubmit) return;
    setBusy(true); setError("");
    try { await locked.submit(question.id, draft); }
    catch (e) { setError(e instanceof Error ? e.message : "提交失败，请重试"); }
    finally { setBusy(false); }
  }
  function move(position: number) { setState(p => ({ ...p, position })); setFinished(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  return <main className={styles.practicePage}>
    <Link className={styles.back} href={resourceId ? `${base}?${params.toString()}` : `${base}/bank?${params.toString()}`}>{resourceId ? "← 返回六上目录" : "← 返回互动题组"}</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>{paper?.unit ? `Unit ${paper.unit}` : "六上英语"} · 原题练习</p><h1 className={styles.readerTitle}>{paper?.title ?? "互动练习"}</h1></div>
      <div className={styles.stats}><div><strong>{stats.answered}/{paper?.questions.length ?? 0}</strong><span>已答</span></div><div><strong>{stats.accuracy === null ? "--" : `${stats.accuracy}%`}</strong><span>客观题正确率</span></div></div>
    </header>
    {(error || locked.error) && <p role="alert" className={styles.warning}>{error || locked.error}</p>}
    {(!paper || !locked.ready) && !error && !locked.error && <p role="status">正在载入题目和答题记录…</p>}
    {paper && locked.ready && question && !finished && <>
      <div className={styles.questionHead}><span>第 {state.position + 1} / {paper.questions.length} 题</span><label>跳转<select aria-label="跳转题目" disabled={busy} value={state.position} onChange={e => move(Number(e.target.value))}>{paper.questions.map((q, i) => <option key={q.id} value={i}>{i + 1}{results[q.id] ? " · 已答" : ""}</option>)}</select></label></div>
      <section className={styles.questionSurface} key={question.id}>
        <p className={styles.topic}>{question.topic}</p>
        {question.context && <details className={styles.passage} open><summary>阅读材料 / 题组说明</summary><p>{question.context}</p></details>}
        <EnglishSixAnswerFields question={question} values={inputs} disabled={!!feedback || busy} feedback={feedback} onChange={values => update(sixBankResponse(question, values))} onSubmit={submit} />
        {feedback ? <section className={styles.feedback} aria-live="polite" data-result={feedback.correct === false ? "wrong" : "correct"}><strong>{feedback.correct === null ? "已提交 · 参考答案 · 已锁定" : feedback.correct ? "回答正确 · 已锁定" : "回答错误 · 已锁定"}</strong>
          <p>你的首次答案：{sixAnswerDisplay(feedback.response)}</p>
          <p className={styles.answer}>答案：{feedback.answer}{question.options.find(o => o.id === feedback.answer) ? ` · ${question.options.find(o => o.id === feedback.answer)?.text}` : ""}</p><p>{feedback.explanation}</p>
          {feedback.correct === null && <small>开放表达待教师评价，不计入客观题正确率。</small>}
        </section> : <button className={styles.primary} disabled={!canSubmit} onClick={submit}>{busy ? "提交中…" : "提交答案"}</button>}
        <Link className={styles.bankSourceLink} href={`${base}/resource/${paper.sourceId}?mode=source&unit=all&page=${question.sourcePage}`}>查看原题 · 第 {question.sourcePage} 页</Link>
      </section>
      <nav className={styles.bottomNav} aria-label="题目导航"><button className={styles.secondary} disabled={!state.position || busy} onClick={() => move(state.position - 1)}>← 上一题</button><span>{state.position + 1}/{paper.questions.length}</span><button className={styles.primary} disabled={!feedback || busy} onClick={() => state.position + 1 < paper.questions.length ? move(state.position + 1) : setFinished(true)}>{state.position + 1 < paper.questions.length ? "下一题 →" : "查看成绩"}</button></nav>
    </>}
    {finished && <section className={styles.results}><h2>{stats.answered === paper?.questions.length ? "题组完成" : "题组进度"}</h2><p>已答 {stats.answered} 题 · 客观题答对 {stats.correct}/{stats.graded} · 正确率 {stats.accuracy ?? "--"}{stats.accuracy === null ? "" : "%"}</p><button className={styles.secondary} onClick={() => move(0)}>回看作答</button><Link className={styles.primary} href={`${base}/bank?${params.toString()}`}>选择下一题组</Link></section>}
  </main>;
}
