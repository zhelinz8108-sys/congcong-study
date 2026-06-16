"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import { buildMathExplanation, formatMathAnswer } from "@/lib/math-explanation-display";

type ResultQuestion = {
  id: string;
  question_number: string;
  question_order: number;
  question_type: string;
  prompt: string;
  options: { key: string; text: string }[];
  correct_answer: { raw?: string; answers?: string[] };
  explanation: string;
  response_text: string | null;
  self_rating: string | null;
  is_correct: boolean | null;
  grading_status: string | null;
  response_score: number | null;
  max_score: number | null;
  feedback: string | null;
};

type Attempt = {
  id: string;
  set_id: string;
  set_title: string;
  category: string;
  unit_label: string;
  unit_display?: string;
  total_score: number;
  max_score: number;
  correct_count: number;
  total_count: number;
  status: string;
};

export default function MathAttemptResultPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<ResultQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadResult = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/math/attempts/${attemptId}`);
    const data = await res.json();
    if (res.ok) {
      setAttempt(data.attempt);
      setQuestions(data.questions ?? []);
    }
    setLoading(false);
  }, [attemptId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadResult();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadResult]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          正在加载结果...
        </div>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          练习记录不存在。
        </div>
      </main>
    );
  }

  const percent = attempt.max_score ? Math.round((attempt.total_score / attempt.max_score) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <Link href={`/subjects/${id}/math/question-bank`} className="text-sm font-medium text-neutral-500 hover:text-neutral-950">
            ← 返回题库
          </Link>
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                  <span className="rounded-full bg-neutral-100 px-2 py-1">{attempt.category}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{attempt.unit_display || attempt.unit_label || "未标单元｜综合资料"}</span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold leading-8">{attempt.set_title}</h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {attempt.correct_count}/{attempt.total_count} 题正确
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 px-5 py-4 text-center">
                <p className="text-3xl font-semibold text-blue-700">{percent}%</p>
                <p className="text-sm text-blue-700">
                  {attempt.total_score}/{attempt.max_score} 分
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          {questions.map((question, index) => {
            const correct = Boolean(question.is_correct);
            const explanation = buildMathExplanation(question);
            const feedbackParts = [question.feedback, explanation].filter(Boolean);
            return (
              <section
                key={question.id}
                className={`rounded-xl border bg-white p-5 ${
                  correct ? "border-emerald-200" : "border-red-200"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {correct ? "正确" : question.grading_status === "partial" ? "部分正确" : "需复习"}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                      {question.question_type}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {question.response_score ?? 0}/{question.max_score ?? 0} 分
                  </span>
                </div>

                <p className="whitespace-pre-wrap text-base leading-8 text-neutral-900">
                  {question.question_number ? `${question.question_number}. ` : ""}
                  <MathText text={question.prompt} />
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-neutral-50 p-3">
                    <p className="text-xs font-semibold text-neutral-500">你的答案</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                      <MathText text={question.response_text || question.self_rating || "未作答"} />
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs font-semibold text-blue-700">标准答案</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-900">
                      <MathText text={formatMathAnswer(question.correct_answer)} />
                    </p>
                  </div>
                </div>

                {feedbackParts.length > 0 && (
                  <div className="mt-3 rounded-lg bg-neutral-50 p-3">
                    <p className="text-xs font-semibold text-neutral-500">解析与反馈</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-neutral-700">
                      <MathText text={feedbackParts.join("\n\n")} />
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
