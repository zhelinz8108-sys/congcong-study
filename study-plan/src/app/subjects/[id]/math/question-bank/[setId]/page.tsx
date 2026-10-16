"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MathText } from "@/components/math-text";
import { formatMathAnswer } from "@/lib/math-explanation-display";

type Question = {
  id: string; question_number: string; question_type: string; prompt: string;
  options: { key: string; text: string }[]; locked: boolean; response_text: string | null;
  correct_answer?: unknown; explanation?: string; is_correct: boolean | null; grading_status: string | null;
};
export default function MathPracticePage() {
  const { id, setId } = useParams<{ id: string; setId: string }>();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<string | null>(null);
  const inflight = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/math/question-sets/${encodeURIComponent(setId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "题库无法读取");
    setTitle(data.set.title);
    setQuestions(data.questions);
    setReady(true);
  }, [setId]);
  useEffect(() => {
    setReady(false); attempt.current = null;
    void load().catch(err => setError(err instanceof Error ? err.message : "加载失败"));
  }, [load]);
  const question = questions[index];
  const value = question?.locked ? question.response_text ?? "" : drafts[question?.id] ?? "";
  const submit = async () => {
    if (!question || question.locked || !value.trim() || inflight.current || !ready) return;
    inflight.current = true; setBusy(true); setError("");
    try {
      if (!attempt.current) {
        const response = await fetch("/api/math/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set_id: setId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法建立练习");
        attempt.current = data.id;
      }
      const response = await fetch(`/api/math/attempts/${attempt.current}/responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_id: question.id, response_text: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "提交失败");
      // Immediately use the original server response, even if another device won.
      setQuestions(prev => prev.map(q => q.id === question.id ? { ...q, locked: true, response_text: data.response_text, is_correct: data.feedback.isCorrect, grading_status: data.feedback.status, correct_answer: data.feedback.answer, explanation: data.feedback.explanation } : q));
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败，请稍后重试"); }
    finally { inflight.current = false; setBusy(false); }
  };
  return <main className="min-h-screen bg-[#fffaf3] px-4 py-8 text-[#65452d]">
    <div className="mx-auto max-w-3xl">
      <Link href={`/subjects/${id}/math/question-bank`} className="text-sm">← 返回题库</Link>
      <h1 className="my-5 text-2xl font-bold">{title || "数学练习"}</h1>
      {error && <p role="alert" className="mb-4 rounded-xl bg-orange-50 p-3 text-orange-800">{error}</p>}
      {!ready ? <p>正在读取首次答题记录…</p> : question ? <section className="rounded-3xl border border-orange-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-between"><h2 className="font-bold">第 {question.question_number || index + 1} 题 / {questions.length}</h2><span>{question.locked ? "已提交 · 已锁定" : "未提交"}</span></div>
        <div className="whitespace-pre-wrap text-lg leading-9"><MathText text={question.prompt} /></div>
        <fieldset disabled={question.locked || busy || !ready} className="my-6 space-y-3">
          {question.question_type === "choice" ? question.options.map(option => <label key={option.key} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${value === option.key ? "border-orange-400 bg-orange-50" : "border-orange-100"}`}>
            <input type="radio" name={question.id} checked={value === option.key} onChange={() => setDrafts(prev => ({ ...prev, [question.id]: option.key }))} />{option.key} <MathText text={option.text} />
          </label>) : question.question_type === "true_false" ? ["√", "×"].map(option => <label key={option} className="flex gap-3 rounded-xl border border-orange-100 p-4"><input type="radio" name={question.id} checked={value === option} onChange={() => setDrafts(prev => ({ ...prev, [question.id]: option }))} />{option}</label>)
          : <textarea aria-label="答案" value={value} onChange={event => setDrafts(prev => ({ ...prev, [question.id]: event.target.value }))} className="min-h-28 w-full rounded-xl border border-orange-200 p-4" />}
        </fieldset>
        {question.locked && <div aria-live="polite" className="mb-6 rounded-xl bg-orange-50 p-4 leading-7">
          <p className="font-bold">{question.grading_status === "self_review" ? "已锁定 · 待评阅" : question.is_correct ? "回答正确 · 已锁定" : "回答错误 · 已锁定"}</p>
          <p>参考答案：<MathText text={formatMathAnswer(question.correct_answer as Parameters<typeof formatMathAnswer>[0])} /></p>
          {question.explanation && <MathText text={question.explanation} />}
        </div>}
        <p className="mb-3 text-xs text-[#95765c]">提交后不能修改，不会自动跳题。</p>
        <div className="flex gap-3">
          <button disabled={index === 0 || busy} onClick={() => setIndex(i => i - 1)} className="rounded-xl border border-orange-200 px-4 py-3 disabled:opacity-40">上一题</button>
          <button disabled={question.locked || busy || !value.trim()} onClick={() => void submit()} className="flex-1 rounded-xl bg-[#bc7439] py-3 font-bold text-white disabled:opacity-40">{question.locked ? "已锁定" : busy ? "正在提交…" : "提交答案"}</button>
          <button disabled={index >= questions.length - 1 || busy} onClick={() => setIndex(i => i + 1)} className="rounded-xl border border-orange-200 px-4 py-3 disabled:opacity-40">下一题</button>
        </div>
      </section> : <p>此题集没有题目。</p>}
    </div>
  </main>;
}
