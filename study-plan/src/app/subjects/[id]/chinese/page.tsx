"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  CHINESE_MODULE_META,
  countChineseTopics,
  getChineseCurriculumByStage,
  type ChineseModuleKey,
  type ChineseStageKey,
} from "@/lib/chinese-curriculum";

const STAGES: Array<{ key: ChineseStageKey; label: string; desc: string }> = [
  { key: "primary", label: "小学", desc: "一到六年级，打牢字词句、阅读和表达基础。" },
  { key: "junior", label: "初中", desc: "七到九年级，强化现代文、文言文和考场写作。" },
];

const MODULE_KEYS = Object.keys(CHINESE_MODULE_META) as ChineseModuleKey[];

const TONE_STYLES: Record<
  string,
  { text: string; border: string; bg: string; soft: string; ring: string }
> = {
  rose: {
    text: "text-rose-700",
    border: "border-rose-200",
    bg: "bg-rose-50",
    soft: "bg-rose-100/70",
    ring: "ring-rose-100",
  },
  sky: {
    text: "text-sky-700",
    border: "border-sky-200",
    bg: "bg-sky-50",
    soft: "bg-sky-100/70",
    ring: "ring-sky-100",
  },
  amber: {
    text: "text-amber-700",
    border: "border-amber-200",
    bg: "bg-amber-50",
    soft: "bg-amber-100/70",
    ring: "ring-amber-100",
  },
  emerald: {
    text: "text-emerald-700",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    soft: "bg-emerald-100/70",
    ring: "ring-emerald-100",
  },
  violet: {
    text: "text-violet-700",
    border: "border-violet-200",
    bg: "bg-violet-50",
    soft: "bg-violet-100/70",
    ring: "ring-violet-100",
  },
};

function getToneStyle(tone: string) {
  return TONE_STYLES[tone] ?? TONE_STYLES.sky;
}

