"use client";

import Link from "next/link";
import { memo, useState, type CSSProperties } from "react";
import NationalDayMathDiagram from "@/components/national-day-math-diagram";
import { getNationalDayMathPalette } from "@/lib/national-day-math-colors";
import styles from "./national-day-math-book.module.css";
import { useNationalDayMathProgress } from "@/lib/national-day-math-progress";
import type { NationalDayMathAttempt } from "@/lib/national-day-math-progress";
import type { NationalDayMathBlock, NationalDayMathPublicQuestion, NationalDayMathPublicSection, NationalDayMathSubmissionResult } from "@/lib/national-day-math";
import { nationalDayMathChapterStats, type NationalDayMathChapterSummary } from "@/lib/national-day-math-chapters";

function MathText({ text }: { text: string }) {
  // Fractions stay selectable native HTML, with a spoken equivalent for readers.
  const pieces = text.split(/(\d+(?:\.\d+)?\/\d+(?:\.\d+)?)/g);
  return <>{pieces.map((piece, index) => {
    const fraction = piece.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (!fraction) return <span key={index}>{piece}</span>;
    return <span key={index} className="mx-0.5 inline-flex min-w-4 flex-col items-center align-middle text-[0.9em] leading-tight" aria-label={`${fraction[2]}分之${fraction[1]}`}><span aria-hidden="true" className="w-full border-b border-current px-1 text-center">{fraction[1]}</span><span aria-hidden="true" className="px-1">{fraction[2]}</span></span>;
  })}</>;
}

function draftFields(value: string, question: NationalDayMathPublicQuestion): Record<string, string> {
  if (question.type !== "quiz") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(question.fields.map(field => [field.id,
        Object.hasOwn(parsed, field.id) && typeof (parsed as Record<string, unknown>)[field.id] === "string"
          ? (parsed as Record<string, string>)[field.id] : "",
      ]));
    }
  } catch { /* Keep a one-field legacy draft without inventing multipart answers. */ }
  return question.fields.length === 1 ? { [question.fields[0].id]: value } : {};
}

