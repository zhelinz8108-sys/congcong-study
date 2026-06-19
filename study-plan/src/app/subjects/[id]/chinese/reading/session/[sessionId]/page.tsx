"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  CHINESE_READING_TOPICS,
  getChineseReadingPassage,
  getChineseReadingTopic,
  gradeChineseReadingQuestion,
  type ChineseReadingQuestion,
} from "@/lib/chinese-reading";

type ResponseRecord = {
  value: string;
  locked: true;
  isCorrect: boolean | null;
  selfScore?: "full" | "partial" | "none";
};

type MistakeRecord = {
  id: string;
  topicKey: string;
  topicName: string;
  passageId: string;
  passageTitle: string;
  questionId: string;
  questionPrompt: string;
  response: string;
  answer: string;
  mistakeTags: string[];
  scoringPoints: string[];
  updatedAt: string;
};

const mistakesStorageKey = "congcong_chinese_reading_mistakes";

function stableOptions(question: ChineseReadingQuestion) {
  const options = question.options ?? [];
  if (options.length <= 1) return options;
  const seed = Array.from(question.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [...options].sort((a, b) => {
    const left = (a.length * 31 + seed + a.charCodeAt(0)) % 17;
    const right = (b.length * 31 + seed + b.charCodeAt(0)) % 17;
    return left - right;
  });
}

function readMistakes() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(mistakesStorageKey) ?? "[]");
    return Array.isArray(parsed) ? (parsed as MistakeRecord[]) : [];
  } catch {
    return [];
  }
}

function saveMistake(record: MistakeRecord) {
  if (typeof window === "undefined") return;
  const current = readMistakes().filter((item) => item.id !== record.id);
  window.localStorage.setItem(
    mistakesStorageKey,
    JSON.stringify([{ ...record, updatedAt: new Date().toISOString() }, ...current].slice(0, 200))
  );
}

function removeMistake(recordId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    mistakesStorageKey,
    JSON.stringify(readMistakes().filter((item) => item.id !== recordId))
  );
}

function makeMistakeRecord(
  subjectId: string,
  passage: NonNullable<ReturnType<typeof getChineseReadingPassage>>,
  question: ChineseReadingQuestion,
  response: string
): MistakeRecord {
  const topic = getChineseReadingTopic(passage.topicKey);
  return {
    id: `${subjectId}:${passage.id}:${question.id}`,
    topicKey: passage.topicKey,
    topicName: topic.name,
    passageId: passage.id,
    passageTitle: passage.title,
    questionId: question.id,
    questionPrompt: question.prompt,
    response,
    answer: question.answer,
    mistakeTags: question.mistakeTags,
    scoringPoints: question.scoringPoints,
    updatedAt: new Date().toISOString(),
  };
}

function responseIsCorrect(response?: ResponseRecord) {
  if (!response) return false;
  if (response.isCorrect !== null) return response.isCorrect;
  return response.selfScore === "full";
}