export default function ChineseCurriculumPage() {
  const params = useParams<{ id: string }>();
  const subjectId = params.id;
  const [activeStage, setActiveStage] = useState<ChineseStageKey>("primary");
  const [activeModule, setActiveModule] = useState<ChineseModuleKey | "all">("all");
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(
    () => new Set(["primary-1"])
  );

  const grades = getChineseCurriculumByStage(activeStage);
  const activeStageInfo = STAGES.find((stage) => stage.key === activeStage) ?? STAGES[0];

  const switchStage = (stage: ChineseStageKey) => {
    const nextGrades = getChineseCurriculumByStage(stage);
    setActiveStage(stage);
    setExpandedGrades(new Set(nextGrades[0] ? [nextGrades[0].key] : []));
  };

  const toggleGrade = (gradeKey: string) => {
    setExpandedGrades((current) => {
      const next = new Set(current);
      if (next.has(gradeKey)) {
        next.delete(gradeKey);
      } else {
        next.add(gradeKey);
      }
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href={`/subjects/${subjectId}`}
            className="text-sm font-medium text-stone-500 transition hover:text-slate-950"
          >
            ← 返回语文主页
          </Link>
          <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-500 shadow-sm">
            语文体系
          </span>
        </header>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-7 shadow-sm md:p-9">
          <div className="grid gap-8 md:grid-cols-[1fr_280px] md:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold text-rose-700">Chinese Learning Map</p>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">语文分板块学习</h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
                按“基础积累、阅读理解、古诗文、作文训练、朗读背诵”拆开学。小学先打底，
                初中再提高阅读深度和写作结构，避免只靠零散资料硬背。
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <p className="text-sm font-semibold text-stone-500">当前体系</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-2xl font-black text-slate-950">9</div>
                  <div className="mt-1 text-xs text-stone-400">年级</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-950">5</div>
                  <div className="mt-1 text-xs text-stone-400">板块</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-950">{countChineseTopics()}</div>
                  <div className="mt-1 text-xs text-stone-400">主题</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                学段
              </p>
              <div className="mt-3 space-y-2">
                {STAGES.map((stage) => (
                  <button
                    key={stage.key}
                    onClick={() => switchStage(stage.key)}
                    className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                      activeStage === stage.key
                        ? "bg-slate-950 text-white"
                        : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <div className="text-lg font-black">{stage.label}</div>
                    <div
                      className={`mt-1 text-xs leading-5 ${
                        activeStage === stage.key ? "text-white/70" : "text-stone-400"
                      }`}
                    >
                      {stage.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
              <p className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                板块
              </p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setActiveModule("all")}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                    activeModule === "all"
                      ? "bg-slate-950 text-white"
                      : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  全部板块
                </button>
                {MODULE_KEYS.map((moduleKey) => {
                  const meta = CHINESE_MODULE_META[moduleKey];
                  const tone = getToneStyle(meta.tone);
                  const active = activeModule === moduleKey;
                  return (
                    <button
                      key={moduleKey}
                      onClick={() => setActiveModule(moduleKey)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                        active
                          ? `${tone.bg} ${tone.border} ${tone.text}`
                          : "border-transparent bg-stone-50 text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      <span className="mr-2">{meta.icon}</span>
                      {meta.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="space-y-4">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">{activeStageInfo.label}语文</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {grades.length} 个年级 ·{" "}
                    {activeModule === "all"
                      ? `${MODULE_KEYS.length} 个板块`
                      : CHINESE_MODULE_META[activeModule].name}
                    · {countChineseTopics(activeStage, activeModule === "all" ? undefined : activeModule)} 个主题
                  </p>
                </div>
                <p className="max-w-md text-sm leading-6 text-stone-500">
                  建议顺序：先基础积累，再阅读理解；古诗文和朗读每天少量穿插，作文每周完成一篇。
                </p>
              </div>
            </div>

            {grades.map((grade) => {
              const open = expandedGrades.has(grade.key);
              const visibleModules = grade.modules.filter(
                (moduleBlock) => activeModule === "all" || moduleBlock.module === activeModule
              );

              return (
                <article
                  key={grade.key}
                  className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"
                >
                  <button
                    onClick={() => toggleGrade(grade.key)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-stone-50 md:px-6"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-black">{grade.grade}</h3>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                          {grade.subtitle}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-stone-500">{grade.focus}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="hidden text-sm text-stone-400 sm:inline">
                        {visibleModules.reduce((sum, block) => sum + block.topics.length, 0)} 个主题
                      </span>
                      <span className="text-lg text-stone-400">{open ? "▴" : "▾"}</span>
                    </div>
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-stone-100 bg-stone-50/70 p-4 md:p-5">
                      {visibleModules.map((moduleBlock) => {
                        const meta = CHINESE_MODULE_META[moduleBlock.module];
                        const tone = getToneStyle(meta.tone);

                        return (
                          <section
                            key={moduleBlock.module}
                            className={`rounded-3xl border bg-white p-5 ${tone.border}`}
                          >
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`grid h-10 w-10 place-items-center rounded-2xl ${tone.soft}`}
                                  >
                                    {meta.icon}
                                  </span>
                                  <div>
                                    <h4 className={`text-xl font-black ${tone.text}`}>{meta.name}</h4>
                                    <p className="mt-1 text-sm text-stone-500">{moduleBlock.goal}</p>
                                  </div>
                                </div>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone.bg} ${tone.text}`}>
                                {moduleBlock.topics.length} 个主题
                              </span>
                            </div>

                            <div className="grid gap-3">
                              {moduleBlock.topics.map((item) => (
                                <div
                                  key={item.title}
                                  className={`rounded-2xl border border-stone-100 bg-white p-4 ring-1 ${tone.ring}`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <h5 className="text-base font-black text-slate-950">{item.title}</h5>
                                      <p className="mt-2 text-sm leading-6 text-stone-600">{item.focus}</p>
                                    </div>
                                  </div>

                                  {item.items.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {item.items.map((tag) => (
                                        <span
                                          key={tag}
                                          className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {item.practice.length > 0 && (
                                    <div className="mt-4 border-t border-stone-100 pt-3">
                                      <p className="text-xs font-bold text-stone-400">练习方式</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {item.practice.map((practice) => (
                                          <span
                                            key={practice}
                                            className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.bg} ${tone.text}`}
                                          >
                                            {practice}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
