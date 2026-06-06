"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildMathExplanation } from "@/lib/math-explanation-display";

type Question = {
  id: string;
  question_number: string;
  question_order: number;
  question_type: string;
  prompt: string;
  options: { key: string; text: string }[];
  correct_answer?: { raw?: string; answers?: string[]; answer?: string };
  explanation?: string;
  score: number;
  review_status: string;
  auto_grade: boolean;
};

type QuestionSet = {
  id: string;
  title: string;
  category: string;
  unit_label: string;
  unit_display?: string;
  question_count: number;
  ready_count: number;
  needs_review_count: number;
  source_files?: string[];
  answer_files?: string[];
};

type DraftResponse = {
  responseText: string;
  selfRating: "correct" | "partial" | "incorrect" | "";
};

type PreviewKind = "source" | "answer";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  choice: "选择题",
  true_false: "判断题",
  fill_blank: "填空题",
  calculation: "计算题",
  subjective: "应用题",
  source_only: "原卷题",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  ready: "可判分",
  needs_review: "需核对",
  source_only: "看原卷",
};

const SELF_RATING_LABELS: Record<Exclude<DraftResponse["selfRating"], "">, string> = {
  correct: "会了",
  partial: "半会",
  incorrect: "不会",
};

function responseKey(questionId: string) {
  return questionId;
}

function fileHref(setId: string, kind: "source" | "answer", index: number) {
  return `/api/math/source-files/${encodeURIComponent(setId)}/${index}?kind=${kind}`;
}

function previewHref(setId: string, kind: "source" | "answer", index: number) {
  return `/api/math/source-preview/${encodeURIComponent(setId)}/${index}?kind=${kind}`;
}

function getQuestionTypeLabel(type: string) {
  return QUESTION_TYPE_LABELS[type] ?? type;
}

function getReviewStatusLabel(status: string) {
  return REVIEW_STATUS_LABELS[status] ?? status;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDisplayPrompt(question: Question) {
  let prompt = question.prompt;
  if (question.question_type === "choice" && question.options.length > 0) {
    const [stem] = prompt.split(/\n?\s*A[．.、]\s*/);
    prompt = stem?.trim() || prompt;
  }
  if (question.question_number) {
    prompt = prompt.replace(new RegExp(`^\\s*${escapeRegExp(question.question_number)}[．.、]\\s*`), "");
  }
  return prompt.trim() || question.prompt;
}

function getOptionText(option: { key: string; text: string }) {
  const text = option.text
    .trim()
    .replace(new RegExp(`^${escapeRegExp(option.key)}[．.、]?\\s*`), "")
    .trim();
  return text || "见右侧原卷选项";
}

function formatUserAnswer(question: Question, draft: DraftResponse) {
  if (draft.responseText) {
    if (question.question_type === "choice") {
      const option = question.options.find((item) => item.key === draft.responseText);
      return option ? `${option.key}. ${getOptionText(option)}` : draft.responseText;
    }
    if (question.question_type === "true_false") {
      if (draft.responseText === "√") return "正确";
      if (draft.responseText === "×") return "错误";
    }
    return draft.responseText;
  }
  return draft.selfRating ? SELF_RATING_LABELS[draft.selfRating] : "未作答";
}

function normalizeAnswer(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[，。；、\s]/g, "")
    .replace(/[（）()【】\[\]{}]/g, "")
    .toUpperCase();
}

function getAnswerValues(answer: Question["correct_answer"]) {
  if (!answer) return [];
  if (Array.isArray(answer.answers)) return answer.answers.map(String).filter(Boolean);
  if (answer.answer) return [String(answer.answer)];
  if (answer.raw) return [String(answer.raw)];
  return [];
}

function extractChoice(value: string) {
  return normalizeAnswer(value).match(/[A-F]/)?.[0] ?? normalizeAnswer(value);
}

function normalizeTrueFalse(value: string) {
  const normalized = normalizeAnswer(value);
  if (["TRUE", "T", "YES", "Y", "对", "是", "正确", "√", "V"].includes(normalized)) {
    return "TRUE";
  }
  if (["FALSE", "F", "NO", "N", "错", "否", "错误", "×", "X"].includes(normalized)) {
    return "FALSE";
  }
  return normalized;
}

function formatAnswer(answer: Question["correct_answer"]) {
  const values = getAnswerValues(answer);
  if (values.length > 0) return values.join("；");
  return answer?.raw || "未解析到标准答案";
}