export default function ChineseReadingSessionPage() {
  const { id: subjectId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const passage = getChineseReadingPassage(sessionId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, ResponseRecord>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const topic = passage ? getChineseReadingTopic(passage.topicKey) : null;
  const currentQuestion = passage?.questions[currentIndex];
  const currentResponse = currentQuestion ? responses[currentQuestion.id] : undefined;
  const answeredCount = Object.keys(responses).length;
  const correctCount = Object.values(responses).filter(responseIsCorrect).length;
  const progressPercent = passage
    ? Math.round((answeredCount / passage.questions.length) * 100)
    : 0;

  const topicIndex = topic ? CHINESE_READING_TOPICS.findIndex((item) => item.key === topic.key) : -1;

  if (!passage || !topic || !currentQuestion) {
    return (
      <main className="min-h-screen bg-[#f7f6f2] px-5 py-8 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-black">没有找到这篇阅读练习</h1>
          <Link
            href={`/subjects/${subjectId}/chinese/reading`}
            className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            返回阅读专题
          </Link>
        </div>
      </main>
    );
  }

  const recordResponse = (
    question: ChineseReadingQuestion,
    value: string,
    result: boolean | null
  ) => {
    if (responses[question.id]) return;

    setResponses((current) => {
      if (current[question.id]) return current;
      return {
        ...current,
        [question.id]: {
          value,
          locked: true,
          isCorrect: result,
        },
      };
    });

    if (result === false) {
      saveMistake(makeMistakeRecord(subjectId, passage, question, value));
    }
    if (result === true) {
      removeMistake(`${subjectId}:${passage.id}:${question.id}`);
    }
  };

  const submitTextAnswer = (question: ChineseReadingQuestion) => {
    if (responses[question.id]) return;
    const value = drafts[question.id]?.trim() ?? "";
    if (!value) return;
    const result = gradeChineseReadingQuestion(question, value);
    recordResponse(question, value, result);
  };

  const setSelfScore = (question: ChineseReadingQuestion, score: "full" | "partial" | "none") => {
    const response = responses[question.id];
    if (!response || response.selfScore) return;

    setResponses((current) => ({
      ...current,
      [question.id]: {
        ...response,
        selfScore: score,
      },
    }));

    const recordId = `${subjectId}:${passage.id}:${question.id}`;
    if (score === "full") {
      removeMistake(recordId);
    } else {
      saveMistake(makeMistakeRecord(subjectId, passage, question, response.value));
    }
  };

  const resetSession = () => {
    setCurrentIndex(0);
    setResponses({});
    setDrafts({});
  };

  const goNext = () =>
    setCurrentIndex((index) => Math.min(index + 1, passage.questions.length - 1));
  const goPrev = () => setCurrentIndex((index) => Math.max(index - 1, 0));

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-7 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${subjectId}/chinese/reading`}
            className="text-sm font-bold text-rose-700 transition hover:text-rose-900"
          >
            ← 返回阅读专题
          </Link>
          <Link
            href={`/subjects/${subjectId}/chinese/mistakes`}
            className="rounded-full border border-rose-100 bg-white px-4 py-2 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
          >
            错题与薄弱点
          </Link>
        </header>

        <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-black text-white">
                  专题 {topicIndex + 1}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                  {topic.name}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                  {passage.genre}
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                  {passage.difficulty}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight">{passage.title}</h1>
              <p className="mt-3 text-sm leading-7 text-stone-500">{topic.method}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="text-xl font-black">{answeredCount}</p>
                <p className="mt-1 text-xs font-bold text-stone-400">已答</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xl font-black text-emerald-700">{correctCount}</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">正确/满分</p>
              </div>
              <div className="rounded-2xl bg-blue-50 p-4">
                <p className="text-xl font-black text-blue-700">{progressPercent}%</p>
                <p className="mt-1 text-xs font-bold text-blue-600">进度</p>
              </div>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-rose-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            <article className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">阅读材料</h2>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                  建议先通读，再答题
                </span>
              </div>
              <div className="mt-5 whitespace-pre-wrap rounded-[24px] bg-[#fffdf8] p-5 text-base leading-9 text-stone-800 ring-1 ring-amber-100">
                {passage.body}
              </div>
            </article>

            <article className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-base font-black text-white">
                    {currentIndex + 1}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">
                      {currentQuestion.type === "choice"
                        ? "选择题"
                        : currentQuestion.type === "fill"
                          ? "填空题"
                          : "简答题"}
                    </p>
                    <h2 className="mt-2 text-xl font-black leading-8">{currentQuestion.prompt}</h2>
                  </div>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-black text-stone-500">
                  {currentIndex + 1} / {passage.questions.length}
                </span>
              </div>

              {currentQuestion.type === "choice" && (
                <div className="mt-6 grid gap-3">
                  {stableOptions(currentQuestion).map((option, optionIndex) => {
                    const selected = currentResponse?.value === option;
                    const answered = Boolean(currentResponse);
                    const correct = answered && option === currentQuestion.answer;
                    const wrongSelected =
                      selected && currentResponse?.isCorrect === false;

                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={answered}
                        aria-pressed={selected}
                        onClick={() =>
                          recordResponse(currentQuestion, option, option === currentQuestion.answer)
                        }
                        className={`flex items-start gap-4 rounded-2xl border px-5 py-4 text-left text-base font-bold leading-7 transition disabled:cursor-not-allowed ${
                          correct
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                            : wrongSelected
                              ? "border-rose-400 bg-rose-50 text-rose-700"
                              : selected
                                ? "border-blue-400 bg-blue-50 text-blue-800"
                                : answered
                                  ? "border-stone-100 bg-white text-stone-400"
                                  : "border-stone-200 bg-white hover:border-rose-300 hover:bg-rose-50"
                        }`}
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-sm font-black text-stone-600">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.type !== "choice" && (
                <div className="mt-6">
                  <textarea
                    value={currentResponse?.value ?? drafts[currentQuestion.id] ?? ""}
                    onChange={(event) => {
                      if (currentResponse) return;
                      setDrafts((current) => ({
                        ...current,
                        [currentQuestion.id]: event.target.value,
                      }));
                    }}
                    disabled={Boolean(currentResponse)}
                    placeholder={
                      currentQuestion.type === "fill"
                        ? "填写关键词或短答案，提交后不能修改。"
                        : "先自己组织答案，提交后再对照踩分点自评。"
                    }
                    className="min-h-28 w-full resize-y rounded-2xl border border-stone-200 bg-white px-5 py-4 text-base font-semibold leading-7 outline-none transition focus:border-rose-400 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:opacity-100"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => submitTextAnswer(currentQuestion)}
                      disabled={Boolean(currentResponse) || !drafts[currentQuestion.id]?.trim()}
                      className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {currentResponse ? "已提交" : "提交答案"}
                    </button>
                    <span className="text-sm font-medium text-stone-500">
                      提交后锁定答案，不能重复修改。
                    </span>
                  </div>
                </div>
              )}

              {currentResponse && (
                <section
                  className={`mt-6 rounded-[28px] p-5 ${
                    currentResponse.isCorrect === true || currentResponse.selfScore === "full"
                      ? "bg-emerald-50"
                      : currentResponse.isCorrect === false || currentResponse.selfScore
                        ? "bg-rose-50"
                        : "bg-blue-50"
                  }`}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-black text-stone-400">你的答案</p>
                      <p className="mt-2 whitespace-pre-wrap text-base font-bold leading-7">
                        {currentResponse.value}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                      <p className="text-xs font-black text-emerald-600">参考答案</p>
                      <p className="mt-2 whitespace-pre-wrap text-base font-bold leading-7 text-emerald-800">
                        {currentQuestion.answer}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                    <div>
                      <p className="text-sm font-black text-slate-900">踩分点</p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-700">
                        {currentQuestion.scoringPoints.map((point) => (
                          <li key={point}>• {point}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">答题模板</p>
                      <p className="mt-2 text-sm leading-6 text-stone-700">
                        {currentQuestion.template}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-700">
                        {currentQuestion.explanation}
                      </p>
                    </div>
                  </div>

                  {currentQuestion.type === "short" && (
                    <div className="mt-5 rounded-2xl bg-white p-4">
                      <p className="text-sm font-black text-slate-900">简答题自评</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          ["full", "满分"],
                          ["partial", "部分正确"],
                          ["none", "不会"],
                        ].map(([score, label]) => {
                          const active = currentResponse.selfScore === score;
                          return (
                            <button
                              key={score}
                              type="button"
                              disabled={Boolean(currentResponse.selfScore)}
                              onClick={() =>
                                setSelfScore(
                                  currentQuestion,
                                  score as "full" | "partial" | "none"
                                )
                              }
                              className={`rounded-xl px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed ${
                                active
                                  ? "bg-slate-950 text-white"
                                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-45"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-black text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  上一题
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetSession}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-black text-stone-700 transition hover:bg-stone-50"
                  >
                    重做本篇
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={currentIndex === passage.questions.length - 1}
                    className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一题
                  </button>
                </div>
              </div>
            </article>
          </div>

          <aside className="rounded-[30px] border border-stone-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:self-start">
            <h2 className="text-lg font-black">答题概览</h2>
            <p className="mt-1 text-sm text-stone-500">
              {correctCount}/{answeredCount || 0} 正确或满分
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {passage.questions.map((question, index) => {
                const response = responses[question.id];
                const active = index === currentIndex;
                const correct = responseIsCorrect(response);
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`h-10 rounded-xl text-sm font-black transition ${
                      active
                        ? "bg-slate-950 text-white"
                        : correct
                          ? "bg-emerald-100 text-emerald-700"
                          : response
                            ? "bg-rose-100 text-rose-700"
                            : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 space-y-2 text-xs leading-5 text-stone-500">
              <p>绿色：正确或自评满分</p>
              <p>红色：错误、部分正确或不会</p>
              <p>黑色：当前题</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
