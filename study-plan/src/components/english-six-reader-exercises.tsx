"use client";

import { useState, type ReactNode } from "react";
import type { SixBankQuestion } from "@/lib/english-six-bank";
import { sixBankInputs, sixBankResponse } from "@/lib/english-six-bank";
import { sixAnswerDisplay } from "@/lib/english-six-answer";
import type { SixFeedback, SixPage } from "@/lib/english-six";
import { useEnglishLocked } from "@/lib/use-english-locked";
import type { ReaderNode } from "@/lib/english-six-document";
import EnglishSixAnswerFields from "./english-six-answer-fields";
import shared from "./english-six.module.css";
import styles from "./english-six-document.module.css";

export default function EnglishSixReaderExercises({ subjectId, questions, content, children }: {
  subjectId: string; questions: SixBankQuestion[]; content: SixPage;
  children: (renderQuestion: (node: ReaderNode) => ReactNode) => ReactNode;
}) {
  const locked = useEnglishLocked("six", subjectId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const completed = questions.filter(q => locked.records[q.id]);
  const correct = completed.filter(q => locked.records[q.id].feedback.correct === true).length;
  async function submit(question: SixBankQuestion) {
    const response = drafts[question.id] ?? "";
    if (!locked.ready || pending || locked.records[question.id] || sixBankInputs(question, response).some(value => !value.trim())) return;
    setPending(question.id); setError("");
    try { await locked.submit(question.id, response); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败，请重试"); }
    finally { setPending(null); }
  }
  function renderQuestion(node: ReaderNode) {
    const items = questions.filter(q => node.sources.includes(q.sourceBlock));
    if (!items.length) return null;
    return <>{items.map(question => {
    const record = locked.records[question.id];
    const feedback: SixFeedback | undefined = record ? { id: question.id, response: typeof record.response === "string" ? record.response : "", ...record.feedback } : undefined;
    const value = feedback?.response ?? drafts[question.id] ?? "";
    const values = sixBankInputs(question, value);
    return <div key={question.id} className={styles.exercise} data-reader-exercise={question.id}>
      {question.context && !content.blocks.some(block => block.kind === "text" && block.text.trim() === question.context) && <p className={styles.exerciseInstruction}>{question.context}</p>}
      <EnglishSixAnswerFields question={question} values={values} disabled={!locked.ready || !!pending || !!feedback}
        feedback={feedback} onChange={inputs => setDrafts(previous => ({ ...previous, [question.id]: sixBankResponse(question, inputs) }))} onSubmit={() => void submit(question)} />
      {feedback ? <div className={shared.feedback} aria-live="polite" data-result={feedback.correct === false ? "wrong" : "correct"}>
        <strong>{feedback.correct === null ? "已提交 · 待评价" : feedback.correct ? "回答正确 · 已保存" : "回答错误 · 已保存"}</strong>
        <p>你的首次答案：{sixAnswerDisplay(feedback.response)}</p><p>答案：{feedback.answer}{question.options.find(option => option.id === feedback.answer) ? ` · ${question.options.find(option => option.id === feedback.answer)!.text}` : ""}</p><p>{feedback.explanation}</p>
        {feedback.correct === null && <small>句型转换等开放作答请对照参考答案，不计入客观题正确率。</small>}
      </div> : <button type="button" className={shared.primary} disabled={!locked.ready || !!pending || values.some(input => !input.trim())} onClick={() => void submit(question)}>
        {pending === question.id ? "提交中…" : "提交答案"}
      </button>}
    </div>;
    })}</>;
  }
  return <>
    <div className={styles.exerciseSummary}>
      <strong>本页互动练习</strong><span>已答 {completed.length}/{questions.length} · 答对 {correct} 题</span>
      <p>在横线处输入答案，提交后查看对错与解析。首次作答会自动保存。</p>
      {!locked.ready && !locked.error && <p role="status">正在读取答题记录…</p>}
      {(error || locked.error) && <p role="alert">{error || locked.error}</p>}
    </div>
    {children(renderQuestion)}
  </>;
}
