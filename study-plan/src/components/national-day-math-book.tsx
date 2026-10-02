"use client";

import Link from "next/link";
import { memo, useState } from "react";
import NationalDayMathDiagram from "@/components/national-day-math-diagram";
import { checkMathAnswer } from "@/lib/national-day-math-answer";
import { useNationalDayMathProgress } from "@/lib/national-day-math-progress";
import type { NationalDayMathAttempt } from "@/lib/national-day-math-progress";
import type { NationalDayMathBlock, NationalDayMathQuestion, NationalDayMathSection } from "@/lib/national-day-math";

function MathText({ text }: { text: string }) {
  // Fractions stay selectable native HTML, with a spoken equivalent for readers.
  const pieces = text.split(/(\d+(?:\.\d+)?\/\d+(?:\.\d+)?)/g);
  return <>{pieces.map((piece, index) => {
    const fraction = piece.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (!fraction) return <span key={index}>{piece}</span>;
    return <span key={index} className="mx-0.5 inline-flex min-w-4 flex-col items-center align-middle text-[0.9em] leading-tight" aria-label={`${fraction[2]}分之${fraction[1]}`}><span aria-hidden="true" className="w-full border-b border-current px-1 text-center">{fraction[1]}</span><span aria-hidden="true" className="px-1">{fraction[2]}</span></span>;
  })}</>;
}

