"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { MATH_GRADE_FIVE_UNITS, countMathGradeFivePoints } from "@/lib/math-grade-five";

const getPageRange = (pages: number[]): string => {
  const sortedPages = [...pages].sort((a, b) => a - b);
  return `P${sortedPages[0]} - P${sortedPages[sortedPages.length - 1]}`;
};

const getShortTitle = (title: string): string => title.replace(/^第.+?单元：/, "");

export default function MathGradeFivePage() {
  const { id } = useParams<{ id: string }>();
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(
    () => new Set([MATH_GRADE_FIVE_UNITS[0]?.key].filter(Boolean))
  );
  const [expandedPoints, setExpandedPoints] = useState<Set<string>>(() => new Set());
  const totalPoints = countMathGradeFivePoints();
  const totalExamples = totalPoints * 5;

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/subjects/${id}`}
              className="text-2xl leading-none text-neutral-400 hover:text-neutral-950"
              aria-label="返回数学页面"
            >
              ←
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">Math</p>
              <h1 className="text-3xl font-semibold tracking-tight">数学 · 五年级</h1>
            </div>
          </div>
          <div className="hidden text-right text-sm text-neutral-500 sm:block">
            <p>{MATH_GRADE_FIVE_UNITS.length} 个单元</p>
            <p>{totalPoints} 个知识点</p>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">五年级知识点</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                按教材目录整理。点击单元展开知识点，点击知识点查看讲解、考点和 5 道例题。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-lg font-semibold">{MATH_GRADE_FIVE_UNITS.length}</p>
                <p className="text-xs text-neutral-400">单元</p>
              </div>
              <div className="rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-lg font-semibold">{totalPoints}</p>
                <p className="text-xs text-neutral-400">知识点</p>
              </div>
              <div className="rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-lg font-semibold">{totalExamples}</p>
                <p className="text-xs text-neutral-400">例题</p>
              </div>
            </div>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {MATH_GRADE_FIVE_UNITS.map((unit, index) => (
              <a
                key={unit.key}
                href={`#${unit.key}`}
                className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-950 hover:text-neutral-950"
              >
                {index + 1}. {getShortTitle(unit.title)}
              </a>
            ))}
          </nav>
        </section>

        <div className="space-y-3">
          {MATH_GRADE_FIVE_UNITS.map((unit, unitIndex) => {
            const isOpen = expandedUnits.has(unit.key);

            return (
              <section
                id={unit.key}
                key={unit.key}
                className="scroll-mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white"
              >
                <button
                  onClick={() => {
                    setExpandedUnits((prev) => {
                      const next = new Set(prev);
                      if (next.has(unit.key)) next.delete(unit.key);
                      else next.add(unit.key);
                      return next;
                    });
                  }}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-neutral-400">单元 {unitIndex + 1}</p>
                    <h3 className="mt-1 truncate text-lg font-semibold">{unit.title}</h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      {unit.points.length} 个知识点 · {unit.points.length * 5} 道例题 ·{" "}
                      {getPageRange(unit.points.map((point) => point.page))}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-neutral-400">{isOpen ? "收起" : "展开"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-neutral-100 px-4 py-4">
                    <div className="space-y-2">
                      {unit.points.map((item) => {
                        const pointKey = `${unit.key}-${item.code ?? item.title}`;
                        const isPointOpen = expandedPoints.has(pointKey);

                        return (
                          <article
                            key={pointKey}
                            className="overflow-hidden rounded-xl border border-neutral-200 bg-[#fbfbfa]"
                          >
                            <button
                              onClick={() => {
                                setExpandedPoints((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(pointKey)) next.delete(pointKey);
                                  else next.add(pointKey);
                                  return next;
                                });
                              }}
                              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                            >
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-2">
                                  {item.code && (
                                    <span className="font-mono text-sm font-semibold text-neutral-500">
                                      {item.code}
                                    </span>
                                  )}
                                  <h4 className="truncate text-base font-semibold">{item.title}</h4>
                                </div>
                                <p className="mt-1 text-sm text-neutral-400">
                                  讲解 · 考点 · 5 道例题
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-sm text-neutral-400">
                                <span>P{item.page}</span>
                                <span>{isPointOpen ? "−" : "+"}</span>
                              </div>
                            </button>

                            {isPointOpen && (
                              <div className="space-y-5 border-t border-neutral-200 bg-white px-4 py-4">
                                <section>
                                  <h5 className="text-sm font-semibold">讲解</h5>
                                  <p className="mt-2 text-sm leading-7 text-neutral-700">
                                    {item.details.explanation}
                                  </p>
                                </section>

                                <section>
                                  <h5 className="text-sm font-semibold">考点</h5>
                                  <ul className="mt-2 space-y-1.5">
                                    {item.details.examPoints.map((examPoint) => (
                                      <li key={examPoint} className="flex gap-2 text-sm leading-6 text-neutral-700">
                                        <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                                        <span>{examPoint}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </section>

                                <section>
                                  <div className="flex items-center justify-between">
                                    <h5 className="text-sm font-semibold">例题</h5>
                                    <span className="text-xs text-neutral-400">
                                      {item.details.examples.length} 题
                                    </span>
                                  </div>
                                  <div className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                                    {item.details.examples.map((example, index) => (
                                      <div key={example.question} className="p-4">
                                        <p className="text-sm font-semibold leading-6">
                                          {index + 1}. {example.question}
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-neutral-600">
                                          解析：{example.solution}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-neutral-950">
                                          答案：{example.answer}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </section>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
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
