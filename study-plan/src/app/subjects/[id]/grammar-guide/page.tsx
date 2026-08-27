"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CHECKLIST,
  CONFUSIONS,
  GRAMMAR_MODULES,
  GRAMMAR_QUIZ,
  MOTHER_SENTENCES,
  ROADMAP,
  TENSES,
  VERB_SYSTEMS,
} from "@/lib/english-grammar-guide";

const MODULE_STYLES: Record<string, { tab: string; badge: string; panel: string; dot: string }> = {
  sky: { tab: "border-sky-200 bg-sky-50 text-sky-950", badge: "bg-sky-500 text-white", panel: "from-sky-50 to-white", dot: "bg-sky-500" },
  rose: { tab: "border-rose-200 bg-rose-50 text-rose-950", badge: "bg-rose-500 text-white", panel: "from-rose-50 to-white", dot: "bg-rose-500" },
  amber: { tab: "border-amber-200 bg-amber-50 text-amber-950", badge: "bg-amber-500 text-white", panel: "from-amber-50 to-white", dot: "bg-amber-500" },
  violet: { tab: "border-violet-200 bg-violet-50 text-violet-950", badge: "bg-violet-500 text-white", panel: "from-violet-50 to-white", dot: "bg-violet-500" },
  emerald: { tab: "border-emerald-200 bg-emerald-50 text-emerald-950", badge: "bg-emerald-500 text-white", panel: "from-emerald-50 to-white", dot: "bg-emerald-500" },
  cyan: { tab: "border-cyan-200 bg-cyan-50 text-cyan-950", badge: "bg-cyan-500 text-white", panel: "from-cyan-50 to-white", dot: "bg-cyan-500" },
  indigo: { tab: "border-indigo-200 bg-indigo-50 text-indigo-950", badge: "bg-indigo-500 text-white", panel: "from-indigo-50 to-white", dot: "bg-indigo-500" },
  pink: { tab: "border-pink-200 bg-pink-50 text-pink-950", badge: "bg-pink-500 text-white", panel: "from-pink-50 to-white", dot: "bg-pink-500" },
};

const TENSE_STYLES: Record<string, { button: string; fill: string; text: string }> = {
  emerald: { button: "border-emerald-200 bg-emerald-50", fill: "bg-emerald-500", text: "text-emerald-700" },
  cyan: { button: "border-cyan-200 bg-cyan-50", fill: "bg-cyan-500", text: "text-cyan-700" },
  amber: { button: "border-amber-200 bg-amber-50", fill: "bg-amber-500", text: "text-amber-700" },
  violet: { button: "border-violet-200 bg-violet-50", fill: "bg-violet-500", text: "text-violet-700" },
  rose: { button: "border-rose-200 bg-rose-50", fill: "bg-rose-500", text: "text-rose-700" },
  indigo: { button: "border-indigo-200 bg-indigo-50", fill: "bg-indigo-500", text: "text-indigo-700" },
};