const QuestionCard = memo(function QuestionCard({ question, sectionId, hideQuizAnswers, answerEpoch, ready, attempt, saveDraft, recordAttempt }: {
  question: NationalDayMathQuestion;
  sectionId: string;
  hideQuizAnswers: boolean;
  answerEpoch: number;
  ready: boolean;
  attempt?: NationalDayMathAttempt;
  saveDraft: ReturnType<typeof useNationalDayMathProgress>["saveDraft"];
  recordAttempt: ReturnType<typeof useNationalDayMathProgress>["recordAttempt"];
}) {
  const isQuiz = question.type === "quiz";
  const [revealedEpoch, setRevealedEpoch] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const value = attempt?.value ?? "";
  const showAnswer = !isQuiz || !hideQuizAnswers || revealedEpoch === answerEpoch;
  const automatic = Boolean(question.accepted?.length);

  function check() {
    if (!value.trim()) {
      setNotice("先写下自己的答案或列式，再核对。也可以直接阅读下方的参考解答。");
      return;
    }
    const correct = checkMathAnswer(value, question.accepted);
    recordAttempt(question.id, { value, checked: true, correct, selfRated: false }, sectionId);
    setRevealedEpoch(answerEpoch);
    setNotice(correct === null ? "这题含步骤、说明或多个问法，请逐项对照参考解答，再标记自己的掌握情况。" : correct ? "核对正确！再说一说为什么这样列式。" : "结果还不一致，看看步骤和单位，再试一次。若表达形式不同，可按解答自行核对。");
  }

  function rate(correct: boolean) {
    recordAttempt(question.id, { value, checked: true, correct, selfRated: true }, sectionId);
    setRevealedEpoch(answerEpoch);
    setNotice(correct ? "已标记为掌握。建议明天遮住答案再做一遍。" : "已放入待巩固。先找错因，再换一组数字重做。");
  }

  return (
    <article id={`question-${question.id}`} data-math-question={question.id} data-question-category={question.category} className={`my-6 scroll-mt-8 rounded-2xl border p-5 sm:p-6 ${isQuiz ? "border-amber-100 bg-amber-50/30" : "border-sky-100 bg-sky-50/40"}`}>
      <p className={`text-xs font-bold tracking-wide ${isQuiz ? "text-amber-700" : "text-sky-700"}`}>{question.label}</p>
      {question.title && <h4 className="mt-2 text-lg font-bold leading-8 text-slate-800"><MathText text={question.title} /></h4>}
      <p className="mt-3 whitespace-pre-wrap text-[16px] leading-8 text-slate-700"><MathText text={question.question} /></p>
      {isQuiz && <div className="mt-5">
        <label htmlFor={`draft-${question.id}`} className="block text-sm font-bold text-slate-600">我的答案／列式</label>
        <textarea id={`draft-${question.id}`} value={value} disabled={!ready} maxLength={1200} rows={3} onChange={(event) => { saveDraft(question.id, event.target.value, sectionId); setNotice(""); }} placeholder={ready ? "先想一想，写下答案或计算过程……" : "正在载入学习记录……"} className="mt-2 block w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-7 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50" />
        <p className="mt-2 text-xs leading-6 text-slate-500">{automatic ? "本题有明确短答案，可以核对结果；单位和数量意义也要一致。" : "多问或需要说明的题，请按参考解答自行逐项核对，不会自动判错。"}</p>
        <button type="button" onClick={check} disabled={!ready} className="mt-3 block w-full rounded-xl border border-sky-200 bg-sky-100 px-4 py-3 text-sm font-bold text-sky-800 transition hover:bg-sky-200 disabled:opacity-50">核对答案与步骤</button>
        {hideQuizAnswers && !showAnswer && <button type="button" onClick={() => setRevealedEpoch(answerEpoch)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">直接看参考解答</button>}
        {(notice || attempt?.checked) && <p aria-live="polite" className="mt-3 rounded-xl border border-teal-100 bg-white px-4 py-3 text-sm leading-7 text-teal-800">{notice || (attempt?.correct === true ? "已标记掌握" : attempt?.correct === false ? "待巩固，换数再练一题" : "已查看解答，请逐项核对后自评")}{attempt?.selfRated && <span className="ml-2 text-xs text-slate-500">（自行核对）</span>}</p>}
      </div>}
      {showAnswer && <div data-math-answer={question.id} className="mt-5 border-t border-slate-200/80 pt-4">
        {question.steps.length > 0 && <ol className="space-y-3 text-[15px] leading-8 text-slate-700">{question.steps.map((step, index) => <li key={index} className="whitespace-pre-wrap"><span className="mr-2 font-semibold text-sky-700">{index + 1}.</span><MathText text={step} /></li>)}</ol>}
        <p className="mt-4 whitespace-pre-wrap rounded-xl border border-teal-100 bg-white px-4 py-3 text-base font-bold leading-8 text-teal-800"><span className="mr-1">答案：</span><MathText text={question.answer} /></p>
        {question.pitfall && <p className="mt-3 text-sm leading-7 text-slate-500"><span className="font-bold text-amber-700">易错提醒：</span><MathText text={question.pitfall} /></p>}
        {isQuiz && <div className="mt-4 flex flex-col gap-2" aria-label="自行核对掌握情况"><button type="button" onClick={() => rate(true)} disabled={!ready} aria-pressed={attempt?.correct === true} className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${attempt?.correct === true ? "border-teal-300 bg-teal-100 text-teal-800" : "border-teal-100 bg-white text-teal-700 hover:bg-teal-50"}`}>我已独立做对，并能解释</button><button type="button" onClick={() => rate(false)} disabled={!ready} aria-pressed={attempt?.correct === false} className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${attempt?.correct === false ? "border-amber-300 bg-amber-100 text-amber-800" : "border-amber-100 bg-white text-amber-700 hover:bg-amber-50"}`}>还需要巩固，再练一遍</button></div>}
      </div>}
    </article>
  );
});

function TextBlock({ block }: { block: Extract<NationalDayMathBlock, { type: "text" | "heading" | "formula" }> }) {
  if (block.type === "heading") return <h3 className="mb-4 mt-9 text-xl font-bold leading-9 text-teal-800"><MathText text={block.text} /></h3>;
  if (block.type === "formula") return <div className="my-5 rounded-2xl border border-sky-100 bg-sky-50/40 p-5"><h3 className="text-base font-bold leading-7 text-sky-800"><MathText text={block.title} /></h3><p className="mt-3 whitespace-pre-wrap text-lg font-semibold leading-9 text-sky-800"><MathText text={block.formula} /></p><p className="mt-3 text-sm leading-7 text-slate-600"><MathText text={block.note} /></p></div>;
  return <p className="my-3 whitespace-pre-wrap break-words text-[16px] leading-9 text-slate-700"><MathText text={block.text} /></p>;
}

export default function NationalDayMathBook({ subjectId, sections, stats }: {
  subjectId: string;
  sections: NationalDayMathSection[];
  stats: { examples: number; diagnostic: number; unitQuiz: number; comprehensive: number; answers: number };
}) {
  const learning = useNationalDayMathProgress(subjectId);
  const { progress, ready, saveDraft, recordAttempt } = learning;
  const [hideQuizAnswers, setHideQuizAnswers] = useState(false);
  const [answerEpoch, setAnswerEpoch] = useState(0);
  const chapters = sections.filter((section) => section.kind === "chapter");
  const complete = new Set(progress.completedSections);
  const finished = chapters.filter((section) => complete.has(section.id)).length;
  const allQuizIds = new Set(sections.flatMap((section) => section.blocks.filter((block): block is NationalDayMathQuestion => block.type === "quiz").map((block) => block.id)));
  const attempts = Object.entries(progress.attempts).filter(([id]) => allQuizIds.has(id)).map(([, attempt]) => attempt);
  const checked = attempts.filter((attempt) => attempt.checked).length;
  const mastered = attempts.filter((attempt) => attempt.checked && attempt.correct === true).length;
  const mistakes = attempts.filter((attempt) => attempt.checked && attempt.correct === false).length;
  const quizCount = stats.diagnostic + stats.unitQuiz + stats.comprehensive;
  const resume = sections.find((section) => section.id === progress.lastSection);

  return (
    <main className="min-h-screen bg-white text-slate-800" data-national-day-math-book>
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link href={`/subjects/${subjectId}`} className="inline-block rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-sky-50 hover:text-sky-700">← 返回数学</Link>
        <header className="mt-6 rounded-[28px] border border-sky-100 bg-sky-50/60 p-6 sm:p-8">
          <p className="text-sm font-bold text-sky-700">🍁 国庆数学 · 三天完整学习</p>
          <h1 className="mt-4 text-3xl font-black leading-snug tracking-tight text-slate-800 sm:text-4xl">把全书连成一个体系，<br />从上往下，一步一步学。</h1>
          <p className="mt-4 text-[15px] leading-8 text-slate-600">刚刚整理的整份学习内容，都已放进这一页。先理解知识点，再看图解与例题，最后独立尝试下面的自测。</p>
          <p className="mt-4 text-sm font-bold leading-7 text-sky-800">7个单元＋4个主题活动 · {stats.examples}道例题 · {quizCount}道诊断与自测</p>
          <p className="mt-3 text-sm leading-7 text-slate-500">所有知识点和例题答案默认完整展开。不用进入章节，不用打开PDF，直接往下读到底。每天约4.5小时有效学习，另留休息时间。</p>
          <p className="mt-3 text-sm leading-7 text-slate-500">按所提供的2026秋苏教版六上教材整理。单纯看懂答案不等于学会，建议遮住解答重做，并用最后20题检查掌握。</p>
        </header>

        <section aria-label="国庆数学学习进度" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-bold">我的学习进度</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">已读完 {ready ? finished : "--"} / {chapters.length} 个单元与活动</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-50" role="progressbar" aria-label="已读完的单元与活动" aria-valuemin={0} aria-valuemax={chapters.length} aria-valuenow={finished}><div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${chapters.length ? finished / chapters.length * 100 : 0}%` }} /></div>
          <p className="mt-3 text-sm leading-7 text-slate-500">已核对 {ready ? checked : "--"} / {quizCount} 题 · 已掌握 {ready ? mastered : "--"} 题 · 待巩固 {ready ? mistakes : "--"} 题</p>
          <p className="mt-2 text-xs leading-6 text-slate-400">作答草稿与掌握记录使用当前小朋友档案保存。自评是学习检查，不等同于考试成绩。</p>
          {ready && resume && <a href={`#math-section-${resume.id}`} className="mt-3 block rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-center text-sm font-semibold text-sky-800">回到上次学习的位置 ↓</a>}
          <button type="button" onClick={() => { setHideQuizAnswers((value) => !value); setAnswerEpoch((value) => value + 1); }} aria-pressed={hideQuizAnswers} className="mt-3 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">{hideQuizAnswers ? "展开全部自测解答" : "遮住自测答案，先独立做一遍"}</button>
          <p className="mt-2 text-xs leading-6 text-slate-400">这个开关只影响自测解答。知识点、图解和117道例题始终展开。</p>
        </section>

        <div className="mt-10 space-y-12" aria-label="国庆数学全部学习内容">
          {sections.map((section, index) => <section key={section.id} id={`math-section-${section.id}`} data-math-section={section.id} className="scroll-mt-8 border-t border-slate-100 pt-8">
            <p className="text-xs font-bold tracking-wider text-sky-700">{section.day ? `第${section.day}天 · ` : section.kind === "review" ? "复习与速查 · " : "学习准备 · "}{String(index + 1).padStart(2, "0")}</p>
            <h2 className="mb-5 mt-3 text-2xl font-black leading-10 text-slate-800 sm:text-3xl">{section.title}</h2>
            {section.blocks.map((block, blockIndex) => {
              if (block.type === "example" || block.type === "quiz") return <QuestionCard key={block.id} question={block} sectionId={section.id} hideQuizAnswers={hideQuizAnswers} answerEpoch={answerEpoch} ready={ready} attempt={progress.attempts[block.id]} saveDraft={saveDraft} recordAttempt={recordAttempt} />;
              if (block.type === "diagram") return <NationalDayMathDiagram key={`${section.id}-${block.id}`} id={block.id} />;
              if (block.type === "text" || block.type === "heading" || block.type === "formula") return <TextBlock key={`${section.id}-${blockIndex}`} block={block} />;
              return null;
            })}
            {section.kind === "chapter" && <button type="button" disabled={!ready} onClick={() => learning.completeSection(section.id)} className={`mt-6 block w-full rounded-2xl border px-5 py-4 text-sm font-bold transition disabled:opacity-50 ${complete.has(section.id) ? "border-teal-200 bg-teal-50 text-teal-800" : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"}`}>{complete.has(section.id) ? "✓ 已标记读完，记得换数重做" : "这一部分已读完，并已练习"}</button>}
          </section>)}
        </div>

        <footer id="national-day-math-end" className="mt-12 rounded-3xl border border-sky-100 bg-sky-50/50 p-6 text-center">
          <h2 className="text-xl font-bold text-slate-800">已经读到全书最后了 🍁</h2>
          <p className="mt-3 text-sm leading-8 text-slate-600">全部知识点、{stats.examples}道例题和{quizCount}道诊断、自测、综合题，都在上方。把不熟悉的部分换数重做，第二天和一周后再检查一次。</p>
          <Link href={`/subjects/${subjectId}`} className="mt-4 inline-block text-sm font-semibold text-sky-700">← 返回数学</Link>
        </footer>
      </div>
    </main>
  );
}
