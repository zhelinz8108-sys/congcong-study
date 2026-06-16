"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import { buildMathExplanation, formatMathAnswer } from "@/lib/math-explanation-display";

type Mistake = {
  question_id: string;
  question_number: string;
  question_type: string;
  prompt: string;
  options?: { key: string; text: string }[];
  correct_answer: { raw?: string; answers?: string[] };
  explanation: string;
  set_id: string;
  set_title: string;
  category: string;
  unit_label: string;
  unit_display?: string;
  response_text: string;
  grading_status: string;
  feedback: string;
  submitted_at: string;
};

export default function MathMistakesPage() {
  const { id } = useParams<{ id: string }>();
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMistakes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/math/mistakes");
    const data = await res.json();
    setMistakes(data.mistakes ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMistakes();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMistakes]);

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href={`/subjects/${id}/math/question-bank`} className="text-sm font-medium text-neutral-500 hover:text-neutral-950">
              ← 返回题库
            </Link>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-neutral-400">
              Mistake Review
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">数学错题本</h1>
            <p className="mt-3 text-sm text-neutral-500">
              只显示最近一次提交仍未掌握的题目，再次做对后会自动移出当前错题。
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-white px-5 py-4 text-center">
            <p className="text-3xl font-semibold text-red-700">{mistakes.length}</p>
            <p className="text-sm text-red-700">当前错题</p>
          </div>
        </header>

        {loading ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
            正在加载错题...
          </div>
        ) : mistakes.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-neutral-500">
            暂时没有错题，状态很好。
          </div>
        ) : (
          <div className="space-y-4">
            {mistakes.map((mistake, index) => {
              const explanation = buildMathExplanation(mistake);
              const feedbackParts = [mistake.feedback, explanation].filter(Boolean);
              return (
              <section key={mistake.question_id} className="rounded-xl border border-red-200 bg-white p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                      {mistake.category}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                      {mistake.unit_display || mistake.unit_label || "未标单元｜综合资料"}
                    </span>
                  </div>
                  <Link
                    href={`/subjects/${id}/math/question-bank/${mistake.set_id}`}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50"
                  >
                    再练这套
                  </Link>
                </div>

                <h2 className="mb-2 text-sm font-semibold text-neutral-500">{mistake.set_title}</h2>
                <p className="whitespace-pre-wrap text-base leading-8 text-neutral-900">
                  {mistake.question_number ? `${mistake.question_number}. ` : ""}
                  <MathText text={mistake.prompt} />
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-red-50 p-3">
                    <p className="text-xs font-semibold text-red-700">上次答案</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-900">
                      <MathText text={mistake.response_text || "未作答"} />
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs font-semibold text-blue-700">标准答案</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-900">
                      <MathText text={formatMathAnswer(mistake.correct_answer)} />
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
        )}
      </div>
    </main>
  );
}
