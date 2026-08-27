"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ABILITY_LEVELS,
  ADVANCED_STRUCTURES,
  CLAUSE_CARDS,
  CORE_TENSES,
  EXPANSION_TOOLS,
  LEARNING_STAGES,
  QUICK_CHALLENGES,
  SENTENCE_COMPONENTS,
  SENTENCE_PATTERNS,
  VERB_SYSTEMS,
} from "@/lib/english-sentence-structure";

const SECTION_LINKS = [
  ["foundation", "句子地基"],
  ["components", "七大成分"],
  ["patterns", "六大句型"],
  ["transform", "句子变形"],
  ["tenses", "时态地图"],
  ["growth", "句子长大"],
  ["clauses", "从句与长句"],
  ["roadmap", "学习路线"],
] as const;

const ROLE_STYLES: Record<string, { box: string; badge: string }> = {
  S: { box: "border-sky-200 bg-sky-50 text-sky-950", badge: "bg-sky-500" },
  V: { box: "border-rose-200 bg-rose-50 text-rose-950", badge: "bg-rose-500" },
  LV: { box: "border-violet-200 bg-violet-50 text-violet-950", badge: "bg-violet-500" },
  P: { box: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950", badge: "bg-fuchsia-500" },
  O: { box: "border-amber-200 bg-amber-50 text-amber-950", badge: "bg-amber-500" },
  IO: { box: "border-teal-200 bg-teal-50 text-teal-950", badge: "bg-teal-500" },
  DO: { box: "border-orange-200 bg-orange-50 text-orange-950", badge: "bg-orange-500" },
  C: { box: "border-pink-200 bg-pink-50 text-pink-950", badge: "bg-pink-500" },
  TH: { box: "border-indigo-200 bg-indigo-50 text-indigo-950", badge: "bg-indigo-500" },
  BE: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", badge: "bg-emerald-500" },
  N: { box: "border-amber-200 bg-amber-50 text-amber-950", badge: "bg-amber-500" },
  ADV: { box: "border-cyan-200 bg-cyan-50 text-cyan-950", badge: "bg-cyan-500" },
};

const COMPONENT_STYLES = [
  "border-sky-200 bg-sky-50/80",
  "border-rose-200 bg-rose-50/80",
  "border-amber-200 bg-amber-50/80",
  "border-fuchsia-200 bg-fuchsia-50/80",
  "border-violet-200 bg-violet-50/80",
  "border-cyan-200 bg-cyan-50/80",
  "border-pink-200 bg-pink-50/80",
] as const;

const TENSE_STYLES = [
  "border-emerald-200 bg-emerald-50",
  "border-cyan-200 bg-cyan-50",
  "border-amber-200 bg-amber-50",
  "border-violet-200 bg-violet-50",
  "border-rose-200 bg-rose-50",
  "border-indigo-200 bg-indigo-50",
] as const;

function SectionHeading({
  eyebrow,
  title,
  description,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p className={`text-xs font-black uppercase tracking-[0.22em] ${dark ? "text-cyan-300" : "text-indigo-600"}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-3xl font-black tracking-tight sm:text-4xl ${dark ? "text-white" : "text-slate-950"}`}>{title}</h2>
      <p className={`mt-3 text-sm leading-7 sm:text-base ${dark ? "text-white/65" : "text-slate-600"}`}>{description}</p>
    </div>
  );
}

function SentenceTokens({
  tokens,
}: {
  tokens: (typeof SENTENCE_PATTERNS)[number]["tokens"];
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {tokens.map((token, index) => {
        const style = ROLE_STYLES[token.role] ?? ROLE_STYLES.ADV;
        return (
          <div
            key={`${token.role}-${token.text}-${index}`}
            className={`min-w-24 rounded-2xl border px-4 py-3 shadow-sm ${style.box}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] opacity-70">
              <span className={`h-2 w-2 rounded-full ${style.badge}`} />
              {token.label}
            </div>
            <p className="mt-1.5 text-lg font-black leading-6">{token.text}</p>
          </div>
        );
      })}
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

export default function SentenceStructurePage() {
  const { id } = useParams<{ id: string }>();
  const [activePatternId, setActivePatternId] = useState("svo");
  const [activeVerbSystemId, setActiveVerbSystemId] = useState("ordinary");
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);

  const activePattern = useMemo(
    () => SENTENCE_PATTERNS.find((pattern) => pattern.id === activePatternId) ?? SENTENCE_PATTERNS[0],
    [activePatternId]
  );
  const activeVerbSystem =
    VERB_SYSTEMS.find((system) => system.id === activeVerbSystemId) ?? VERB_SYSTEMS[0];
  const challenge = QUICK_CHALLENGES[challengeIndex];

  const nextChallenge = () => {
    setSelectedChoice(null);
    setChallengeIndex((index) => (index + 1) % QUICK_CHALLENGES.length);
  };

  return (
    <div className="min-h-screen bg-[#f5f6fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/80 bg-[#f5f6fb]/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/subjects/${id}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-500 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
              aria-label="返回英语主页"
            >
              ←
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">🧩 句子结构</p>
              <p className="truncate text-xs text-slate-500">六年级至初中 · 从简单句到长难句</p>
            </div>
          </div>
          <span className="hidden rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700 sm:inline-flex">
            12 级能力树 · 60 个核心点
          </span>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-indigo-100 bg-gradient-to-br from-[#eef2ff] via-white to-[#ecfeff]">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />
          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">句法学习地图</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-indigo-100">基于 PDF 完整体系整理</span>
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-6xl">
                看懂句子，
                <span className="text-indigo-600">像搭积木一样学语法</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                不从术语开始背。先找到句子的发动机——谓语，再找到谁在行动，最后判断后面还缺宾语、表语还是补语。
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  ["01", "先找谓语", "句子的发动机"],
                  ["02", "再找主语", "谁或什么在行动"],
                  ["03", "看后面缺什么", "宾语、表语或补语"],
                ].map(([number, title, copy]) => (
                  <div key={number} className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-xs font-black text-indigo-400">STEP {number}</p>
                    <p className="mt-2 font-black text-slate-950">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{copy}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white bg-white/85 p-5 shadow-[0_24px_70px_rgba(79,70,229,0.14)] backdrop-blur sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500">Sentence X-ray</p>
                  <p className="mt-1 text-lg font-black text-slate-950">给句子拍一张“结构片”</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">完整句 ✓</span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
                  <p className="text-[11px] font-black text-sky-600">主语 SUBJECT</p>
                  <p className="mt-1 text-xl font-black">A cute dog</p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-950">
                  <p className="text-[11px] font-black text-rose-600">谓语 VERB</p>
                  <p className="mt-1 text-xl font-black">is running</p>
                </div>
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-950">
                  <p className="text-[11px] font-black text-cyan-600">地点状语 ADVERBIAL</p>
                  <p className="mt-1 text-xl font-black">in the park.</p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-xs font-bold text-white/55">核心骨架</p>
                <p className="mt-1 text-lg font-black">A dog + is running</p>
                <p className="mt-2 text-sm leading-6 text-white/70">定语 cute 修饰 dog；地点短语 in the park 给动作补充坐标。</p>
              </div>
            </div>
          </div>
        </section>

        <nav className="sticky top-[65px] z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6">
            {SECTION_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={`#${href}`}
                className="shrink-0 rounded-full bg-slate-100 px-3.5 py-2 text-xs font-black text-slate-600 transition hover:bg-indigo-600 hover:text-white"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mx-auto w-full max-w-7xl space-y-24 px-4 py-14 sm:px-6 sm:py-20">
          <section id="foundation" className="scroll-mt-32">
            <SectionHeading
              eyebrow="01 · Foundation"
              title="先分清：词组不是句子"
              description="一个完整英语句子通常需要“主语 + 谓语”。前面可以不断增加信息，但只有核心谓语出现，句子才真正站起来。"
            />
            <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-sm font-black text-slate-950">句子成长阶梯</p>
                <div className="mt-5 space-y-3">
                  {["dog", "a dog", "a cute dog", "a cute dog in the park"].map((item, index) => (
                    <div key={item} className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span>
                      <div className="flex-1 rounded-xl bg-slate-50 px-4 py-3 font-bold text-slate-500">{item}</div>
                      <span className="text-xs font-black text-slate-300">词 / 词组</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-black text-white">5</span>
                    <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-black text-emerald-900">A cute dog is running in the park.</div>
                    <span className="text-xs font-black text-emerald-600">完整句 ✓</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-7">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-300">The verb systems</p>
                    <h3 className="mt-2 text-2xl font-black">三套动词系统</h3>
                  </div>
                  <p className="text-xs text-white/55">先判断系统，再变否定和疑问</p>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {VERB_SYSTEMS.map((system, index) => (
                    <button
                      key={system.id}
                      type="button"
                      onClick={() => setActiveVerbSystemId(system.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        activeVerbSystemId === system.id
                          ? "border-indigo-300 bg-indigo-500/20"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <p className="text-xs font-black text-indigo-300">SYSTEM {index + 1}</p>
                      <p className="mt-1 font-black">{system.name}</p>
                      <p className="mt-2 text-xs leading-5 text-white/55">{system.forms}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-white p-4 text-slate-950">
                  <p className="text-sm font-black text-indigo-700">{activeVerbSystem.name}</p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <p className="rounded-xl bg-emerald-50 p-3"><span className="block text-[11px] font-black text-emerald-600">肯定</span>{activeVerbSystem.positive}</p>
                    <p className="rounded-xl bg-rose-50 p-3"><span className="block text-[11px] font-black text-rose-600">否定</span>{activeVerbSystem.negative}</p>
                    <p className="rounded-xl bg-sky-50 p-3"><span className="block text-[11px] font-black text-sky-600">疑问</span>{activeVerbSystem.question}</p>
                  </div>
                  <p className="mt-3 text-xs font-bold leading-6 text-slate-600">{activeVerbSystem.rule}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="components" className="scroll-mt-32">
            <SectionHeading
              eyebrow="02 · Sentence Parts"
              title="七大句子成分，就是七种工作岗位"
              description="不必先死背术语。用“谁—做什么—对什么—怎么样—何时何地”来追问，句子里的每一块自然会找到自己的位置。"
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SENTENCE_COMPONENTS.map((part, index) => (
                <article key={part.code} className={`rounded-[24px] border p-5 ${COMPONENT_STYLES[index]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 min-w-11 place-items-center rounded-xl bg-white px-2 text-sm font-black text-slate-800 shadow-sm">{part.code}</span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-black text-slate-500">{part.question}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-black text-slate-950">{part.name}</h3>
                  <p className="mt-1 text-xs font-bold text-slate-400">{part.english}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{part.description}</p>
                  <p className="mt-4 rounded-xl bg-white/80 px-3 py-2 text-xs font-bold leading-5 text-slate-700">{part.example}</p>
                </article>
              ))}
              <article className="rounded-[24px] border border-slate-800 bg-slate-950 p-5 text-white sm:col-span-2 lg:col-span-1">
                <p className="text-xs font-black text-indigo-300">学习提示</p>
                <p className="mt-3 text-xl font-black leading-8">先会找，再学术语。</p>
                <p className="mt-3 text-sm leading-7 text-white/65">六年级先用颜色和提问识别；等句子结构稳定后，再逐渐记住 Subject、Object 等名称。</p>
              </article>
            </div>
          </section>

          <section id="patterns" className="scroll-mt-32 rounded-[36px] bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.07)] ring-1 ring-slate-200 sm:p-8 lg:p-10">
            <SectionHeading
              eyebrow="03 · Pattern Lab"
              title="六大核心句型实验室"
              description="点击一种句型，看它如何由不同颜色的句子成分拼出来。掌握这六个骨架，就能读懂和造出大多数简单句。"
            />
            <div className="mt-8 grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {SENTENCE_PATTERNS.map((pattern, index) => (
                  <button
                    key={pattern.id}
                    type="button"
                    onClick={() => setActivePatternId(pattern.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      activePattern.id === pattern.id
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                    }`}
                  >
                    <span className="text-[11px] font-black opacity-55">0{index + 1}</span>
                    <span className="mt-1 block text-sm font-black sm:text-base">{pattern.code}</span>
                    <span className="mt-0.5 block text-xs opacity-70">{pattern.title}</span>
                  </button>
                ))}
              </div>

              <div className="rounded-[28px] bg-slate-50 p-5 ring-1 ring-slate-200 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">{activePattern.code}</p>
                    <h3 className="mt-2 text-2xl font-black text-slate-950">{activePattern.title}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">{activePattern.formula}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakEnglish(activePattern.tokens.map((token) => token.text).join(" "))}
                    className="rounded-full bg-white px-3 py-2 text-xs font-black text-indigo-700 ring-1 ring-indigo-100 transition hover:bg-indigo-600 hover:text-white"
                  >
                    🔊 听例句
                  </button>
                </div>
                <div className="mt-6">
                  <SentenceTokens tokens={activePattern.tokens} />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <p className="text-xs font-black text-slate-400">核心理解</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{activePattern.explanation}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <p className="text-xs font-black text-slate-400">中文意思</p>
                    <p className="mt-2 text-sm font-black leading-7 text-slate-900">{activePattern.exampleZh}</p>
                  </div>
                </div>
                <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900 ring-1 ring-amber-100">💡 {activePattern.tip}</p>
              </div>
            </div>
          </section>

          <section id="transform" className="scroll-mt-32">
            <SectionHeading
              eyebrow="04 · Transform"
              title="句子变形，只看谓语属于哪个系统"
              description="肯定句变否定、疑问，不需要背三套混在一起的公式。先认出 be、普通动词或情态动词，再按对应规则操作。"
            />
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {VERB_SYSTEMS.map((system) => (
                <article key={system.id} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                  <div className="bg-slate-950 px-5 py-4 text-white">
                    <p className="font-black">{system.name}</p>
                    <p className="mt-1 text-xs text-white/55">{system.forms}</p>
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><span className="mr-2 font-black">肯定</span>{system.positive}</div>
                    <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900"><span className="mr-2 font-black">否定</span>{system.negative}</div>
                    <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900"><span className="mr-2 font-black">疑问</span>{system.question}</div>
                    <p className="border-t border-slate-100 pt-3 text-xs font-bold leading-6 text-slate-500">{system.rule}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">✓ He didn&apos;t <span className="underline decoration-2">go</span> home.</div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900">✗ He didn&apos;t <span className="underline decoration-2">went</span> home.</div>
            </div>
          </section>

          <section id="tenses" className="scroll-mt-32">
            <SectionHeading
              eyebrow="05 · Time Map"
              title="六大时态不是六座孤岛，而是一张时间地图"
              description="先看动作发生在现在、过去还是未来，再看它是习惯、正在进行，还是与现在有关联。"
            />
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CORE_TENSES.map((tense, index) => (
                <article key={tense.id} className={`rounded-[26px] border p-5 ${TENSE_STYLES[index]}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black text-slate-500">{tense.stage}</span>
                    <span className="text-xs font-black text-slate-400">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-black text-slate-950">{tense.name}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-600">{tense.meaning}</p>
                  <div className="mt-4 rounded-xl bg-white/75 p-3">
                    <p className="text-[11px] font-black text-slate-400">结构</p>
                    <p className="mt-1 text-sm font-black text-slate-800">{tense.structure}</p>
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-500">信号：{tense.signal}</p>
                  <p className="mt-3 border-t border-black/5 pt-3 text-sm font-black leading-6 text-slate-800">{tense.example}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 rounded-[28px] bg-slate-950 p-5 text-white sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Same action · different time</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["every day", "I play basketball."],
                  ["now", "I am playing basketball."],
                  ["yesterday", "I played basketball."],
                  ["tomorrow", "I will play basketball."],
                ].map(([signal, sentence]) => (
                  <div key={signal} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-xs font-black text-cyan-300">{signal}</p>
                    <p className="mt-2 text-sm font-black leading-6">{sentence}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="growth" className="scroll-mt-32">
            <SectionHeading
              eyebrow="06 · Grow a Sentence"
              title="句子长大工具箱"
              description="先保证骨架正确，再给名词、动作和整句话增加更精确的信息。句子不是越长越好，而是每增加一块都放对位置。"
            />
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {EXPANSION_TOOLS.map((tool, index) => (
                <article key={tool.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-indigo-500">TOOL 0{index + 1}</p>
                      <h3 className="mt-2 text-xl font-black text-slate-950">{tool.name}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">{tool.headline}</p>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-lg">{["🧱", "🔁", "📏", "📍"][index]}</span>
                  </div>
                  <div className="mt-5 space-y-2">
                    {tool.ladder.map((line, lineIndex) => (
                      <div key={line} className="flex items-center gap-3">
                        <span className="text-xs font-black text-indigo-300">{lineIndex + 1}</span>
                        <p className="flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{line}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold leading-5 text-indigo-800">{tool.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="clauses" className="scroll-mt-32 rounded-[36px] bg-gradient-to-br from-slate-950 to-indigo-950 p-5 text-white sm:p-8 lg:p-10">
            <SectionHeading
              eyebrow="07 · Complex Sentences"
              title="从一个信息，走进有逻辑的复杂句"
              description="从句不是更长的词组：它内部有自己的主语和谓语。先找主句，再判断其他句块修饰谁、说明什么逻辑。"
              dark
            />
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {CLAUSE_CARDS.map((clause) => (
                <article key={clause.name} className="rounded-[24px] border border-white/10 bg-white/[0.07] p-5 backdrop-blur">
                  <h3 className="text-lg font-black">{clause.name}</h3>
                  <p className="mt-2 text-xs font-black leading-5 text-cyan-300">{clause.connectors}</p>
                  <p className="mt-3 text-sm leading-6 text-white/65">{clause.logic}</p>
                  <p className="mt-4 rounded-xl bg-white/10 p-3 text-xs font-bold leading-6 text-white/85">{clause.example}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 rounded-[28px] bg-white p-5 text-slate-950 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500">Long sentence lab</p>
                  <h3 className="mt-2 text-xl font-black">长难句拆解示例</h3>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">先主干，后枝叶</span>
              </div>
              <p className="mt-5 rounded-2xl bg-slate-100 p-4 text-sm font-black leading-7 text-slate-800 sm:text-base">
                The book that my teacher recommended is very interesting because it tells us how people lived hundreds of years ago.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["主句", "The book is very interesting.", "border-sky-200 bg-sky-50 text-sky-900"],
                  ["定语从句", "that my teacher recommended → 修饰 the book", "border-violet-200 bg-violet-50 text-violet-900"],
                  ["原因状语从句", "because it tells us ...", "border-emerald-200 bg-emerald-50 text-emerald-900"],
                  ["宾语从句", "how people lived ... → 作 tells 的内容", "border-amber-200 bg-amber-50 text-amber-900"],
                ].map(([label, content, styles]) => (
                  <div key={label} className={`rounded-2xl border p-4 ${styles}`}>
                    <p className="text-xs font-black opacity-65">{label}</p>
                    <p className="mt-1 text-sm font-black leading-6">{content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {ADVANCED_STRUCTURES.map((item) => (
                <article key={item.name} className="rounded-[22px] border border-white/10 bg-white/5 p-5">
                  <h3 className="font-black">{item.name}</h3>
                  <p className="mt-2 text-xs font-black leading-5 text-indigo-300">{item.formula}</p>
                  <p className="mt-3 text-sm font-bold leading-6 text-white/85">{item.example}</p>
                  <p className="mt-3 text-xs leading-5 text-white/55">{item.contrast}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="roadmap" className="scroll-mt-32">
            <SectionHeading
              eyebrow="08 · Roadmap"
              title="六年级到初三：60 个核心点分六阶段长出来"
              description="新知识要挂在旧骨架上。先会造简单句，再掌握时间和变形，最后进入非谓语、从句和长难句。"
            />
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {LEARNING_STAGES.map((stage, index) => (
                <article key={stage.stage} className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="absolute right-0 top-0 grid h-20 w-20 place-items-center rounded-bl-[32px] bg-indigo-50 text-2xl font-black text-indigo-200">{index + 1}</div>
                  <div className="relative pr-16">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">{stage.stage}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{stage.grade}</span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{stage.count} 个点</span>
                    </div>
                    <h3 className="mt-4 text-xl font-black text-slate-950">{stage.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{stage.focus}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
              <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-500">Ability Tree</p>
                    <h3 className="mt-2 text-2xl font-black text-slate-950">12 级句法能力树</h3>
                  </div>
                  <p className="text-xs font-bold text-slate-400">从词到长句和段落</p>
                </div>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {ABILITY_LEVELS.map(([level, name, detail], index) => (
                    <div key={level} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${index < 4 ? "bg-sky-100 text-sky-700" : index < 8 ? "bg-indigo-100 text-indigo-700" : "bg-violet-100 text-violet-700"}`}>
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-black text-slate-900">{name}</p>
                        <p className="mt-0.5 text-[11px] font-bold leading-5 text-slate-500">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] bg-indigo-600 p-5 text-white shadow-xl shadow-indigo-200 sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">1 minute challenge</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">第 {challengeIndex + 1} / {QUICK_CHALLENGES.length} 题</span>
                  <button type="button" onClick={nextChallenge} className="text-xs font-black text-indigo-100 hover:text-white">换一题 →</button>
                </div>
                <p className="mt-5 rounded-2xl bg-white/[0.12] p-4 text-lg font-black leading-8">{challenge.prompt}</p>
                <p className="mt-4 text-sm font-bold leading-6">{challenge.question}</p>
                <div className="mt-4 space-y-2">
                  {challenge.choices.map((choice, index) => {
                    const answered = selectedChoice !== null;
                    const isCorrect = index === challenge.answer;
                    const isSelected = index === selectedChoice;
                    const stateClass = !answered
                      ? "border-white/20 bg-white/10 hover:bg-white/20"
                      : isCorrect
                        ? "border-emerald-300 bg-emerald-400/25"
                        : isSelected
                          ? "border-rose-300 bg-rose-400/25"
                          : "border-white/10 bg-white/5 opacity-55";
                    return (
                      <button
                        key={choice}
                        type="button"
                        disabled={answered}
                        onClick={() => setSelectedChoice(index)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${stateClass}`}
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-black">{String.fromCharCode(65 + index)}</span>
                        {choice}
                      </button>
                    );
                  })}
                </div>
                {selectedChoice !== null && (
                  <div aria-live="polite" className="mt-4 rounded-2xl bg-white p-4 text-slate-900">
                    <p className={`text-sm font-black ${selectedChoice === challenge.answer ? "text-emerald-700" : "text-rose-700"}`}>
                      {selectedChoice === challenge.answer ? "答对了，结构找得很准！" : `正确答案是 ${String.fromCharCode(65 + challenge.answer)}。`}
                    </p>
                    <p className="mt-2 text-xs font-bold leading-6 text-slate-600">{challenge.explanation}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-indigo-100 bg-indigo-50 p-6 text-center sm:p-9">
            <p className="text-sm font-black text-indigo-700">最终目标</p>
            <p className="mx-auto mt-3 max-w-3xl text-2xl font-black leading-10 text-slate-950">
              不是背出“宾语从句”的定义，而是看到一句话时，能理解、能说、能写，也知道为什么这样写。
            </p>
            <p className="mt-4 text-xs font-bold text-slate-500">内容基于《六年级至初中英语核心句子结构与语法知识体系》整理</p>
          </section>
        </div>
      </main>
    </div>
  );
}