function isWeakStructuredAnswer(answer: Question["correct_answer"], questionType?: string) {
  const values = getAnswerValues(answer);
  if (values.length === 0) return true;
  if (questionType === "choice") {
    return !values.some((value) => /[A-F]/.test(extractChoice(value)));
  }
  if (questionType === "true_false") {
    return !values.some((value) => ["TRUE", "FALSE"].includes(normalizeTrueFalse(value)));
  }
  return values.every((value) => {
    const normalized = String(value)
      .replace(/[答案答解：:。.，,、；;\s]/g, "")
      .trim();
    return normalized.length <= 1;
  });
}

function getInstantVerdict(question: Question, responseText: string) {
  if (!responseText.trim() || !question.auto_grade) return null;
  const answers = getAnswerValues(question.correct_answer);
  if (answers.length === 0) return null;
  if (isWeakStructuredAnswer(question.correct_answer, question.question_type)) return null;

  let correct = false;
  if (question.question_type === "choice") {
    const response = extractChoice(responseText);
    correct = answers.some((answer) => extractChoice(answer) === response);
  } else if (question.question_type === "true_false") {
    const response = normalizeTrueFalse(responseText);
    correct = answers.some((answer) => normalizeTrueFalse(answer) === response);
  } else {
    const response = normalizeAnswer(responseText);
    correct = answers.some((answer) => normalizeAnswer(answer) === response);
  }

  return correct ? "correct" : "incorrect";
}

