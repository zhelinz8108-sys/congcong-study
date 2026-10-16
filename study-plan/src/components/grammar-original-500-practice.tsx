"use client";

import { useMemo, useState } from "react";
import {
  buildOriginalGrammarExplanation,
  ORIGINAL_GRAMMAR_QUESTIONS,
  type OriginalGrammarQuestion,
} from "@/lib/grammar-original-500";
import { useEnglishLocked } from "@/lib/use-english-locked";

type GrammarQuestionExplanation = {
  focus: string;
  rule: string;
  reason: string;
  correctSentence: string;
  trap: string;
};

export type GrammarPracticeBank = {
  questions: OriginalGrammarQuestion[];
  buildExplanation: (question: OriginalGrammarQuestion) => GrammarQuestionExplanation;
  progressKey: string;
  autoNextKey: string;
  eyebrow: string;
  badge: string;
  title: string;
  description: string;
  startLabel: string;
  startHint: string;
  practiceLabel: string;
  questionLabel: string;
};

const ORIGINAL_GRAMMAR_BANK: GrammarPracticeBank = {
  questions: ORIGINAL_GRAMMAR_QUESTIONS,
  buildExplanation: buildOriginalGrammarExplanation,
  progressKey: "study-plan-grammar-original-500-progress-v1",
  autoNextKey: "study-plan-grammar-original-500-auto-next",
  eyebrow: "新增原题库",
  badge: "500 道混合题 · 四选一",
  title: "小学英语语法 500 道拔高选择题",
  description:
    "按题号固定顺序练习。选择后保存首次答案并查看解析，提交后不能修改；手动进入下一题。",
  startLabel: "开始 500 题混合练习",
  startHint: "按固定顺序练习，首次答案永久保留",
  practiceLabel: "500 题混合练习",
  questionLabel: "原题",
};

function optionLetter(index: number): "A" | "B" | "C" | "D" {
  return String.fromCharCode(65 + index) as "A" | "B" | "C" | "D";
}

