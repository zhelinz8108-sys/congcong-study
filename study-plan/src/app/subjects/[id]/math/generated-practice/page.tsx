"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MATH_GENERATED_DIFFICULTIES,
  MATH_GENERATED_UNITS,
  PDF_MATH_SOURCE_SUMMARY,
  generateMathQuestions,
  getGeneratedUnitTotal,
  gradeGeneratedMathQuestion,
  type MathGeneratedDifficulty,
  type MathGeneratedQuestion,
  type MathGeneratedUnit,
} from "@/lib/math-generated-practice";

type AnswerRecord = {
  value: string;
  isCorrect: boolean;
};

const optionLetters = ["A", "B", "C", "D"];

const typeLabel = (type: MathGeneratedQuestion["type"]) =>
  type === "choice" ? "选择题" : "填空题";

const difficultyTone: Record<MathGeneratedDifficulty, string> = {
  medium: "border-emerald-200 bg-emerald-50 text-emerald-700",
  hard: "border-amber-200 bg-amber-50 text-amber-700",
  super: "border-rose-200 bg-rose-50 text-rose-700",
};

function UnitReviewPanel({
  unit,
  compact = false,
}: {
  unit: MathGeneratedUnit;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-amber-100 bg-amber-50/70 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            课前复习
          </p>
          <h3 className="mt-2 text-lg font-black tracking-tight text-neutral-950">
            {unit.shortTitle}知识总结
          </h3>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700">
          先复习，再做题
        </span>
      </div>

      <figure className="mt-5 overflow-hidden rounded-2xl border border-white bg-white shadow-sm">
        <div className={`relative w-full ${compact ? "aspect-[16/7]" : "aspect-video"}`}>
          <Image
            src={unit.visual.src}
            alt={unit.visual.alt}
            fill
            sizes={compact ? "(max-width: 768px) 100vw, 900px" : "(max-width: 1024px) 100vw, 960px"}
            className="object-cover"
          />
        </div>
        <figcaption className="border-t border-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
          {unit.visual.caption}
        </figcaption>
      </figure>

      <p className="mt-4 text-sm leading-7 text-neutral-700">{unit.review.overview}</p>

      <div className={`mt-5 grid gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>
        <div className="rounded-2xl bg-white p-4">
          <h4 className="text-sm font-black text-neutral-950">核心知识点</h4>
          <div className="mt-3 space-y-4">
            {unit.review.knowledge.map((section) => (
              <div key={section.title}>
                <p className="text-sm font-bold text-blue-700">{section.title}</p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-700">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4">
            <h4 className="text-sm font-black text-neutral-950">解题思路</h4>
            <div className="mt-3 space-y-4">
              {unit.review.strategies.map((section) => (
                <div key={section.title}>
                  <p className="text-sm font-bold text-emerald-700">{section.title}</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-700">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl bg-white p-4">
              <h4 className="text-sm font-black text-rose-700">易错提醒</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">
                {unit.review.commonMistakes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-4">
              <h4 className="text-sm font-black text-amber-700">做题前检查</h4>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">
                {unit.review.beforePractice.map((item, index) => (
                  <li key={item} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-700">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function GeneratedMathPracticePage() {
  const { id } = useParams<{ id: string }>();
  const [selectedUnitId, setSelectedUnitId] = useState(MATH_GENERATED_UNITS[0].id);
  const [difficulty, setDifficulty] = useState<MathGeneratedDifficulty>("medium");
  const [started, setStarted] = useState(false);
  const [openReviewUnitId, setOpenReviewUnitId] = useState(MATH_GENERATED_UNITS[0].id);
  const [showSessionReview, setShowSessionReview] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const selectedUnit =
    MATH_GENERATED_UNITS.find((unit) => unit.id === selectedUnitId) ?? MATH_GENERATED_UNITS[0];
  const difficultyMeta = MATH_GENERATED_DIFFICULTIES.find((item) => item.key === difficulty)!;

  const questions = useMemo(
    () => generateMathQuestions(selectedUnitId, difficulty, 100),
    [difficulty, selectedUnitId]
  );

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentQuestion?.id ?? ""];
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((answer) => answer.isCorrect).length;
  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  const resetSession = (unitId = selectedUnitId, nextDifficulty = difficulty) => {
    setSelectedUnitId(unitId);
    setDifficulty(nextDifficulty);
    setStarted(true);
    setShowSessionReview(true);
    setCurrentIndex(0);
    setAnswers({});
    setDrafts({});
  };

  const recordAnswer = (question: MathGeneratedQuestion, value: string) => {
    const isCorrect = gradeGeneratedMathQuestion(question, value);
    setAnswers((prev) => ({
      ...prev,
      [question.id]: { value, isCorrect },
    }));
  };

  const updateFillDraft = (question: MathGeneratedQuestion, value: string) => {
    setDrafts((prev) => ({ ...prev, [question.id]: value }));
    if (answers[question.id]?.value !== value) {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
    }
  };

  const submitFillAnswer = (question: MathGeneratedQuestion) => {
    const value = drafts[question.id]?.trim() ?? "";
    if (!value) return;
    recordAnswer(question, value);
  };

  const goNext = () => setCurrentIndex((index) => Math.min(index + 1, questions.length - 1));
  const goPrev = () => setCurrentIndex((index) => Math.max(index - 1, 0));

  const feedbackReason = useMemo(() => {
    if (!currentQuestion || !currentAnswer || currentAnswer.isCorrect) return "";
    return (
      currentQuestion.wrongReasons?.[currentAnswer.value] ??
      `这个答案没有满足题干条件。正确答案是 ${currentQuestion.answer}。`
    );
  }, [currentAnswer, currentQuestion]);

  if (!started) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-6 text-neutral-950 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link
                href={`/subjects/${id}`}
                className="text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                ← 返回数学主页
              </Link>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">
                PDF Generated Practice
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                五年级下册数学新题训练
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-600">
                已按上传 PDF 的单元目录和题型风格生成新题。8 个单元，每单元中等、困难、超级困难各 100 题。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-bold">{MATH_GENERATED_UNITS.length}</p>
                <p className="mt-1 text-neutral-500">单元</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-bold">{MATH_GENERATED_UNITS.length * 300}</p>
                <p className="mt-1 text-neutral-500">新题</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-bold">100</p>
                <p className="mt-1 text-neutral-500">每场</p>
              </div>
            </div>
          </header>

          <section className="mb-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <p className="text-sm font-bold text-neutral-900">{PDF_MATH_SOURCE_SUMMARY.fileName}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  {PDF_MATH_SOURCE_SUMMARY.scannedLocalMaterials}
                  PDF 共 {PDF_MATH_SOURCE_SUMMARY.pages} 页，出题结构参考“基础、拓展、探究”的递进方式。
                </p>
              </div>
              <p className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                {PDF_MATH_SOURCE_SUMMARY.questionStyle}
              </p>
            </div>
          </section>

          <section className="grid gap-4">
            {MATH_GENERATED_UNITS.map((unit) => (
              <article
                key={unit.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                        Unit {unit.order}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                        {unit.sourceRange}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                        {getGeneratedUnitTotal()} 题
                      </span>
                    </div>
                    <h2 className="mt-3 text-xl font-bold tracking-tight">{unit.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{unit.focus}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {unit.styleNotes.map((note) => (
                        <span
                          key={note}
                          className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500"
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenReviewUnitId((current) => (current === unit.id ? "" : unit.id))
                      }
                      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                    >
                      {openReviewUnitId === unit.id ? "收起知识总结" : "展开知识总结与解题思路"}
                    </button>
                  </div>
                  <div className="grid shrink-0 gap-2 sm:grid-cols-3 lg:w-[420px]">
                    {MATH_GENERATED_DIFFICULTIES.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => resetSession(unit.id, item.key)}
                        className={`rounded-xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${difficultyTone[item.key]}`}
                      >
                        <p className="text-sm font-bold">{item.label}</p>
                        <p className="mt-1 text-xs opacity-80">100 题</p>
                      </button>
                    ))}
                  </div>
                </div>
                {openReviewUnitId === unit.id && (
                  <div className="mt-5">
                    <UnitReviewPanel unit={unit} />
                  </div>
                )}
              </article>
            ))}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <button
                onClick={() => setStarted(false)}
                className="text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                ← 返回单元选择
              </button>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                  Unit {selectedUnit.order}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${difficultyTone[difficulty]}`}>
                  {difficultyMeta.label}
                </span>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                  100 题 session
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                {selectedUnit.shortTitle}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
                {selectedUnit.focus}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm sm:w-[360px]">
              <div className="rounded-xl bg-neutral-50 p-3">
                <p className="text-xl font-bold">{answeredCount}</p>
                <p className="text-xs text-neutral-500">已答</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                <p className="text-xl font-bold">{correctCount}</p>
                <p className="text-xs">正确</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <p className="text-xl font-bold">{progressPercent}%</p>
                <p className="text-xs">进度</p>
              </div>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </header>

        <section className="mb-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
                Review First
              </p>
              <h2 className="mt-1 text-lg font-black">{selectedUnit.shortTitle}课前复习</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSessionReview((value) => !value)}
              className="w-fit rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
            >
              {showSessionReview ? "收起复习内容" : "展开复习内容"}
            </button>
          </div>
          {showSessionReview && (
            <div className="mt-4">
              <UnitReviewPanel unit={selectedUnit} compact />
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                  {currentIndex + 1}
                </span>
                <div>
                  <p className="text-xs font-semibold text-neutral-400">第 {currentIndex + 1} 题</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                      {typeLabel(currentQuestion.type)}
                    </span>
                    {currentQuestion.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <p className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-6 text-2xl font-bold leading-relaxed tracking-tight text-neutral-950">
              {currentQuestion.prompt}
            </p>

            {currentQuestion.type === "choice" ? (
              <div className="mt-6 grid gap-3">
                {currentQuestion.options?.map((option, optionIndex) => {
                  const selected = currentAnswer?.value === option;
                  const correct = currentAnswer && option === currentQuestion.answer;
                  const wrongSelected = selected && currentAnswer && !currentAnswer.isCorrect;
                  return (
                    <button
                      key={option}
                      onClick={() => recordAnswer(currentQuestion, option)}
                      className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-left text-lg font-semibold transition ${
                        correct
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : wrongSelected
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : selected
                              ? "border-blue-400 bg-blue-50 text-blue-800"
                              : "border-neutral-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-sm font-bold text-neutral-600">
                        {optionLetters[optionIndex]}
                      </span>
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6">
                <label className="text-sm font-semibold text-neutral-600">答案</label>
                <input
                  value={drafts[currentQuestion.id] ?? currentAnswer?.value ?? ""}
                  onChange={(event) => updateFillDraft(currentQuestion, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (currentAnswer) goNext();
                    else submitFillAnswer(currentQuestion);
                  }}
                  placeholder="输入答案后点击提交"
                  className={`mt-2 w-full rounded-2xl border px-5 py-4 text-2xl font-bold outline-none transition ${
                    currentAnswer?.isCorrect
                      ? "border-emerald-400 bg-emerald-50"
                      : currentAnswer
                        ? "border-rose-400 bg-rose-50"
                      : "border-neutral-200 bg-white focus:border-blue-400"
                  }`}
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => submitFillAnswer(currentQuestion)}
                    disabled={!drafts[currentQuestion.id]?.trim()}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {currentAnswer ? "重新提交" : "提交答案"}
                  </button>
                  <span className="text-sm text-neutral-500">填完后提交，或按 Enter。</span>
                </div>
              </div>
            )}

            {currentAnswer && (
              <section
                className={`mt-7 rounded-3xl p-5 ${
                  currentAnswer.isCorrect ? "bg-emerald-50" : "bg-rose-50"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p
                      className={`text-xl font-bold ${
                        currentAnswer.isCorrect ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {currentAnswer.isCorrect ? "答对了。" : "这题选错了。"}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/80 bg-white p-4">
                        <p className="text-xs font-semibold text-neutral-400">你的答案</p>
                        <p className="mt-1 text-lg font-bold">{currentAnswer.value}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-800">
                        <p className="text-xs font-semibold text-emerald-600">正确答案</p>
                        <p className="mt-1 text-lg font-bold">{currentQuestion.answer}</p>
                      </div>
                    </div>
                    {!currentAnswer.isCorrect && (
                      <p className="mt-4 text-base leading-7 text-rose-800">{feedbackReason}</p>
                    )}
                    <p className="mt-4 text-base leading-7 text-neutral-700">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                  <button
                    onClick={goNext}
                    disabled={currentIndex === questions.length - 1}
                    className="shrink-0 rounded-2xl bg-slate-950 px-7 py-4 text-lg font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一题
                  </button>
                </div>
              </section>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                上一题
              </button>
              <button
                onClick={() => resetSession(selectedUnitId, difficulty)}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
              >
                重做本场
              </button>
            </div>
          </section>

          <aside className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:self-start">
            <h2 className="text-lg font-bold">答题概览</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {correctCount}/{answeredCount || 0} 正确
            </p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {questions.map((question, index) => {
                const answer = answers[question.id];
                const active = index === currentIndex;
                return (
                  <button
                    key={question.id}
                    onClick={() => setCurrentIndex(index)}
                    className={`h-10 rounded-xl text-sm font-bold transition ${
                      active
                        ? "bg-blue-600 text-white"
                        : answer?.isCorrect
                          ? "bg-emerald-100 text-emerald-700"
                          : answer
                            ? "bg-rose-100 text-rose-700"
                            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 space-y-2 text-xs text-neutral-500">
              <p>绿色：正确</p>
              <p>红色：错误</p>
              <p>蓝色：当前题</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
