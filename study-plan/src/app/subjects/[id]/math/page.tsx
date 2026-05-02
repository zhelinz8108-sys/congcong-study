"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  MATH_CURRICULUM,
  MATH_DOMAIN_META,
  countMathCurriculumItems,
  getMathCurriculumByStage,
  type MathStageKey,
} from "@/lib/math-curriculum";

const STAGES: { key: MathStageKey; label: string; desc: string }[] = [
  {
    key: "primary",
    label: "小学",
    desc: "一至六年级，建立数感、运算、图形、统计和应用意识。",
  },
  {
    key: "junior",
    label: "初中",
    desc: "七至九年级，进入代数、函数、证明、概率和综合建模。",
  },
];

export default function MathCurriculumPage() {
  const { id } = useParams<{ id: string }>();
  const [activeStage, setActiveStage] = useState<MathStageKey>("primary");
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(
    () => new Set(["primary-1"])
  );
  const grades = getMathCurriculumByStage(activeStage);

  const toggleGrade = (key: string) => {
    setExpandedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-6 text-neutral-950 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={`/subjects/${id}`}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-950"
            >
              ← 返回数学主页
            </Link>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-neutral-400">
              Math Curriculum
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              中国小学与初中数学知识体系
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-500">
              按义务教育数学的四大领域整理：数与代数、图形与几何、统计与概率、综合与实践。
              这里先做总览目录，后续可以继续给每个知识点补讲解、考点和例题。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 text-center text-sm">
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-lg font-semibold">{MATH_CURRICULUM.length}</p>
              <p className="text-xs text-neutral-400">年级</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-lg font-semibold">{countMathCurriculumItems()}</p>
              <p className="text-xs text-neutral-400">主题</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-4 py-3">
              <p className="text-lg font-semibold">4</p>
              <p className="text-xs text-neutral-400">领域</p>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-3 md:grid-cols-2">
          {STAGES.map((stage) => {
            const selected = activeStage === stage.key;
            return (
              <button
                key={stage.key}
                onClick={() => {
                  setActiveStage(stage.key);
                  setExpandedGrades(new Set([getMathCurriculumByStage(stage.key)[0]?.key].filter(Boolean)));
                }}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected
                    ? "border-blue-300 bg-blue-50"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{stage.label}</h2>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-neutral-500 ring-1 ring-neutral-200">
                    {getMathCurriculumByStage(stage.key).length} 个年级
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-neutral-500">{stage.desc}</p>
              </button>
            );
          })}
        </section>

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          {Object.entries(MATH_DOMAIN_META).map(([key, meta]) => (
            <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-medium text-neutral-400">{meta.shortName}</p>
              <h3 className="mt-1 font-semibold">{meta.name}</h3>
              <p className="mt-2 text-xs leading-5 text-neutral-500">{meta.description}</p>
            </div>
          ))}
        </section>

        <div className="space-y-3">
          {grades.map((grade) => {
            const isOpen = expandedGrades.has(grade.key);
            const itemCount = grade.domains.reduce(
              (total, domain) => total + domain.items.length,
              0
            );

            return (
              <section
                key={grade.key}
                className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
              >
                <button
                  onClick={() => toggleGrade(grade.key)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="text-xl font-semibold">{grade.grade}</h2>
                      <span className="text-sm text-neutral-400">{grade.subtitle}</span>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
                      {grade.focus}
                    </p>
                    <p className="mt-2 text-xs text-neutral-400">
                      {grade.domains.length} 个领域 · {itemCount} 个主题
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-neutral-400">
                    {isOpen ? "收起" : "展开"}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-neutral-100 px-5 py-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {grade.domains.map((domain) => {
                        const meta = MATH_DOMAIN_META[domain.domain];
                        return (
                          <article
                            key={domain.domain}
                            className="rounded-2xl border border-neutral-200 bg-[#fbfbfa] p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="font-semibold">{meta.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-neutral-500 ring-1 ring-neutral-200">
                                {domain.items.length} 项
                              </span>
                            </div>

                            <div className="mt-4 space-y-3">
                              {domain.items.map((item) => (
                                <div
                                  key={item.title}
                                  className="rounded-xl border border-neutral-100 bg-white p-4"
                                >
                                  <h4 className="font-semibold">{item.title}</h4>
                                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                                    {item.description}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {item.keyPoints.map((point) => (
                                      <span
                                        key={point}
                                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600"
                                      >
                                        {point}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
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
