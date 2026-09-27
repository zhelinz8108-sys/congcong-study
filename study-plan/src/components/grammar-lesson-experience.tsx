"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GrammarLesson } from "@/lib/grammar-course";
import {
  EMPTY_GRAMMAR_COURSE_PROGRESS,
  loadGrammarCourseProgress,
  saveGrammarCourseProgress,
  type GrammarCourseProgress,
} from "@/lib/grammar-course-progress";

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}
export default function GrammarLessonExperience({
  subjectId,
  lesson,
  stageTitle,
  previousLesson,
  nextLesson,
}: {
  subjectId: string;
  lesson: GrammarLesson;
  stageTitle: string;
  previousLesson: { n: number; title: string } | null;
  nextLesson: { n: number; title: string } | null;
}) {
  const [progress, setProgress] = useState<GrammarCourseProgress>(EMPTY_GRAMMAR_COURSE_PROGRESS);
  const [progressReady, setProgressReady] = useState(false);
  const [activeTask, setActiveTask] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completedNow, setCompletedNow] = useState(false);

  useEffect(() => {
    let active = true;
    void loadGrammarCourseProgress().then((value) => {
      if (!active) return;
      setProgress(value);
      setProgressReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const lessonKey = String(lesson.n);
  const practice = progress.lessonPractice[lessonKey] ?? { answered: [], mastered: [] };
  const answeredSet = useMemo(() => new Set(practice.answered), [practice.answered]);
  const masteredSet = useMemo(() => new Set(practice.mastered), [practice.mastered]);
  const isComplete = progress.completedLessons.includes(lesson.n);
  const task = lesson.tasks[activeTask];
  const taskPercent = Math.round((answeredSet.size / lesson.tasks.length) * 100);
  const pitfallParts = lesson.pitfall.replace(/^错误：/, "").split("→");

  const saveWith = (update: (current: GrammarCourseProgress) => GrammarCourseProgress) => {
    setProgress((current) => {
      const next = update(current);
      saveGrammarCourseProgress(next);
      return next;
    });
  };

  const rateTask = (mastered: boolean) => {
    saveWith((current) => {
      const oldPractice = current.lessonPractice[lessonKey] ?? { answered: [], mastered: [] };
      const masteredItems = new Set(oldPractice.mastered);
      if (mastered) masteredItems.add(activeTask);
      else masteredItems.delete(activeTask);
      return {
        ...current,
        lessonPractice: {
          ...current.lessonPractice,
          [lessonKey]: {
            answered: uniqueSorted([...oldPractice.answered, activeTask]),
            mastered: uniqueSorted([...masteredItems]),
          },
        },
        lastLesson: lesson.n,
        updatedAt: new Date().toISOString(),
      };
    });
    if (activeTask < lesson.tasks.length - 1) {
      setActiveTask((value) => value + 1);
      setRevealed(false);
    }
  };

  const completeLesson = () => {
    saveWith((current) => ({
      ...current,
      completedLessons: uniqueSorted([...current.completedLessons, lesson.n]),
      lastLesson: nextLesson?.n ?? lesson.n,
      updatedAt: new Date().toISOString(),
    }));
    setCompletedNow(true);
  };

  return (
    <main className="min-h-screen bg-[#0b0a12] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0a12]/90 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl space-y-2 px-4 py-3 sm:px-7">
          <Link href={`/subjects/${subjectId}/grammar`} className="text-sm font-black text-white/45 transition hover:text-cyan-200">← 课程地图</Link>
          <span className="block w-fit rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-black text-white/45 ring-1 ring-white/10">第 {lesson.n} / 72 课</span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-7 sm:px-7">
        <header className="overflow-hidden rounded-[36px] bg-[#17142a] text-white shadow-[0_24px_70px_rgba(31,25,70,0.18)]">
          <div className="p-6 sm:p-9">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-cyan-400/15 px-3 py-1 text-xs font-black text-cyan-200">阶段 {String(lesson.stage).padStart(2, "0")} · {stageTitle}</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/60">{lesson.level}</span>
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-violet-300">Lesson {String(lesson.n).padStart(2, "0")}</p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight sm:text-5xl">{lesson.title}</h1>
              <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-white/65">{lesson.goal}</p>
            </div>
            <div className="mt-8 rounded-[28px] bg-white/[0.07] p-5 ring-1 ring-white/10">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">本课路线</p>
              <div className="mt-4 space-y-3 text-sm font-bold">
                {[["01", "理解核心规则"], ["02", "观察3个例句"], ["03", "诊断易错表达"], ["04", "完成10项训练"]].map(([number, text]) => (
                  <div key={number} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-[10px] text-cyan-200">{number}</span><span className="text-white/70">{text}</span></div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="mt-8 space-y-8">
          <div className="space-y-8">
            <section className="rounded-[32px] border border-white/10 bg-[#171521] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">01 · Core rules</p>
                <h2 className="mt-2 text-2xl font-black text-white">先把判断顺序理清楚</h2>
                <p className="mt-3 text-xs font-black text-cyan-700">共 {lesson.rules.length} 条核心规则</p>
              </div>
              <div className="mt-6 space-y-3">
                {lesson.rules.map((rule, index) => (
                  <div key={rule} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500 text-xs font-black text-white">{String(index + 1).padStart(2, "0")}</span>
                    <p className="mt-4 text-sm font-semibold leading-7 text-white/70">{rule}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-violet-300/15 bg-[#17142a] p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-8">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">02 · Observe</p><h2 className="mt-2 text-2xl font-black">用例句把规则看见</h2></div>
              <div className="mt-6 grid gap-3">
                {lesson.examples.map(([english, note], index) => (
                  <article key={english} className="rounded-2xl bg-white/[0.05] p-5 ring-1 ring-white/10">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">Example {index + 1}</p><p className="mt-2 text-xl font-black leading-8">{english}</p></div>
                    <button type="button" onClick={() => speakEnglish(english)} className="mt-4 rounded-full bg-white/15 px-4 py-2 text-xs font-black transition hover:bg-white/25" aria-label={`朗读例句 ${index + 1}`}>▶ 朗读例句</button>
                    <p className="mt-4 border-t border-white/15 pt-4 text-sm font-semibold leading-7 text-white/70">{note}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-rose-300/15 bg-rose-950/15 p-5 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-300">03 · Error clinic</p>
              <h2 className="mt-2 text-2xl font-black text-white">把最容易踩的坑一次看清</h2>
              {pitfallParts.length > 1 ? (
                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl bg-rose-400/[0.08] p-5 ring-1 ring-rose-300/15"><p className="text-xs font-black text-rose-300">错误表达</p><p className="mt-2 text-base font-black leading-7 text-rose-100">{pitfallParts[0].trim()}</p></div>
                  <span className="block text-center text-2xl font-black text-rose-300/50">↓</span>
                  <div className="rounded-2xl bg-emerald-400/[0.08] p-5 ring-1 ring-emerald-300/15"><p className="text-xs font-black text-emerald-300">正确判断</p><p className="mt-2 text-base font-black leading-7 text-emerald-100">{pitfallParts.slice(1).join("→").trim()}</p></div>
                </div>
              ) : <p className="mt-5 rounded-2xl bg-rose-400/[0.08] p-5 text-sm font-bold leading-7 text-rose-100 ring-1 ring-rose-300/15">{lesson.pitfall}</p>}
            </section>

            <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[#171521] shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="bg-[#17142a] p-5 text-white sm:p-7">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">04 · Transfer lab</p>
                  <h2 className="mt-2 text-2xl font-black">10项迁移训练</h2>
                  <p className="mt-2 text-sm font-medium text-white/50">先独立判断，再展开答案。根据真实掌握情况记录反馈。</p>
                  <p className="mt-4 text-sm font-black text-cyan-200">已检查 {answeredSet.size} / {lesson.tasks.length}</p>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${taskPercent}%` }} /></div>
              </div>
              <div className="p-5 sm:p-7">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {lesson.tasks.map((_, index) => (
                    <button key={index} type="button" onClick={() => { setActiveTask(index); setRevealed(false); }} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-black transition ${index === activeTask ? "bg-violet-500 text-white shadow-md" : masteredSet.has(index) ? "bg-emerald-500 text-white" : answeredSet.has(index) ? "bg-amber-400/20 text-amber-200" : "bg-white/[0.06] text-white/35 hover:bg-violet-400/15 hover:text-violet-200"}`}>{masteredSet.has(index) ? "✓" : index + 1}</button>
                  ))}
                </div>
                <div className="mt-5 rounded-[26px] border border-violet-300/15 bg-violet-400/[0.06] p-5 sm:p-7">
                  <div><span className="inline-flex rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-violet-200 ring-1 ring-white/10">任务 {activeTask + 1}</span><p className="mt-3 text-xs font-bold text-white/30">先想，再核对</p></div>
                  <p className="mt-6 whitespace-pre-line text-lg font-black leading-8 text-white">{task.prompt}</p>
                  {!revealed ? (
                    <button type="button" onClick={() => setRevealed(true)} className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white transition hover:bg-violet-700">显示答案与判断依据</button>
                  ) : (
                    <div aria-live="polite" className="mt-6">
                      <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.07] p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">参考答案</p><p className="mt-3 text-sm font-bold leading-7 text-white/70">{task.answer}</p></div>
                      <p className="mt-4 text-center text-xs font-bold text-white/30">你的判断和理由都对吗？</p>
                      <div className="mt-3 space-y-3">
                        <button type="button" onClick={() => rateTask(false)} className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-400/15">还不稳，稍后再练</button>
                        <button type="button" onClick={() => rateTask(true)} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700">判断正确，我掌握了</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {lesson.deepPractice.length > 0 && (
              <section className="rounded-[32px] border border-amber-300/15 bg-amber-950/15 p-5 sm:p-8">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Bonus · High load</p><h2 className="mt-2 text-2xl font-black text-white">本课属于高负荷难点，加练3题</h2><span className="mt-3 block text-3xl">🔥</span></div>
                <div className="mt-5 space-y-3">{lesson.deepPractice.map((item, index) => <details key={item.prompt} className="group rounded-2xl bg-white/[0.05] p-4 ring-1 ring-amber-300/15"><summary className="cursor-pointer list-none text-sm font-black leading-7 text-white/80">{index + 1}. {item.prompt}<span className="float-right text-amber-300 group-open:rotate-45">＋</span></summary><p className="mt-3 border-t border-white/10 pt-3 text-sm font-semibold leading-7 text-white/55">{item.answer}</p></details>)}</div>
              </section>
            )}

            <section className={`rounded-[34px] p-6 text-center sm:p-9 ${isComplete || completedNow ? "bg-emerald-600 text-white" : "bg-[#17142a] text-white"}`}>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Lesson checkpoint</p>
              <h2 className="mt-3 text-3xl font-black">{isComplete || completedNow ? "本课已点亮" : "完成本课，点亮课程地图"}</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-white/65">已检查 {answeredSet.size}/10 项，其中 {masteredSet.size} 项标记为掌握。未掌握的任务会保留为黄色，随时可以回来重练。</p>
              {!isComplete && !completedNow && <button type="button" onClick={completeLesson} className="mt-6 rounded-2xl bg-cyan-300 px-7 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-200">完成并保存本课</button>}
              {(isComplete || completedNow) && nextLesson && <Link href={`/subjects/${subjectId}/grammar/lesson/${nextLesson.n}`} className="mt-6 inline-flex rounded-2xl bg-white/10 px-7 py-3.5 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15">进入第 {nextLesson.n} 课 →</Link>}
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[26px] border border-white/10 bg-[#171521] p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">学习状态</p>
              <div className="mt-4 space-y-2 text-center">
                <div className="rounded-2xl bg-cyan-400/10 p-3"><p className="text-xl font-black text-cyan-300">{progressReady ? answeredSet.size : "--"}</p><p className="mt-1 text-[10px] font-black text-cyan-200/50">已检查</p></div>
                <div className="rounded-2xl bg-emerald-400/10 p-3"><p className="text-xl font-black text-emerald-300">{progressReady ? masteredSet.size : "--"}</p><p className="mt-1 text-[10px] font-black text-emerald-200/50">已掌握</p></div>
              </div>
              <p className="mt-4 text-xs font-semibold leading-6 text-white/30">进度会同步至 PostgreSQL，换设备登录后可继续学习。</p>
            </div>
            <div className="rounded-[26px] border border-white/10 bg-[#171521] p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">原书主题索引</p>
              <p className="mt-3 text-sm font-bold leading-7 text-white/65">{lesson.sourceRefs}</p>
              <p className="mt-2 text-[11px] font-semibold leading-5 text-white/30">用于主题追溯，不代表复制原书内容。</p>
            </div>
            <div className="grid gap-2">
              {previousLesson ? <Link href={`/subjects/${subjectId}/grammar/lesson/${previousLesson.n}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-black text-white/60 transition hover:border-violet-300/30 hover:text-white"><span className="block text-[10px] text-white/30">上一课 · {previousLesson.n}</span><span className="mt-1 block">← {previousLesson.title}</span></Link> : null}
              {nextLesson ? <Link href={`/subjects/${subjectId}/grammar/lesson/${nextLesson.n}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-right text-sm font-black text-white/60 transition hover:border-violet-300/30 hover:text-white"><span className="block text-[10px] text-white/30">下一课 · {nextLesson.n}</span><span className="mt-1 block">{nextLesson.title} →</span></Link> : <Link href={`/subjects/${subjectId}/grammar/stage/12`} className="rounded-2xl bg-violet-600 p-4 text-center text-sm font-black text-white">进入最终阶段测评 →</Link>}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