export function GrammarOriginal500Practice({
  bank = ORIGINAL_GRAMMAR_BANK,
  subjectId,
}: {
  bank?: GrammarPracticeBank;
  subjectId: string;
}) {
  const locked = useEnglishLocked(bank.progressKey.includes("tense") ? "grammar-tense" : "grammar-original", subjectId);
  const [isActive, setIsActive] = useState(false);
  const [questions, setQuestions] = useState<OriginalGrammarQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewMistakes, setReviewMistakes] = useState(false);

  const overallAnswered = Object.keys(locked.records).length;
  const overallCorrect = Object.values(locked.records).filter(record => record.feedback.correct === true).length;
  const overallAccuracy = overallAnswered > 0 ? Math.round((overallCorrect / overallAnswered) * 100) : 0;

  const current = questions[currentIndex];
  const currentRecord = current ? locked.records[String(current.id)] : undefined;
  const selected = currentRecord && typeof currentRecord.response === "string" ? currentRecord.response : null;
  const isAnswered = selected !== null;
  const sessionRecords = questions.map(question => locked.records[String(question.id)]).filter(Boolean);
  const sessionCorrect = sessionRecords.filter(record => record.feedback.correct === true).length;
  const sessionWrong = sessionRecords.filter(record => record.feedback.correct === false).length;
  const sessionAccuracy = sessionRecords.length > 0 ? Math.round((sessionCorrect / sessionRecords.length) * 100) : 0;
  const explanation = current ? bank.buildExplanation(current) : null;

  const mistakes = useMemo(
    () => bank.questions.filter(question => locked.records[String(question.id)]?.feedback.correct === false),
    [bank.questions, locked.records]
  );

  const startPractice = () => {
    setIsActive(true);
    setQuestions([...bank.questions].sort((a, b) => a.id - b.id));
    setCurrentIndex(0);
    setReviewMistakes(false);
  };

  const returnToHub = () => {
    setIsActive(false);
    setQuestions([]);
    setCurrentIndex(0);
    setReviewMistakes(false);
  };

  const goNext = () => {
    setCurrentIndex((index) => index + 1);
  };

  const chooseOption = async (letter: string) => {
    if (!current || selected || currentRecord || locked.busy || !locked.ready) return;
    try {
      await locked.submit(String(current.id), letter);
    } catch { /* Feedback is never revealed until the first answer is persisted. */ }
  };

  const beginMistakeReview = () => {
    if (mistakes.length === 0) return;
    setQuestions(mistakes);
    setCurrentIndex(0);
    setReviewMistakes(true);
  };

  if (!isActive) {
    return (
      <section className="mt-8 rounded-[32px] border border-violet-100 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.05)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                {bank.eyebrow}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                {bank.badge}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950 sm:text-3xl">
              {bank.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              {bank.description}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-violet-100">
              <p className="text-xs text-stone-400">累计答题</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{locked.ready ? overallAnswered : "--"}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
              <p className="text-xs text-stone-400">累计答对</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{locked.ready ? overallCorrect : "--"}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-amber-100">
              <p className="text-xs text-stone-400">正确率</p>
              <p className="mt-1 text-xl font-semibold text-amber-700">
                {locked.ready && overallAnswered > 0 ? `${overallAccuracy}%` : "--"}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!locked.ready}
          onClick={startPractice}
          className="mt-6 flex w-full items-center justify-between rounded-[24px] bg-violet-50 px-5 py-5 text-left text-slate-900 ring-1 ring-violet-200 transition hover:bg-violet-100"
        >
          <span>
            <span className="block text-lg font-semibold">{bank.startLabel}</span>
            <span className="mt-1 block text-sm text-slate-600">{bank.startHint}</span>
          </span>
          <span className="text-xl">→</span>
        </button>
      </section>
    );
  }

  if (currentIndex >= questions.length || !current) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
        <div className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={returnToHub} className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 hover:bg-white">
              ← 返回语法
            </button>
            <button type="button" onClick={startPractice} className="rounded-full bg-violet-50 px-4 py-2 text-sm font-medium text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100">
              回看首次作答
            </button>
          </div>
          <section className="mt-8 rounded-[32px] border border-stone-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-violet-600">{reviewMistakes ? "错题再练" : bank.practiceLabel}</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950">
              首次答对 {sessionCorrect} / {sessionRecords.length} 题
            </h2>
            <p className="mt-2 text-sm text-stone-500">正确率 {sessionAccuracy}% · 首次作答已锁定并保存到云端。</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">答对</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{sessionCorrect}</p></div>
              <div className="rounded-2xl bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-700">答错</p><p className="mt-2 text-2xl font-semibold text-rose-700">{sessionWrong}</p></div>
              <div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-semibold text-violet-700">正确率</p><p className="mt-2 text-2xl font-semibold text-violet-700">{sessionAccuracy}%</p></div>
            </div>
            {mistakes.length > 0 && !reviewMistakes && (
              <button type="button" onClick={beginMistakeReview} className="mt-6 w-full rounded-2xl bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800 ring-1 ring-rose-200 transition hover:bg-rose-100">
                回看本轮 {mistakes.length} 道错题
              </button>
            )}
          </section>
        </div>
      </div>
    );
  }

  const correctIndex = current.answer.charCodeAt(0) - 65;
  const selectedIndex = selected ? selected.charCodeAt(0) - 65 : -1;
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={returnToHub} className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 hover:bg-white">
            ← 退出练习
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700">首次提交后锁定 · 手动下一题</span>
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-500 ring-1 ring-stone-200">{currentIndex + 1} / {questions.length}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">对 {sessionCorrect}</span>
            <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">错 {sessionWrong}</span>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-violet-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>

        <main className="flex flex-1 items-center justify-center py-7">
          <div className="w-full rounded-[34px] border border-stone-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-violet-600">{bank.practiceLabel}</p>
                <p className="mt-1 text-xs text-stone-400">{bank.questionLabel}第 {current.id} 题 · 四选一</p>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">即时判分 + 逐题解析</span>
            </div>
            <h1 className="mt-7 whitespace-pre-line text-xl font-semibold leading-9 text-slate-950 sm:text-2xl">
              {current.prompt}
            </h1>

            <div className="mt-7 grid gap-3">
              {current.options.map((option, index) => {
                const letter = optionLetter(index);
                const isCorrect = index === correctIndex;
                const isSelected = index === selectedIndex;
                const stateClass = !isAnswered
                  ? "border-stone-200 bg-white hover:border-violet-300 hover:bg-violet-50"
                  : isCorrect
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : isSelected
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-stone-200 bg-stone-50 text-stone-400";
                return (
                  <button key={`${current.id}-${letter}`} type="button" onClick={() => void chooseOption(letter)} disabled={isAnswered || locked.busy || !locked.ready} className={`flex min-h-16 items-center gap-4 rounded-2xl border px-4 py-3 text-left text-base font-medium transition ${stateClass}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-stone-500 ring-1 ring-stone-200">{letter}</span>
                    <span className="leading-7">{option}</span>
                  </button>
                );
              })}
            </div>
            {locked.error && <p role="alert" className="mt-4 text-sm text-rose-700">{locked.error}</p>}

            {isAnswered && explanation && (
              <section aria-live="polite" className={`mt-6 rounded-[26px] border p-5 ${selected === current.answer ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/50"}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className={`text-base font-semibold ${selected === current.answer ? "text-emerald-700" : "text-rose-700"}`}>
                      {selected === current.answer ? "答对了！" : `答错了，正确答案是 ${current.answer}。`}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200"><p className="text-xs font-semibold text-stone-400">你的选择</p><p className="mt-1 font-semibold text-slate-800">{selected}. {current.options[selectedIndex]}</p></div>
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-emerald-100"><p className="text-xs font-semibold text-emerald-600">正确答案</p><p className="mt-1 font-semibold text-emerald-700">{current.answer}. {current.answerText}</p></div>
                    </div>
                    <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                      <div><span className="mr-2 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">考点</span>{explanation.focus}</div>
                      <div><span className="mr-2 font-semibold text-slate-900">规则：</span>{explanation.rule}</div>
                      <div><span className="mr-2 font-semibold text-slate-900">为什么：</span>{explanation.reason}</div>
                      <div className="rounded-2xl bg-white px-4 py-3 font-medium text-emerald-700 ring-1 ring-emerald-100">正确表达：{explanation.correctSentence}</div>
                      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-800 ring-1 ring-amber-100"><span className="font-semibold">易错提醒：</span>{explanation.trap}</div>
                    </div>
                  </div>
                  <button type="button" onClick={goNext} className="shrink-0 rounded-xl bg-violet-50 px-5 py-3 text-sm font-medium text-violet-800 ring-1 ring-violet-200 transition hover:bg-violet-100">
                    {currentIndex + 1 >= questions.length ? "查看结果" : "下一题"}
                  </button>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