export default function MathPracticePage() {
  const { id, setId } = useParams<{ id: string; setId: string }>();
  const router = useRouter();
  const attemptPromiseRef = useRef<Promise<string | null> | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("attempt")
  );
  const [set, setSet] = useState<QuestionSet | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Record<string, DraftResponse>>({});
  const [loading, setLoading] = useState(true);
  const [creatingAttempt, setCreatingAttempt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewKind, setPreviewKind] = useState<PreviewKind>("source");
  const [previewIndex, setPreviewIndex] = useState(0);

  const loadSet = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/math/question-sets/${setId}?include_answers=1`);
    const data = await res.json();
    if (res.ok) {
      setSet(data.set);
      setQuestions(data.questions ?? []);
      const nextResponses: Record<string, DraftResponse> = {};
      for (const question of data.questions ?? []) {
        nextResponses[question.id] = { responseText: "", selfRating: "" };
      }
      setResponses(nextResponses);
    }
    setLoading(false);
  }, [setId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSet();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSet]);

  const ensureAttempt = useCallback(async () => {
    if (attemptId) return attemptId;
    if (!attemptPromiseRef.current) {
      setCreatingAttempt(true);
      attemptPromiseRef.current = fetch("/api/math/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_id: setId }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "无法开始练习");
          setAttemptId(data.id);
          window.history.replaceState(null, "", `?attempt=${data.id}`);
          return data.id as string;
        })
        .catch((error) => {
          alert(error instanceof Error ? error.message : "无法开始练习");
          return null;
        })
        .finally(() => {
          setCreatingAttempt(false);
          attemptPromiseRef.current = null;
        });
    }
    return attemptPromiseRef.current;
  }, [attemptId, setId]);

  const updateResponse = (questionId: string, patch: Partial<DraftResponse>) => {
    const question = questions.find((item) => item.id === questionId);
    if (
      question &&
      isWeakStructuredAnswer(question.correct_answer, question.question_type) &&
      (set?.answer_files?.length ?? 0) > 0
    ) {
      setPreviewKind("answer");
      setPreviewIndex(0);
    }
    setResponses((prev) => ({
      ...prev,
      [responseKey(questionId)]: {
        ...(prev[responseKey(questionId)] ?? { responseText: "", selfRating: "" }),
        ...patch,
      },
    }));
  };

  const saveAll = async () => {
    const currentAttemptId = await ensureAttempt();
    if (!currentAttemptId) return false;

    setSaving(true);
    for (const question of questions) {
      const draft = responses[responseKey(question.id)] ?? { responseText: "", selfRating: "" };
      await fetch(`/api/math/attempts/${currentAttemptId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: question.id,
          response_text: draft.responseText,
          self_rating: draft.selfRating || null,
        }),
      });
    }
    setSaving(false);
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    const saved = await saveAll();
    if (!saved) {
      setSubmitting(false);
      return;
    }
    const currentAttemptId = attemptId ?? new URLSearchParams(window.location.search).get("attempt");
    if (!currentAttemptId) {
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/math/attempts/${currentAttemptId}/submit`, { method: "POST" });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) router.push(`/subjects/${id}/math/question-bank/attempts/${data.id}/result`);
    else alert(data.error ?? "提交失败");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          正在加载练习...
        </div>
      </main>
    );
  }

  if (!set) {
    return (
      <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          题集不存在。
        </div>
      </main>
    );
  }

  const sourceCount = set.source_files?.length ?? 0;
  const answerCount = set.answer_files?.length ?? 0;
  const activePreviewKind: PreviewKind = previewKind === "answer" && answerCount > 0 ? "answer" : "source";
  const activePreviewCount = activePreviewKind === "answer" ? answerCount : sourceCount;
  const activePreviewIndex = Math.min(previewIndex, Math.max(0, activePreviewCount - 1));
  const answeredCount = questions.filter((question) => {
    const draft = responses[responseKey(question.id)];
    return Boolean(draft?.responseText.trim() || draft?.selfRating);
  }).length;
  const progressPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#f6f7fb] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5">
          <Link
            href={`/subjects/${id}/math/question-bank`}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-950"
          >
            ← 返回题库
          </Link>
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-neutral-500">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1">
                    {set.category || "未分类"}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                    {set.unit_display || set.unit_label || "未标单元｜综合资料"}
                  </span>
                  {creatingAttempt && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      正在准备练习
                    </span>
                  )}
                </div>
                <h1 className="mt-3 max-w-4xl text-xl font-semibold leading-7 sm:text-2xl sm:leading-8">
                  {set.title}
                </h1>
                <div className="mt-4 grid max-w-3xl grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 sm:px-3">
                    <p className="text-lg font-semibold">{questions.length}</p>
                    <p className="text-xs text-neutral-500">题目</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 sm:px-3">
                    <p className="text-lg font-semibold">{set.ready_count}</p>
                    <p className="text-xs text-neutral-500">可判分</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 sm:px-3">
                    <p className="text-lg font-semibold">{set.needs_review_count}</p>
                    <p className="text-xs text-neutral-500">需核对</p>
                  </div>
                </div>
                <div className="mt-4 max-w-3xl">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-neutral-500">
                    <span>练习进度</span>
                    <span>
                      {answeredCount}/{questions.length} · {progressPercent}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(set.source_files ?? []).map((file, index) => (
                    <button
                      key={`source-${file}`}
                      type="button"
                      onClick={() => {
                        setPreviewKind("source");
                        setPreviewIndex(index);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        activePreviewKind === "source" && activePreviewIndex === index
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      看原卷 {index + 1}
                    </button>
                  ))}
                  {(set.answer_files ?? []).map((file, index) => (
                    <button
                      key={`answer-${file}`}
                      type="button"
                      onClick={() => {
                        setPreviewKind("answer");
                        setPreviewIndex(index);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        activePreviewKind === "answer" && activePreviewIndex === index
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      }`}
                    >
                      看答案 {index + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-2 lg:pt-1">
                <button
                  onClick={saveAll}
                  disabled={creatingAttempt || saving || submitting}
                  className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
                >
                  {saving ? "保存中..." : "保存进度"}
                </button>
                <button
                  onClick={submit}
                  disabled={creatingAttempt || submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "提交中..." : "提交判分"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-5 hidden rounded-lg border border-blue-100 bg-white p-4 text-sm leading-6 text-neutral-600 shadow-sm sm:block">
          可以直接点选项或输入答案，保存/提交时会自动创建本次练习。右侧原卷预览会尽量保留 Word/PDF 里的图片、图表和原版式；遇到题面不完整时，以原卷为准。
        </div>

        {activePreviewCount > 0 && (
          <details className="mb-5 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm xl:hidden">
            <summary className="cursor-pointer text-sm font-semibold">
              {activePreviewKind === "answer" ? "答案预览" : "原卷预览（含图片）"}
            </summary>
            <iframe
              src={previewHref(set.id, activePreviewKind, activePreviewIndex)}
              title={activePreviewKind === "answer" ? "答案预览" : "原卷预览"}
              className="mt-3 h-[560px] w-full rounded-lg border border-neutral-200 bg-white"
            />
          </details>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="space-y-4">
            {questions.map((question, index) => {
              const draft = responses[responseKey(question.id)] ?? { responseText: "", selfRating: "" };
              const needsSelfReview =
                question.question_type === "subjective" ||
                question.question_type === "source_only";
              const answered = Boolean(draft.responseText.trim() || draft.selfRating);
              const verdict = getInstantVerdict(question, draft.responseText);
              const questionLabel = question.question_number || String(index + 1);
              const displayPrompt = getDisplayPrompt(question);
              const displayExplanation = buildMathExplanation(question);

              return (
                <section
                  key={question.id}
                  className={`rounded-lg border bg-white p-5 shadow-sm transition ${
                    answered ? "border-blue-200 ring-1 ring-blue-100" : "border-neutral-200"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
                          answered ? "bg-blue-600" : "bg-neutral-950"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-neutral-400">第 {questionLabel} 题</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                            {getQuestionTypeLabel(question.question_type)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              question.review_status === "ready"
                                ? "bg-emerald-50 text-emerald-700"
                                : question.review_status === "needs_review"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {getReviewStatusLabel(question.review_status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">
                      {question.score} 分
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-[17px] leading-8 text-neutral-950">
                    {displayPrompt}
                  </p>

                  {question.question_type === "choice" && question.options?.length > 0 ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {question.options.map((option, optionIndex) => {
                        const selected = draft.responseText === option.key;
                        return (
                          <label
                            key={`${question.id}-${option.key}-${optionIndex}`}
                            className={`group flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-base leading-6 transition ${
                              selected
                                ? "border-blue-500 bg-blue-50 text-blue-950 ring-1 ring-blue-200"
                                : "border-neutral-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={option.key}
                              checked={selected}
                              onChange={() => updateResponse(question.id, { responseText: option.key })}
                              className="sr-only"
                            />
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                                selected
                                  ? "bg-blue-600 text-white"
                                  : "bg-neutral-100 text-neutral-600 group-hover:bg-blue-100 group-hover:text-blue-700"
                              }`}
                            >
                              {option.key}
                            </span>
                            <span className="min-w-0 pt-0.5">{getOptionText(option)}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : question.question_type === "true_false" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        ["√", "正确"],
                        ["×", "错误"],
                      ].map(([value, label]) => {
                        const selected = draft.responseText === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateResponse(question.id, { responseText: value })}
                            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                              selected
                                ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200"
                                : "border-neutral-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                                selected ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {value}
                            </span>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={draft.responseText}
                      onChange={(event) => updateResponse(question.id, { responseText: event.target.value })}
                      placeholder="在这里输入答案"
                      className="mt-4 min-h-24 w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base leading-7 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  )}

                  {needsSelfReview && (
                    <div className="mt-4 border-t border-neutral-100 pt-4">
                      <p className="text-xs font-semibold text-neutral-500">这类题可按掌握程度自评</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[
                          ["correct", "会了"],
                          ["partial", "半会"],
                          ["incorrect", "不会"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              updateResponse(question.id, {
                                selfRating: value as DraftResponse["selfRating"],
                              })
                            }
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                              draft.selfRating === value
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-neutral-200 bg-white hover:bg-neutral-50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {answered && (
                    <div
                      className={`mt-4 rounded-lg border p-4 ${
                        verdict === "correct"
                          ? "border-emerald-200 bg-emerald-50"
                          : verdict === "incorrect"
                            ? "border-red-200 bg-red-50"
                            : "border-blue-200 bg-blue-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                          className={`text-sm font-semibold ${
                            verdict === "correct"
                              ? "text-emerald-700"
                              : verdict === "incorrect"
                                ? "text-red-700"
                                : "text-blue-700"
                          }`}
                        >
                          {verdict === "correct"
                            ? "答对了"
                            : verdict === "incorrect"
                              ? "再看一眼"
                              : "对照答案自评"}
                        </p>
                        <p className="text-xs text-neutral-500">选完立即显示</p>
                      </div>

                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div className="border-l-2 border-white/80 pl-3">
                          <p className="text-xs font-semibold text-neutral-500">你的答案</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-900">
                            {formatUserAnswer(question, draft)}
                          </p>
                        </div>
                        <div className="border-l-2 border-white/80 pl-3">
                          <p className="text-xs font-semibold text-neutral-500">标准答案</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-900">
                            {formatAnswer(question.correct_answer)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-white/70 pt-3">
                        <p className="text-xs font-semibold text-neutral-500">解析</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-neutral-800">
                          {displayExplanation}
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {activePreviewCount > 0 && (
            <aside className="hidden xl:block">
              <div className="sticky top-4 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">
                      {activePreviewKind === "answer" ? "答案预览" : "原卷预览"}
                    </h2>
                    <p className="text-xs text-neutral-500">
                      {activePreviewKind === "answer"
                        ? "结构化答案不完整时看这里"
                        : "图片和图表以这里为准"}
                    </p>
                  </div>
                  <a
                    href={fileHref(set.id, activePreviewKind, activePreviewIndex)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50"
                  >
                    打开文件
                  </a>
                </div>
                <iframe
                  src={previewHref(set.id, activePreviewKind, activePreviewIndex)}
                  title={activePreviewKind === "answer" ? "答案预览" : "原卷预览"}
                  className="h-[calc(100vh-120px)] min-h-[620px] w-full rounded-lg border border-neutral-200 bg-white"
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
