"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  GRADE_SIX_DIFFICULTY_META,
  MATH_GRADE_SIX_UNITS,
  getQuestionAnswerLabel,
  type GradeSixDifficulty,
  type GradeSixQuestion,
} from "@/lib/math-grade-six";
import {
  MATH_GRADE_SIX_ALL_QUESTIONS,
  MATH_GRADE_SIX_QUESTIONS_BY_UNIT,
  MATH_GRADE_SIX_TOTAL_QUESTIONS,
  getGradeSixUnitQuestionCounts,
} from "@/lib/math-grade-six-question-bank";

const optionLetters = ["A", "B", "C", "D"];
type DifficultyFilter = GradeSixDifficulty | "all";

const difficultyFilters: Array<{ key: DifficultyFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "medium", label: "中等" },
  { key: "hard", label: "困难" },
  { key: "super", label: "超级困难" },
];

function QuestionCard({
  question,
  selected,
  onSelect,
}: {
  question: GradeSixQuestion;
  selected?: number;
  onSelect: (index: number) => void;
}) {
  const answered = selected !== undefined;
  const selectedCorrect = selected === question.answerIndex;
  const meta = GRADE_SIX_DIFFICULTY_META[question.difficulty];

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 bg-neutral-50/80 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${meta.tone}`}>
                {meta.label}
              </span>
              {question.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-500 ring-1 ring-neutral-200"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="mt-3 text-base font-bold leading-7 text-neutral-950 sm:text-lg">
              {question.prompt}
            </h3>
          </div>
          {answered && (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                selectedCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}
            >
              {selectedCorrect ? "答对了" : "再想想"}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {question.options.map((option, index) => {
          const isCorrect = index === question.answerIndex;
          const isSelected = selected === index;
          const tone = !answered
            ? "border-neutral-200 bg-white hover:border-blue-300 hover:bg-blue-50"
            : isCorrect
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : isSelected
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-neutral-200 bg-neutral-50 text-neutral-500";

          return (
            <button
              key={`${question.id}-${option}`}
              type="button"
              onClick={() => onSelect(index)}
              className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${tone}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-neutral-700 ring-1 ring-neutral-200">
                {optionLetters[index]}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="border-t border-neutral-100 bg-blue-50/40 px-4 py-4 sm:px-5">
          <p className="text-sm font-black text-neutral-950">
            正确答案：{getQuestionAnswerLabel(question)}
          </p>
          <p className="mt-2 text-sm leading-7 text-neutral-700">{question.explanation}</p>
        </div>
      )}
    </article>
  );
}

export default function MathGradeSixPage() {
  const { id } = useParams<{ id: string }>();
  const [activeUnitKey, setActiveUnitKey] = useState("unit-1");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const activeUnit = MATH_GRADE_SIX_UNITS.find((unit) => unit.key === activeUnitKey) ?? MATH_GRADE_SIX_UNITS[0];
  const activeUnitQuestions = MATH_GRADE_SIX_QUESTIONS_BY_UNIT[activeUnit.key] ?? [];
  const counts = getGradeSixUnitQuestionCounts(activeUnit.key);
  const answeredCount = MATH_GRADE_SIX_ALL_QUESTIONS.filter(
    (question) => answers[question.id] !== undefined
  ).length;
  const correctCount = MATH_GRADE_SIX_ALL_QUESTIONS.filter(
    (question) => answers[question.id] === question.answerIndex
  ).length;

  const questions = useMemo(
    () =>
      difficulty === "all"
        ? activeUnitQuestions
        : activeUnitQuestions.filter((question) => question.difficulty === difficulty),
    [activeUnitQuestions, difficulty]
  );
  const currentQuestionIndex = Math.min(currentIndex, Math.max(questions.length - 1, 0));
  const currentQuestion = questions[currentQuestionIndex];
  const answeredQuestions = questions.filter((question) => answers[question.id] !== undefined);
  const filteredCorrectCount = answeredQuestions.filter(
    (question) => answers[question.id] === question.answerIndex
  ).length;
  const accuracyPercent =
    answeredQuestions.length === 0 ? 0 : Math.round((filteredCorrectCount / answeredQuestions.length) * 100);
  const progressPercent = questions.length === 0 ? 0 : ((currentQuestionIndex + 1) / questions.length) * 100;

  const resetCurrentQuestionSet = () => {
    setAnswers((prev) => {
      const next = { ...prev };
      questions.forEach((question) => {
        delete next[question.id];
      });
      return next;
    });
    setCurrentIndex(0);
  };

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
              Grade 6 Math
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">六年级数学</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-600">
              根据《六上数学（数学教材）2026秋.pdf》逐单元整理。每个单元 90 道选择题，中等、困难、超级困难各 30 道。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 text-center text-sm shadow-sm">
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-xl font-black">{MATH_GRADE_SIX_UNITS.length}</p>
              <p className="text-xs text-neutral-500">单元/板块</p>
            </div>
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-blue-700">
              <p className="text-xl font-black">{MATH_GRADE_SIX_TOTAL_QUESTIONS}</p>
              <p className="text-xs">选择题</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">
              <p className="text-xl font-black">{correctCount}/{answeredCount || 0}</p>
              <p className="text-xs">已答正确</p>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-black">六上单元</h2>
              <p className="mt-1 text-sm text-neutral-500">目录来自 PDF 第 2 页，页码按教材页码记录。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
                中等 {counts.medium}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
                困难 {counts.hard}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
                超级困难 {counts.super}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MATH_GRADE_SIX_UNITS.map((unit) => {
              const selected = unit.key === activeUnitKey;
              return (
                <button
                  key={unit.key}
                  type="button"
                  onClick={() => {
                    setActiveUnitKey(unit.key);
                    setCurrentIndex(0);
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-blue-300 bg-blue-50 shadow-sm"
                      : "border-neutral-200 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-blue-600">Unit {unit.order}</p>
                      <h3 className="mt-1 text-base font-black text-neutral-950">{unit.title}</h3>
                    </div>
                    {unit.questionCount && (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                        {unit.questionCount} 题
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-neutral-400">
                    {unit.sourceRange} · {unit.pdfPages}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">{unit.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">
                {activeUnit.pdfTitle}
              </p>
              <h2 className="mt-2 text-2xl font-black">{activeUnit.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-600">{activeUnit.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeUnit.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600 lg:w-60">
              <p className="font-bold text-neutral-950">来源</p>
              <p className="mt-2">{activeUnit.sourceRange}</p>
              <p className="mt-1">{activeUnit.pdfPages}</p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black">{activeUnit.title}选择题</h2>
              <p className="mt-1 text-sm text-neutral-500">点击选项后会立即显示正确答案和详细解析。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {difficultyFilters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setDifficulty(item.key);
                    setCurrentIndex(0);
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                    difficulty === item.key
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">
                  Question {currentQuestionIndex + 1} / {questions.length}
                </p>
                <h3 className="mt-1 text-xl font-black text-neutral-950">一题一练</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-blue-50 px-4 py-3 text-blue-700">
                  <p className="text-lg font-black">
                    {currentQuestionIndex + 1}/{questions.length}
                  </p>
                  <p className="text-xs font-semibold">当前进度</p>
                </div>
                <div className="rounded-xl bg-neutral-50 px-4 py-3 text-neutral-700">
                  <p className="text-lg font-black">{answeredQuestions.length}</p>
                  <p className="text-xs font-semibold">已答</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">
                  <p className="text-lg font-black">{filteredCorrectCount}</p>
                  <p className="text-xs font-semibold">答对</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-700">
                  <p className="text-lg font-black">{accuracyPercent}%</p>
                  <p className="text-xs font-semibold">正确率</p>
                </div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {currentQuestion && (
            <>
              <QuestionCard
                key={currentQuestion.id}
                question={currentQuestion}
                selected={answers[currentQuestion.id]}
                onSelect={(index) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [currentQuestion.id]: index,
                  }))
                }
              />

              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
                  disabled={currentQuestionIndex === 0}
                  className="rounded-xl border border-neutral-200 px-5 py-3 text-sm font-bold text-neutral-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  上一题
                </button>
                <button
                  type="button"
                  onClick={resetCurrentQuestionSet}
                  className="rounded-xl border border-neutral-200 px-5 py-3 text-sm font-bold text-neutral-600 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  重做本组
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((index) => Math.min(index + 1, questions.length - 1))}
                  disabled={currentQuestionIndex >= questions.length - 1}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
                >
                  下一题
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