const QuestionCard = memo(function QuestionCard({ question, sectionId, tone, ready, attempt, saveDraft, recordAttempt }: {
  question: NationalDayMathPublicQuestion;
  sectionId: string;
  tone: "tint" | "white";
  ready: boolean;
  attempt?: NationalDayMathAttempt;
  saveDraft: ReturnType<typeof useNationalDayMathProgress>["saveDraft"];
  recordAttempt: ReturnType<typeof useNationalDayMathProgress>["recordAttempt"];
}) {
  const isQuiz = question.type === "quiz";
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<NationalDayMathSubmissionResult | null>(null);
  const values = draftFields(attempt?.value ?? "", question);
  const solution = question.type === "example" ? question : feedback;

  function changeField(id: string, value: string) {
    saveDraft(question.id, JSON.stringify({ ...values, [id]: value }), sectionId);
    setFeedback(null);
    setNotice("");
  }

  async function submit() {
    if (question.type !== "quiz" || pending || !ready) return;
    setFeedback(null);
    const missing = question.fields.find(field => !values[field.id]?.trim());
    if (missing) {
      setNotice(`请先完成：${missing.label}`);
      return;
    }
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/math/national-day/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answers: values }), cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交失败，请稍后重试。");
      if (result.questionId !== question.id || typeof result.correct !== "boolean" || typeof result.answer !== "string" ||
          !Array.isArray(result.steps) || !Array.isArray(result.fields) || result.fields.length !== question.fields.length) {
        throw new Error("判题结果不完整，请重新提交。");
      }
      setFeedback(result as NationalDayMathSubmissionResult);
      recordAttempt(question.id, {
        value: JSON.stringify(values), checked: true, correct: result.correct, gradingVersion: 2,
      }, sectionId);
    } catch (error) {
      setNotice(error instanceof Error && error.name === "TimeoutError"
        ? "提交超时，答案仍已保存在草稿中，请重新提交。"
        : error instanceof Error ? error.message : "网络暂时不可用，请重新提交。");
    } finally { setPending(false); }
  }

  return (
    <article id={`question-${question.id}`} data-math-question={question.id} data-question-category={question.category} data-card-tone={tone} className={`my-6 scroll-mt-8 rounded-2xl border p-5 sm:p-6 ${isQuiz ? styles.quiz : styles.example}`}>
      <p className={`text-xs font-bold tracking-wide ${isQuiz ? styles.practiceAccent : styles.accent}`}>{question.label}</p>
      {question.title && <h4 className="mt-2 text-lg font-bold leading-8 text-slate-800"><MathText text={question.title} /></h4>}
      <p className="mt-3 whitespace-pre-wrap text-[16px] leading-8 text-slate-700"><MathText text={question.question} /></p>
      {question.type === "quiz" && <form className="mt-5" onSubmit={event => { event.preventDefault(); void submit(); }} noValidate>
        <div className="space-y-4">
          {question.fields.map((field, index) => {
            const inputId = index === 0 ? `draft-${question.id}` : `draft-${question.id}-${field.id}`;
            const result = feedback?.fields.find(item => item.id === field.id);
            const className = "mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-7 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50";
            return <div key={field.id}>
              <label htmlFor={inputId} className="block text-sm font-bold leading-7 text-slate-600">{field.label}</label>
              {field.kind === "choice"
                ? <select id={inputId} data-math-input={question.id} data-field-id={field.id} value={values[field.id] ?? ""} disabled={!ready || pending} onChange={event => changeField(field.id, event.target.value)} className={className}><option value="">请选择你的判断……</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select>
                : <input id={inputId} data-math-input={question.id} data-field-id={field.id} type="text" autoComplete="off" value={values[field.id] ?? ""} disabled={!ready || pending} maxLength={200} onChange={event => changeField(field.id, event.target.value)} placeholder={ready ? "输入这一小问的答案……" : "正在载入学习记录……"} className={className} />}
              {field.hint && <p className="mt-1 text-xs leading-6 text-slate-500">{field.hint}</p>}
              {result && <p data-math-field-result={field.id} className={`mt-2 text-sm leading-7 ${result.correct ? "text-teal-700" : "text-amber-800"}`}>{result.correct ? "✓ 这一项正确" : "✗ 这一项需要订正"} · 正确答案：<MathText text={result.expected} /></p>}
            </div>;
          })}
        </div>
        <p className="mt-3 text-xs leading-6 text-slate-500">填写每个小问后提交，系统会自动判分，并显示正确答案与解析。提交前不会显示解答。</p>
        <button type="submit" disabled={!ready || pending} className={`mt-3 block w-full rounded-xl border px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${styles.checkButton}`}>{pending ? "正在提交判题……" : "提交答案"}</button>
        {notice && <p role="alert" className="mt-3 rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm leading-7 text-amber-800">{notice}</p>}
        {feedback && <p data-math-feedback={question.id} role="status" className={`mt-3 rounded-xl border bg-white px-4 py-3 text-sm font-bold leading-7 ${feedback.correct ? "border-teal-200 text-teal-800" : "border-amber-200 text-amber-800"}`}>{feedback.correct ? "✓ 回答正确！" : "✗ 还有小问需要订正。"} 本题答对 {feedback.fields.filter(field => field.correct).length} / {feedback.fields.length} 项。</p>}
        {!feedback && attempt?.gradingVersion === 2 && attempt.checked && <p className="mt-3 text-xs leading-6 text-slate-500">上次提交：{attempt.correct ? "系统判对" : "需要订正"}。本次提交后重新显示答案与解析。</p>}
      </form>}
      {solution && <div data-math-answer={question.id} className="mt-5 border-t border-slate-200/80 pt-4">
        {solution.steps.length > 0 && <ol className="space-y-3 text-[15px] leading-8 text-slate-700">{solution.steps.map((step, index) => <li key={index} className="whitespace-pre-wrap"><span className={`mr-2 font-semibold ${styles.accent}`}>{index + 1}.</span><MathText text={step} /></li>)}</ol>}
        <p className={`mt-4 whitespace-pre-wrap rounded-xl border px-4 py-3 text-base font-bold leading-8 ${styles.answer}`}><span className="mr-1">答案：</span><MathText text={solution.answer} /></p>
        {solution.pitfall && <p className="mt-3 text-sm leading-7 text-slate-500"><span className="font-bold text-amber-700">易错提醒：</span><MathText text={solution.pitfall} /></p>}
      </div>}
    </article>
  );
});

