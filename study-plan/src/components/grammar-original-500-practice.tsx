"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildOriginalGrammarExplanation,
  ORIGINAL_GRAMMAR_QUESTIONS,
  type OriginalGrammarQuestion,
} from "@/lib/grammar-original-500";

type TopicProgress = {
  answered: number;
  correct: number;
  lastQuestionId?: number;
};

type SavedProgress = Record<string, TopicProgress>;

type SessionAnswer = {
  question: OriginalGrammarQuestion;
  selected: string;
  correct: boolean;
};

const PROGRESS_KEY = "study-plan-grammar-original-500-progress-v1";
const AUTO_NEXT_KEY = "study-plan-grammar-original-500-auto-next";

function loadSavedProgress(): SavedProgress {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as SavedProgress;
  } catch {
    return {};
  }
}

function saveProgress(progress: SavedProgress) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  let value = seed || 1;
  const random = () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
  return [...items]
    .map((item) => ({ item, order: random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function getSessionQuestions(): OriginalGrammarQuestion[] {
  return shuffleWithSeed(ORIGINAL_GRAMMAR_QUESTIONS, Date.now());
}

function optionLetter(index: number): "A" | "B" | "C" | "D" {
  return String.fromCharCode(65 + index) as "A" | "B" | "C" | "D";
}

export function GrammarOriginal500Practice() {
  const [isActive, setIsActive] = useState(false);
  const [questions, setQuestions] = useState<OriginalGrammarQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [progress, setProgress] = useState<SavedProgress>({});
  const [progressReady, setProgressReady] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [reviewMistakes, setReviewMistakes] = useState(false);
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoNext = useCallback(() => {
    if (autoNextTimer.current) {
      clearTimeout(autoNextTimer.current);
      autoNextTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      setProgress(loadSavedProgress());
      setAutoNext(window.localStorage.getItem(AUTO_NEXT_KEY) === "1");
      setProgressReady(true);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      clearAutoNext();
    };
  }, [clearAutoNext]);

  const overallAnswered = Object.values(progress).reduce((sum, item) => sum + item.answered, 0);
  const overallCorrect = Object.values(progress).reduce((sum, item) => sum + item.correct, 0);
  const overallAccuracy = overallAnswered > 0 ? Math.round((overallCorrect / overallAnswered) * 100) : 0;

  const current = questions[currentIndex];
  const isAnswered = selected !== null;
  const sessionCorrect = answers.filter((answer) => answer.correct).length;
  const sessionWrong = answers.length - sessionCorrect;
  const sessionAccuracy = answers.length > 0 ? Math.round((sessionCorrect / answers.length) * 100) : 0;
  const explanation = current ? buildOriginalGrammarExplanation(current) : null;

  const mistakes = useMemo(
    () => answers.filter((answer) => !answer.correct).map((answer) => answer.question),
    [answers]
  );

  const startPractice = () => {
    clearAutoNext();
    setIsActive(true);
    setQuestions(getSessionQuestions());
    setCurrentIndex(0);
    setSelected(null);
    setAnswers([]);
    setReviewMistakes(false);
  };

  const returnToHub = () => {
    clearAutoNext();
    setIsActive(false);
    setQuestions([]);
    setCurrentIndex(0);
    setSelected(null);
    setAnswers([]);
    setReviewMistakes(false);
  };

  const goNext = useCallback(() => {
    clearAutoNext();
    setSelected(null);
    setCurrentIndex((index) => index + 1);
  }, [clearAutoNext]);

  const chooseOption = (letter: string) => {
    if (!current || selected) return;
    const correct = letter === current.answer;
    setSelected(letter);
    setAnswers((items) => [...items, { question: current, selected: letter, correct }]);

    setProgress((previous) => {
      const key = String(current.topicId);
      const old = previous[key] ?? { answered: 0, correct: 0 };
      const next = {
        ...previous,
        [key]: {
          answered: old.answered + 1,
          correct: old.correct + (correct ? 1 : 0),
          lastQuestionId: current.id,
        },
      };
      saveProgress(next);
      return next;
    });

    if (correct && autoNext) {
      autoNextTimer.current = setTimeout(goNext, 900);
    }
  };

  const toggleAutoNext = (checked: boolean) => {
    setAutoNext(checked);
    window.localStorage.setItem(AUTO_NEXT_KEY, checked ? "1" : "0");
    if (!checked) clearAutoNext();
  };

  const beginMistakeReview = () => {
    if (mistakes.length === 0) return;
    setQuestions(mistakes);
    setCurrentIndex(0);
    setSelected(null);
    setAnswers([]);
    setReviewMistakes(true);
  };

  if (!isActive) {
    return (
      <section className="mt-8 rounded-[32px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-amber-50/60 p-5 shadow-[0_20px_55px_rgba(88,28,135,0.07)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
                新增原题库
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                500 道混合题 · 四选一
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950 sm:text-3xl">
              小学英语语法 500 道拔高选择题
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              500 道原题全部打乱混合，不再按语法专题分类。点击选项立即显示对错、正确答案、考点规则、判断理由、正确句和易错提醒；练习进度会保存在当前设备。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-violet-100">
              <p className="text-xs text-stone-400">累计答题</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{progressReady ? overallAnswered : "--"}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
              <p className="text-xs text-stone-400">累计答对</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{progressReady ? overallCorrect : "--"}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-amber-100">
              <p className="text-xs text-stone-400">正确率</p>
              <p className="mt-1 text-xl font-semibold text-amber-700">
                {progressReady && overallAnswered > 0 ? `${overallAccuracy}%` : "--"}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={startPractice}
          className="mt-6 flex w-full items-center justify-between rounded-[24px] bg-slate-950 px-5 py-5 text-left text-white transition hover:bg-violet-700"
        >
          <span>
            <span className="block text-lg font-semibold">开始 500 题混合练习</span>
            <span className="mt-1 block text-sm text-white/70">全部 500 道题打乱顺序，一次练完</span>
          </span>
          <span className="text-xl">→</span>
        </button>
      </section>
    );
  }

  if (currentIndex >= questions.length || !current) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
        <div className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={returnToHub} className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 hover:bg-white">
              ← 返回语法
            </button>
            <button type="button" onClick={startPractice} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
              再练一轮
            </button>
          </div>
          <section className="mt-8 rounded-[32px] border border-stone-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-violet-600">{reviewMistakes ? "错题再练" : "500 题混合练习"}</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950">
              本轮答对 {sessionCorrect} / {answers.length} 题
            </h2>
            <p className="mt-2 text-sm text-stone-500">正确率 {sessionAccuracy}% · 每次答题都已保存到当前设备。</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">答对</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{sessionCorrect}</p></div>
              <div className="rounded-2xl bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-700">答错</p><p className="mt-2 text-2xl font-semibold text-rose-700">{sessionWrong}</p></div>
              <div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-semibold text-violet-700">正确率</p><p className="mt-2 text-2xl font-semibold text-violet-700">{sessionAccuracy}%</p></div>
            </div>
            {mistakes.length > 0 && !reviewMistakes && (
              <button type="button" onClick={beginMistakeReview} className="mt-6 w-full rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700">
                只重练本轮 {mistakes.length} 道错题
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={returnToHub} className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 hover:bg-white">
            ← 退出练习
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-500 ring-1 ring-stone-200">
              <input type="checkbox" checked={autoNext} onChange={(event) => toggleAutoNext(event.target.checked)} className="accent-violet-600" />
              答对自动下一题
            </label>
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
                <p className="text-sm font-semibold text-violet-600">500 题混合练习</p>
                <p className="mt-1 text-xs text-stone-400">原题第 {current.id} 题 · 四选一</p>
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
                  <button key={`${current.id}-${letter}`} type="button" onClick={() => chooseOption(letter)} disabled={isAnswered} className={`flex min-h-16 items-center gap-4 rounded-2xl border px-4 py-3 text-left text-base font-medium transition ${stateClass}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-stone-500 ring-1 ring-stone-200">{letter}</span>
                    <span className="leading-7">{option}</span>
                  </button>
                );
              })}
            </div>

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
                  <button type="button" onClick={goNext} className="shrink-0 rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700">
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