const ROADMAP_STYLES: Record<string, { bar: string; chip: string; ring: string }> = {
  sky: { bar: "bg-sky-500", chip: "bg-sky-50 text-sky-800", ring: "border-sky-200" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800", ring: "border-emerald-200" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800", ring: "border-amber-200" },
  violet: { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-800", ring: "border-violet-200" },
};

function SectionHeading({ eyebrow, title, description, dark = false }: { eyebrow: string; title: string; description: string; dark?: boolean }) {
  return (
    <div className="max-w-3xl">
      <p className={`text-xs font-black uppercase tracking-[0.22em] ${dark ? "text-violet-300" : "text-violet-600"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-3xl font-black tracking-tight sm:text-4xl ${dark ? "text-white" : "text-slate-950"}`}>{title}</h2>
      <p className={`mt-3 text-sm leading-7 sm:text-base ${dark ? "text-white/65" : "text-slate-600"}`}>{description}</p>
    </div>
  );
}

function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

export default function GrammarGuidePage() {
  const { id } = useParams<{ id: string }>();
  const [activeModuleId, setActiveModuleId] = useState(GRAMMAR_MODULES[0].id);
  const [activeTopicNumber, setActiveTopicNumber] = useState(GRAMMAR_MODULES[0].topics[0].number);
  const [activeVerbId, setActiveVerbId] = useState<(typeof VERB_SYSTEMS)[number]["id"]>(VERB_SYSTEMS[1].id);
  const [activeTenseId, setActiveTenseId] = useState<(typeof TENSES)[number]["id"]>(TENSES[0].id);
  const [openConfusion, setOpenConfusion] = useState(0);
  const [roadmapIndex, setRoadmapIndex] = useState(0);
  const [motherIndex, setMotherIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const activeModule = useMemo(
    () => GRAMMAR_MODULES.find((module) => module.id === activeModuleId) ?? GRAMMAR_MODULES[0],
    [activeModuleId]
  );
  const activeTopic = activeModule.topics.find((topic) => topic.number === activeTopicNumber) ?? activeModule.topics[0];
  const activeVerb = VERB_SYSTEMS.find((system) => system.id === activeVerbId) ?? VERB_SYSTEMS[0];
  const activeTense = TENSES.find((tense) => tense.id === activeTenseId) ?? TENSES[0];
  const quiz = GRAMMAR_QUIZ[quizIndex];

  const chooseModule = (moduleId: string) => {
    const nextModule = GRAMMAR_MODULES.find((module) => module.id === moduleId) ?? GRAMMAR_MODULES[0];
    setActiveModuleId(nextModule.id);
    setActiveTopicNumber(nextModule.topics[0].number);
  };

  const nextQuiz = () => {
    setSelectedAnswer(null);
    setQuizIndex((index) => (index + 1) % GRAMMAR_QUIZ.length);
  };

  return (
    <div className="min-h-screen bg-[#f8f7fc] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-white/80 bg-[#f8f7fc]/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/subjects/${id}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-500 shadow-sm transition hover:border-violet-300 hover:text-violet-700" aria-label="返回英语主页">←</Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">🧠 语法大全</p>
              <p className="truncate text-xs text-slate-500">六年级至初三 · 完整知识系统</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs font-black text-slate-500 shadow-sm lg:flex">
            <a href="#atlas" className="rounded-full px-3 py-1.5 transition hover:bg-violet-50 hover:text-violet-700">知识地图</a>
            <a href="#engine" className="rounded-full px-3 py-1.5 transition hover:bg-violet-50 hover:text-violet-700">动词引擎</a>
            <a href="#timeline" className="rounded-full px-3 py-1.5 transition hover:bg-violet-50 hover:text-violet-700">时态时间轴</a>
            <a href="#roadmap" className="rounded-full px-3 py-1.5 transition hover:bg-violet-50 hover:text-violet-700">60 步路线</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-violet-100 bg-[radial-gradient(circle_at_top_left,_#ede9fe_0,_#faf5ff_32%,_#ffffff_68%)]">
          <div className="absolute -right-28 top-10 h-80 w-80 rounded-full bg-fuchsia-200/35 blur-3xl" />
          <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">Grammar Universe</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-violet-100">53 个核心知识点 · 60 步路线</span>
              </div>
              <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                语法不是规则表，
                <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">是一套句子操作系统</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                从词的位置开始，找到谓语发动机，把动作放进时间轴，再用非谓语和从句扩展表达。每个知识点都同时看形式、意义、使用和易错点。
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-4">
                {[["8", "学习模块"], ["53", "核心主题"], ["6", "核心时态"], ["20", "高频母句"]].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white bg-white/80 px-4 py-4 shadow-sm backdrop-blur">
                    <p className="text-2xl font-black text-violet-700">{value}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[420px] overflow-hidden rounded-[36px] border border-white bg-[#17132b] p-6 text-white shadow-[0_30px_80px_rgba(76,29,149,0.25)] sm:p-8">
              <div className="absolute -right-14 -top-14 h-48 w-48 rounded-full border border-violet-400/25" />
              <div className="absolute -right-3 top-1 h-28 w-28 rounded-full border border-fuchsia-300/20" />
              <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">System map</p>
                <h2 className="mt-2 text-2xl font-black">一条主线，串起全部语法</h2>
                <div className="mt-7 space-y-3">
                  {[
                    ["01", "词法", "知道词能站在哪里", "bg-sky-400"],
                    ["02", "动词", "找到句子的发动机", "bg-rose-400"],
                    ["03", "时态", "确定动作的时间坐标", "bg-amber-400"],
                    ["04", "句型", "搭出完整句子骨架", "bg-emerald-400"],
                    ["05", "从句", "连接更完整的思想", "bg-violet-400"],
                  ].map(([number, title, copy, color], index) => (
                    <div key={number} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 transition hover:bg-white/[0.12]">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-black text-slate-950 ${color}`}>{number}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-black">{title}</p>
                        <p className="mt-0.5 text-xs font-medium text-white/50">{copy}</p>
                      </div>
                      <span className="text-white/25 transition group-hover:translate-x-1 group-hover:text-white">→</span>
                      {index < 4 && <span className="absolute left-[2.85rem] mt-[4.25rem] h-3 border-l border-dashed border-white/20" />}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-violet-500/15 p-4 text-xs font-bold leading-6 text-violet-100 ring-1 ring-violet-400/20">
                  <span className="text-xl">💡</span>
                  看到句子先找谓语，再问：谁在做？什么时候做？后面还缺什么？
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-16 sm:px-6 sm:py-20">
          <section id="atlas" className="scroll-mt-24">
            <SectionHeading eyebrow="01 · Knowledge Atlas" title="先看全貌，再深入每个知识点" description="八大模块覆盖 PDF 中的 53 个编号主题。点击模块和知识点，就能看到核心形式、意义、例句与高频陷阱。" />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {GRAMMAR_MODULES.map((module) => {
                const style = MODULE_STYLES[module.accent];
                const active = module.id === activeModule.id;
                return (
                  <button key={module.id} type="button" onClick={() => chooseModule(module.id)} className={`rounded-2xl border p-4 text-left transition ${active ? `${style.tab} -translate-y-1 shadow-lg` : "border-slate-200 bg-white hover:border-violet-200 hover:shadow-sm"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${active ? style.badge : "bg-slate-100 text-slate-500"}`}>{module.letter}</span>
                      <span className="text-[11px] font-black text-slate-400">{module.topics.length} 个主题</span>
                    </div>
                    <p className="mt-3 font-black">{module.title}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{module.subtitle}</p>
                  </button>
                );
              })}
            </div>

            <div className={`mt-5 grid overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br ${MODULE_STYLES[activeModule.accent].panel} shadow-sm lg:grid-cols-[0.38fr_0.62fr]`}>
              <div className="border-b border-slate-200/80 bg-white/70 p-4 lg:border-b-0 lg:border-r sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Module {activeModule.letter}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{activeModule.title}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-200">{activeModule.stage}</span>
                </div>
                <div className="mt-5 grid max-h-[430px] gap-2 overflow-y-auto pr-1">
                  {activeModule.topics.map((topic) => {
                    const active = topic.number === activeTopic.number;
                    return (
                      <button key={topic.number} type="button" onClick={() => setActiveTopicNumber(topic.number)} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${active ? `${MODULE_STYLES[activeModule.accent].tab} shadow-sm` : "border-transparent bg-white/70 hover:border-slate-200"}`}>
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black ${active ? MODULE_STYLES[activeModule.accent].badge : "bg-slate-100 text-slate-400"}`}>{String(topic.number).padStart(2, "0")}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black">{topic.name}</span>
                          <span className="block truncate text-[11px] font-semibold text-slate-400">{topic.english}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-5 sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Topic {String(activeTopic.number).padStart(2, "0")} · {activeTopic.english}</p>
                    <h3 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">{activeTopic.name}</h3>
                  </div>
                  <span className={`h-3 w-3 rounded-full ${MODULE_STYLES[activeModule.accent].dot}`} />
                </div>
                <p className="mt-5 max-w-3xl text-base font-medium leading-8 text-slate-600">{activeTopic.summary}</p>
                <div className="mt-7 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white bg-white/85 p-5 shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">核心形式</p>
                    <p className="mt-3 text-lg font-black leading-7 text-slate-950">{activeTopic.formula}</p>
                  </div>
                  <div className="rounded-2xl bg-[#17132b] p-5 text-white shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-300">Example</p>
                      <button type="button" onClick={() => speakEnglish(activeTopic.example)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs transition hover:bg-white/20" aria-label="朗读例句">▶</button>
                    </div>
                    <p className="mt-3 text-lg font-black leading-7">{activeTopic.example}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-950">
                  <span className="mt-0.5 text-lg">⚠️</span>
                  <div><span className="text-amber-600">易错提醒：</span>{activeTopic.tip}</div>
                </div>
              </div>
            </div>
          </section>

          <section id="engine" className="scroll-mt-24 overflow-hidden rounded-[36px] bg-[#17132b] p-6 text-white shadow-[0_24px_70px_rgba(30,25,60,0.2)] sm:p-10">
            <SectionHeading eyebrow="02 · Verb Engine" title="先认动词系统，否定和疑问就不会乱" description="be 动词、普通动词、情态动词各有自己的操作方式。选择一种系统，看同一句话怎样在肯定、否定和疑问之间切换。" dark />
            <div className="mt-8 grid gap-6 lg:grid-cols-[0.34fr_0.66fr]">
              <div className="space-y-2">
                {VERB_SYSTEMS.map((system, index) => (
                  <button key={system.id} type="button" onClick={() => setActiveVerbId(system.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${system.id === activeVerb.id ? "border-violet-400 bg-violet-500/20" : "border-white/10 bg-white/[0.05] hover:bg-white/10"}`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-black">0{index + 1}</span>
                    <span>
                      <span className="block font-black">{system.name}</span>
                      <span className="mt-0.5 block text-xs font-medium text-white/45">{system.label}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">{activeVerb.label}</p>
                    <h3 className="mt-2 text-2xl font-black">{activeVerb.name}</h3>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">{activeVerb.forms}</span>
                </div>
                <div className="mt-7 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                  {[["肯定", activeVerb.positive, "text-emerald-300"], ["否定", activeVerb.negative, "text-rose-300"], ["疑问", activeVerb.question, "text-sky-300"]].map(([label, sentence, color], index) => (
                    <div key={label} className="contents">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4">
                        <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${color}`}>{label}</p>
                        <p className="mt-3 text-lg font-black leading-7">{sentence}</p>
                      </div>
                      {index < 2 && <span className="hidden text-xl text-white/25 md:block">→</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl bg-violet-500/15 p-4 text-sm font-bold leading-7 text-violet-100 ring-1 ring-violet-400/20">操作规则：{activeVerb.rule}</div>
              </div>
            </div>
          </section>

          <section id="timeline" className="scroll-mt-24">
            <SectionHeading eyebrow="03 · Time Machine" title="六大时态，放在同一条时间轴上看" description="时态不是六张互不相关的公式卡。先确定动作在过去、现在还是未来，再判断它是一般、正在进行，还是与现在保持联系。" />
            <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="relative mb-10 mt-5 px-4 sm:px-10">
                <div className="h-1 rounded-full bg-gradient-to-r from-amber-200 via-emerald-300 to-violet-300" />
                <div className="absolute inset-x-4 -top-3 flex justify-between text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 sm:inset-x-10">
                  <span className="mt-5">Past 过去</span><span className="mt-5">Now 现在</span><span className="mt-5">Future 未来</span>
                </div>
                <span className={`absolute top-[-7px] h-4 w-4 -translate-x-1/2 rounded-full ring-4 ring-white transition-all duration-500 ${TENSE_STYLES[activeTense.color].fill}`} style={{ left: `${activeTense.position}%` }} />
              </div>
              <div className="mt-14 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                {TENSES.map((tense) => {
                  const style = TENSE_STYLES[tense.color];
                  return <button key={tense.id} type="button" onClick={() => setActiveTenseId(tense.id)} className={`rounded-2xl border p-3 text-left transition ${tense.id === activeTense.id ? `${style.button} -translate-y-1 shadow-md` : "border-slate-200 bg-slate-50 hover:bg-white"}`}><p className={`text-xs font-black ${tense.id === activeTense.id ? style.text : "text-slate-500"}`}>{tense.name}</p><p className="mt-1 text-[11px] font-semibold text-slate-400">{tense.stage}</p></button>;
                })}
              </div>
              <div className="mt-5 grid gap-4 rounded-[28px] bg-slate-950 p-5 text-white sm:grid-cols-[0.9fr_1.1fr] sm:p-7">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">{activeTense.stage}</p>
                  <h3 className="mt-2 text-3xl font-black">{activeTense.name}</h3>
                  <p className="mt-5 text-xs font-bold text-white/45">结构</p>
                  <p className="mt-1 text-lg font-black">{activeTense.structure}</p>
                  <p className="mt-4 text-xs font-bold text-white/45">典型时间词</p>
                  <p className="mt-1 text-sm font-bold text-white/80">{activeTense.signal}</p>
                </div>
                <div className="flex flex-col justify-center rounded-2xl bg-white/[0.08] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Listen & remember</p>
                    <button type="button" onClick={() => speakEnglish(activeTense.example)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black transition hover:bg-white/20">▶ 朗读</button>
                  </div>
                  <p className="mt-5 text-2xl font-black leading-9">{activeTense.example}</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading eyebrow="04 · Upgrade Station" title="动词和句子怎样“升级”" description="一个句子从简单走向复杂，主要经过三次升级：改变关注点、安排多个动词、连接多个分句。" />
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {[
                { number: "01", title: "主动 → 被动", subtitle: "改变关注点", color: "from-rose-500 to-orange-400", before: "Tom cleaned the room.", after: "The room was cleaned by Tom.", formula: "be + 过去分词" },
                { number: "02", title: "谓语 → 非谓语", subtitle: "安排多个动词", color: "from-violet-600 to-fuchsia-500", before: "I want. I learn English.", after: "I want to learn English.", formula: "to do / doing / done" },
                { number: "03", title: "简单句 → 从句", subtitle: "连接完整思想", color: "from-sky-500 to-cyan-400", before: "It rains. We will stay home.", after: "If it rains, we will stay home.", formula: "连接词 + 主语 + 谓语" },
              ].map((card) => (
                <article key={card.number} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <div className={`bg-gradient-to-r ${card.color} p-5 text-white`}><p className="text-xs font-black text-white/65">UPGRADE {card.number}</p><h3 className="mt-2 text-xl font-black">{card.title}</h3><p className="mt-1 text-xs font-bold text-white/75">{card.subtitle}</p></div>
                  <div className="p-5">
                    <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-500 line-through decoration-slate-300">{card.before}</p>
                    <div className="my-2 text-center text-slate-300">↓</div>
                    <p className="rounded-xl bg-violet-50 p-3 text-sm font-black leading-6 text-violet-950">{card.after}</p>
                    <p className="mt-4 text-xs font-black text-slate-400">核心结构 · {card.formula}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-8 lg:grid-cols-[0.45fr_0.55fr] lg:items-start">
            <div>
              <SectionHeading eyebrow="05 · Contrast Lab" title="易混语法，必须成对看" description="很多错误不是规则不会，而是两个相似结构没有形成清晰边界。点击卡片，马上看出差别。" />
              <div className="mt-7 grid gap-2">
                {CONFUSIONS.map((item, index) => (
                  <button key={item.pair} type="button" onClick={() => setOpenConfusion(index)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${openConfusion === index ? "border-violet-300 bg-violet-50 text-violet-950 shadow-sm" : "border-slate-200 bg-white hover:border-violet-200"}`}><span className="font-black">{item.pair}</span><span className="text-slate-400">→</span></button>
                ))}
              </div>
            </div>
            <div className="rounded-[32px] bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-violet-200 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Difference spotlight</p>
              <h3 className="mt-3 text-3xl font-black">{CONFUSIONS[openConfusion].pair}</h3>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/15"><p className="text-xs font-black text-violet-100">A</p><p className="mt-2 text-sm font-bold leading-7">{CONFUSIONS[openConfusion].left}</p></div>
                <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-white/15"><p className="text-xs font-black text-fuchsia-100">B</p><p className="mt-2 text-sm font-bold leading-7">{CONFUSIONS[openConfusion].right}</p></div>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl bg-white p-4 text-slate-950"><p className="text-sm font-black leading-7">{CONFUSIONS[openConfusion].example}</p><button type="button" onClick={() => speakEnglish(CONFUSIONS[openConfusion].example)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs text-violet-700">▶</button></div>
            </div>
          </section>

          <section id="roadmap" className="scroll-mt-24">
            <SectionHeading eyebrow="06 · 60-step Roadmap" title="六年级到初三，按认知顺序走 60 步" description="先句子骨架，再动词，再时间，最后进入复杂句。切换年级，可以看到每一阶段最合适的学习顺序。" />
            <div className="mt-8 grid gap-5 lg:grid-cols-[0.3fr_0.7fr]">
              <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-1">
                {ROADMAP.map((stage, index) => {
                  const style = ROADMAP_STYLES[stage.color];
                  return <button key={stage.grade} type="button" onClick={() => setRoadmapIndex(index)} className={`overflow-hidden rounded-2xl border bg-white text-left transition ${roadmapIndex === index ? `${style.ring} shadow-md` : "border-slate-200 hover:border-violet-200"}`}><div className={`h-1.5 ${style.bar}`} /><div className="p-4"><div className="flex items-center justify-between"><span className="text-lg font-black">{stage.grade}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${style.chip}`}>{stage.range}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{stage.title}</p></div></button>;
                })}
              </div>
              <div className={`rounded-[30px] border bg-white p-5 shadow-sm sm:p-7 ${ROADMAP_STYLES[ROADMAP[roadmapIndex].color].ring}`}>
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{ROADMAP[roadmapIndex].range} Steps</p><h3 className="mt-2 text-2xl font-black">{ROADMAP[roadmapIndex].grade} · {ROADMAP[roadmapIndex].title}</h3></div><span className="text-xs font-bold text-slate-400">按顺序逐个点亮</span></div>
                <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ROADMAP[roadmapIndex].topics.map((topic, index) => {
                    const first = Number(ROADMAP[roadmapIndex].range.slice(0, 2));
                    return <div key={topic} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white ${ROADMAP_STYLES[ROADMAP[roadmapIndex].color].bar}`}>{String(first + index).padStart(2, "0")}</span><span className="text-xs font-bold leading-5 text-slate-700">{topic}</span></div>;
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">Mother Sentences</p><h3 className="mt-2 text-2xl font-black">20 个母句，练出数百个句子</h3></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{motherIndex + 1} / 20</span></div>
              <div className="mt-6 rounded-[28px] bg-[#17132b] p-6 text-white sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">{MOTHER_SENTENCES[motherIndex][1]}</p>
                <div className="mt-5 flex items-start justify-between gap-4"><p className="text-2xl font-black leading-10 sm:text-3xl">{MOTHER_SENTENCES[motherIndex][0]}</p><button type="button" onClick={() => speakEnglish(MOTHER_SENTENCES[motherIndex][0])} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm transition hover:bg-white/20">▶</button></div>
                <div className="mt-6 flex flex-wrap gap-2">{["改人称", "改时间", "改否定", "改疑问", "换核心词"].map((action) => <span key={action} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-white/70">{action}</span>)}</div>
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{MOTHER_SENTENCES.map((sentence, index) => <button key={sentence[0]} type="button" onClick={() => setMotherIndex(index)} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black transition ${index === motherIndex ? "bg-violet-600 text-white shadow-md" : "bg-slate-100 text-slate-400 hover:bg-violet-50 hover:text-violet-700"}`}>{index + 1}</button>)}</div>
            </div>

            <div className="rounded-[32px] bg-violet-600 p-5 text-white shadow-xl shadow-violet-200 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Instant feedback</p>
              <div className="mt-3 flex items-center justify-between gap-3"><h3 className="text-2xl font-black">1 分钟语法挑战</h3><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">{quizIndex + 1} / {GRAMMAR_QUIZ.length}</span></div>
              <p className="mt-6 rounded-2xl bg-white/[0.12] p-4 text-lg font-black leading-8">{quiz.question}</p>
              <div className="mt-4 space-y-2">
                {quiz.choices.map((choice, index) => {
                  const answered = selectedAnswer !== null;
                  const correct = index === quiz.answer;
                  const selected = index === selectedAnswer;
                  const state = !answered ? "border-white/20 bg-white/10 hover:bg-white/20" : correct ? "border-emerald-300 bg-emerald-400/25" : selected ? "border-rose-300 bg-rose-400/25" : "border-white/10 bg-white/5 opacity-55";
                  return <button key={choice} type="button" disabled={answered} onClick={() => setSelectedAnswer(index)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${state}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-black">{String.fromCharCode(65 + index)}</span>{choice}</button>;
                })}
              </div>
              {selectedAnswer !== null && <div aria-live="polite" className="mt-4 rounded-2xl bg-white p-4 text-slate-900"><p className={`text-sm font-black ${selectedAnswer === quiz.answer ? "text-emerald-700" : "text-rose-700"}`}>{selectedAnswer === quiz.answer ? "答对了！规则已经连起来了。" : `正确答案是 ${String.fromCharCode(65 + quiz.answer)}。`}</p><p className="mt-2 text-xs font-bold leading-6 text-slate-600">{quiz.explanation}</p><button type="button" onClick={nextQuiz} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white">下一题 →</button></div>}
            </div>
          </section>

          <section className="overflow-hidden rounded-[36px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-6 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.38fr_0.62fr]">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Final Scan</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">写完句子，用 20 问给它做体检</h2><p className="mt-4 text-sm leading-7 text-slate-600">不需要每次都背全部规则。按“句子骨架 → 动词 → 时间 → 词形 → 从句”的顺序扫描，错误会更容易被发现。</p></div>
              <div className="grid gap-2 sm:grid-cols-2">{CHECKLIST.map((item, index) => <div key={item} className="flex items-start gap-3 rounded-xl border border-white bg-white/80 p-3 shadow-sm"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-100 text-[10px] font-black text-emerald-700">{String(index + 1).padStart(2, "0")}</span><p className="text-xs font-bold leading-6 text-slate-700">{item}</p></div>)}</div>
            </div>
          </section>

          <section className="rounded-[32px] bg-[#17132b] px-6 py-9 text-center text-white sm:px-10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">The real goal</p>
            <p className="mx-auto mt-4 max-w-4xl text-2xl font-black leading-10 sm:text-3xl">把语法学成一套随时能调用的句子系统，而不是一张需要背诵的规则表。</p>
            <p className="mt-4 text-xs font-bold text-white/40">内容基于《六年级至初中英语语法完整知识体系》整理</p>
          </section>
        </div>
      </main>
    </div>
  );
}