function TextBlock({ block }: { block: Extract<NationalDayMathBlock, { type: "text" | "heading" | "formula" }> }) {
  if (block.type === "heading") return <h3 className={`mb-4 mt-9 text-xl font-bold leading-9 ${styles.heading}`}><MathText text={block.text} /></h3>;
  if (block.type === "formula") return <div className={`my-5 rounded-2xl border p-5 ${styles.formula}`}><h3 className={`text-base font-bold leading-7 ${styles.accent}`}><MathText text={block.title} /></h3><p className={`mt-3 whitespace-pre-wrap text-lg font-semibold leading-9 ${styles.accent}`}><MathText text={block.formula} /></p><p className="mt-3 text-sm leading-7 text-slate-600"><MathText text={block.note} /></p></div>;
  return <p className="my-3 whitespace-pre-wrap break-words text-[16px] leading-9 text-slate-700"><MathText text={block.text} /></p>;
}

export default function NationalDayMathBook({ subjectId, sections, chapter, nextChapter }: {
  subjectId: string;
  sections: NationalDayMathPublicSection[];
  chapter: NationalDayMathChapterSummary;
  nextChapter?: NationalDayMathChapterSummary;
}) {
  const learning = useNationalDayMathProgress(subjectId);
  const { progress, ready, saveDraft, recordAttempt } = learning;
  const chapters = sections.filter((section) => section.kind === "chapter");
  const complete = new Set(progress.completedSections);
  const finished = chapters.filter((section) => complete.has(section.id)).length;
  const stats = nationalDayMathChapterStats(chapter.quizIds, progress.attempts);
  const quizCount = stats.total;
  const resume = sections.find((section) => section.id === progress.lastSection);

  return (
    <main className="min-h-screen bg-white text-slate-800" data-national-day-math-book data-math-chapter={chapter.id}>
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link href={`/subjects/${subjectId}/national-day-math`} className={styles.directoryBack}>← 返回章节目录</Link>
        <header className={`mt-6 rounded-[28px] border p-6 sm:p-8 ${styles.hero}`}>
          <p className="text-sm font-bold text-sky-700">🍁 国庆数学 · 三天完整学习</p>
          <h1 className="mt-4 text-3xl font-black leading-snug tracking-tight text-slate-800 sm:text-4xl">{chapter.title}</h1>
          <p className="mt-4 text-[15px] leading-8 text-slate-600">{chapter.subtitle}。先理解知识点，再看图解与例题，最后独立完成本章自测。</p>
          <p className="mt-4 text-sm font-bold leading-7 text-sky-800">本部分 · {chapter.examples}道例题 · {quizCount}道诊断与自测</p>
          <p className="mt-3 text-sm leading-7 text-slate-500">本章知识点与教学例题完整展开，从上往下学习。自测先输入答案并提交，再看系统判分和解析。各章分开阅读，原有学习记录继续保留。</p>
          <p className="mt-3 text-sm leading-7 text-slate-500">按所提供的2026秋苏教版六上教材整理。单纯看懂答案不等于学会，用自测和最后20题检查掌握，再换数重做。</p>
        </header>

        <section aria-label="国庆数学学习进度" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-bold">本部分学习进度</h2>
          {chapters.length > 0 && <><p className="mt-3 text-sm leading-7 text-slate-600">已读完 {ready ? finished : "--"} / {chapters.length} 个单元与活动</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-50" role="progressbar" aria-label="已读完的单元与活动" aria-valuemin={0} aria-valuemax={chapters.length} aria-valuenow={finished}><div className={`h-full rounded-full transition-all ${styles.progressFill}`} style={{ width: `${finished / chapters.length * 100}%` }} /></div></>}
          <p className="mt-3 text-sm leading-7 text-slate-500">已答 {ready ? stats.answered : "--"} / {quizCount} 题 · 系统判对 {ready ? stats.correct : "--"} 题 · 待订正 {ready ? stats.wrong : "--"} 题</p>
          <p className="mt-3 text-base font-bold text-sky-800">正确率 {ready ? stats.accuracy === null ? "— · 尚未作答" : `${stats.accuracy}%` : "读取中…"}</p>
          <p className="mt-2 text-xs leading-6 text-slate-400">作答草稿和系统判题记录使用当前小朋友档案保存。旧版自行标记的结果不计入系统判对数。</p>
          {ready && resume && <a href={`#math-section-${resume.id}`} className="mt-3 block rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-center text-sm font-semibold text-sky-800">回到上次学习的位置 ↓</a>}
          <p className="mt-3 text-sm leading-7 text-slate-500">自测解答默认隐藏，提交这一题后才显示；重新修改输入，会再次隐藏解答。</p>
        </section>

        <div className="mt-10 space-y-12" aria-label="本章全部学习内容">
          {sections.map((section, index) => {
            const palette = getNationalDayMathPalette(section.id);
            const colors = {
              "--math-accent": palette.accent, "--math-soft": palette.soft,
              "--math-tint": palette.tint, "--math-border": palette.border, "--math-marker": palette.marker,
              "--math-practice-soft": palette.practiceSoft, "--math-practice-accent": palette.practiceAccent,
              "--math-practice-border": palette.practiceBorder,
            } as CSSProperties;
            let exampleIndex = 0;
            return <section key={section.id} id={`math-section-${section.id}`} data-math-section={section.id} data-math-theme={palette.id} style={colors} className={`scroll-mt-8 border-t pt-8 ${styles.section}`}>
            <p className={`text-xs font-bold tracking-wider ${styles.sectionLabel}`}>{section.day ? `第${section.day}天 · ` : section.kind === "review" ? "复习与速查 · " : "学习准备 · "}{String(index + 1).padStart(2, "0")}</p>
            <h2 className="mb-5 mt-3 text-2xl font-black leading-10 text-slate-800 sm:text-3xl">{section.title}</h2>
            {section.blocks.map((block, blockIndex) => {
              if (block.type === "example" || block.type === "quiz") return <QuestionCard key={block.id} question={block} sectionId={section.id} tone={block.type === "example" && exampleIndex++ % 2 === 1 ? "white" : "tint"} ready={ready} attempt={progress.attempts[block.id]} saveDraft={saveDraft} recordAttempt={recordAttempt} />;
              if (block.type === "diagram") return <NationalDayMathDiagram key={`${section.id}-${block.id}`} id={block.id} />;
              if (block.type === "text" || block.type === "heading" || block.type === "formula") return <TextBlock key={`${section.id}-${blockIndex}`} block={block} />;
              return null;
            })}
            {section.kind === "chapter" && <button type="button" disabled={!ready} onClick={() => learning.completeSection(section.id)} className={`mt-6 block w-full rounded-2xl border px-5 py-4 text-sm font-bold transition disabled:opacity-50 ${complete.has(section.id) ? "border-teal-200 bg-teal-50 text-teal-800" : styles.completeButton}`}>{complete.has(section.id) ? "✓ 已标记读完，记得换数重做" : "这一部分已读完，并已练习"}</button>}
          </section>;
          })}
        </div>

        <footer id="national-day-math-end" className={`mt-12 rounded-3xl border p-6 text-center ${styles.footer}`}>
          <h2 className="text-xl font-bold text-slate-800">这一部分读完了 🍁</h2>
          <p className="mt-3 text-sm leading-8 text-slate-600">本部分知识点、{chapter.examples}道例题和{quizCount}道自测，都在上方。把不熟悉的部分换数重做，第二天和一周后再检查一次。</p>
          {nextChapter && <Link href={`/subjects/${subjectId}/national-day-math/${nextChapter.id}`} prefetch={false} className={styles.directoryBack}>继续：{nextChapter.title} →</Link>}
          <Link href={`/subjects/${subjectId}/national-day-math`} className="mt-4 block text-sm font-semibold text-sky-700">← 返回章节目录</Link>
        </footer>
      </div>
    </main>
  );
}
