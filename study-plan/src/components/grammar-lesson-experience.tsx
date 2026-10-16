"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GrammarLesson } from "@/lib/grammar-course";
import { useEnglishLocked } from "@/lib/use-english-locked";
import EnglishLockedTask from "@/components/english-locked-task";
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
  const locked = useEnglishLocked("grammar-course", subjectId);
  const [progress, setProgress] = useState<GrammarCourseProgress>(EMPTY_GRAMMAR_COURSE_PROGRESS);
  const [progressReady, setProgressReady] = useState(false);
  const [activeTask, setActiveTask] = useState(0);
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
  const answeredSet = useMemo(() => new Set([...practice.answered, ...lesson.tasks.map((_, index) => index).filter(index => locked.records[`lesson:${lesson.n}:task:${index}`])]), [practice.answered, lesson.tasks, lesson.n, locked.records]);
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
    <main className="min-h-screen bg-white text-slate-900">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl space-y-2 px-4 py-3 sm:px-7">
          <Link href={`/subjects/${subjectId}/grammar`} className="text-sm font-black text-slate-500 transition hover:text-violet-700">← 课程地图</Link>
          <span className="block w-fit rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-500 ring-1 ring-slate-200">第 {lesson.n} / 72 课</span>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-7 sm:px-7">
        <header className="overflow-hidden rounded-[36px] border border-cyan-100 bg-cyan-50/60 text-slate-900 shadow-[0_16px_48px_rgba(15,23,42,0.06)]">
          <div className="p-6 sm:p-9">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-cyan-700 ring-1 ring-cyan-200">阶段 {String(lesson.stage).padStart(2, "0")} · {stageTitle}</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">{lesson.level}</span>
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-violet-700">Lesson {String(lesson.n).padStart(2, "0")}</p>
              <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight sm:text-5xl">{lesson.title}</h1>
              <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-slate-600">{lesson.goal}</p>
            </div>
            <div className="mt-8 rounded-[28px] bg-white p-5 ring-1 ring-cyan-100">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">本课路线</p>
              <div className="mt-4 space-y-3 text-sm font-bold">
                {[["01", "理解核心规则"], ["02", "观察3个例句"], ["03", "诊断易错表达"], ["04", "完成10项训练"]].map(([number, text]) => (
                  <div key={number} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-[10px] text-cyan-700">{number}</span><span className="text-slate-700">{text}</span></div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="mt-8 space-y-8">
          <div className="space-y-8">
            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">01 · Core rules</p>
                <h2 className="mt-2 text-2xl font-black">先把判断顺序理清楚</h2>
                <p className="mt-3 text-xs font-black text-cyan-700">共 {lesson.rules.length} 条核心规则</p>
              </div>
              <div className="mt-6 space-y-3">
                {lesson.rules.map((rule, index) => (
                  <div key={rule} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-100 text-xs font-black text-cyan-800">{String(index + 1).padStart(2, "0")}</span>
                    <p className="mt-4 text-sm font-semibold leading-7 text-slate-700">{rule}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-violet-100 bg-violet-50/70 p-5 text-slate-900 sm:p-8">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">02 · Observe</p><h2 className="mt-2 text-2xl font-black">用例句把规则看见</h2></div>
              <div className="mt-6 grid gap-3">
                {lesson.examples.map(([english, note], index) => (
                  <article key={english} className="rounded-2xl bg-white p-5 ring-1 ring-violet-100">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Example {index + 1}</p><p className="mt-2 text-xl font-black leading-8">{english}</p></div>
                    <button type="button" onClick={() => speakEnglish(english)} className="mt-4 rounded-full bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100" aria-label={`朗读例句 ${index + 1}`}>▶ 朗读例句</button>
                    <p className="mt-4 border-t border-violet-100 pt-4 text-sm font-semibold leading-7 text-slate-600">{note}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-rose-200 bg-rose-50/70 p-5 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">03 · Error clinic</p>
              <h2 className="mt-2 text-2xl font-black">把最容易踩的坑一次看清</h2>
              {pitfallParts.length > 1 ? (
                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl bg-white p-5 ring-1 ring-rose-200"><p className="text-xs font-black text-rose-500">错误表达</p><p className="mt-2 text-base font-black leading-7 text-rose-900">{pitfallParts[0].trim()}</p></div>
                  <span className="block text-center text-2xl font-black text-rose-300">↓</span>
                  <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200"><p className="text-xs font-black text-emerald-600">正确判断</p><p className="mt-2 text-base font-black leading-7 text-emerald-900">{pitfallParts.slice(1).join("→").trim()}</p></div>
                </div>
              ) : <p className="mt-5 rounded-2xl bg-white p-5 text-sm font-bold leading-7 text-rose-900 ring-1 ring-rose-200">{lesson.pitfall}</p>}
            </section>

            <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
              <div className="border-b border-cyan-100 bg-cyan-50 p-5 text-slate-900 sm:p-7">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">04 · Transfer lab</p>
                  <h2 className="mt-2 text-2xl font-black">10项迁移训练</h2>
                  <p className="mt-2 text-sm font-medium text-slate-600">先写下答案与理由，再提交。首次作答永久锁定。</p>
                  <p className="mt-4 text-sm font-black text-cyan-700">已检查 {answeredSet.size} / {lesson.tasks.length}</p>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${taskPercent}%` }} /></div>
              </div>
              <div className="p-5 sm:p-7">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {lesson.tasks.map((_, index) => (
                    <button key={index} type="button" onClick={() => setActiveTask(index)} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-black transition ${index === activeTask ? "bg-violet-100 text-violet-800 ring-1 ring-violet-200" : masteredSet.has(index) ? "bg-emerald-100 text-emerald-800" : answeredSet.has(index) ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-700"}`}>{masteredSet.has(index) ? "✓" : index + 1}</button>
                  ))}
                </div>
                <div className="mt-5 rounded-[26px] border border-violet-100 bg-violet-50/50 p-5 sm:p-7">
                  <div><span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700 ring-1 ring-violet-100">任务 {activeTask + 1}</span><p className="mt-3 text-xs font-bold text-slate-400">先想，再核对</p></div>
                  <p className="mt-6 whitespace-pre-line text-lg font-black leading-8 text-slate-900">{task.prompt}</p>
                  <div className="mt-5"><EnglishLockedTask key={`lesson:${lesson.n}:task:${activeTask}`} id={`lesson:${lesson.n}:task:${activeTask}`} prompt={task.prompt} hidePrompt locked={locked} /></div>
                </div>
              </div>
            </section>

            {lesson.deepPractice.length > 0 && (
              <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-5 sm:p-8">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Bonus · High load</p><h2 className="mt-2 text-2xl font-black">本课属于高负荷难点，加练3题</h2><span className="mt-3 block text-3xl">🔥</span></div>
                <div className="mt-5 space-y-3">{lesson.deepPractice.map((item, index) => <article key={item.prompt} className="rounded-2xl bg-white p-4 ring-1 ring-amber-200"><EnglishLockedTask id={`lesson:${lesson.n}:deep:${index}`} prompt={`${index + 1}. ${item.prompt}`} locked={locked} /></article>)}</div>
              </section>
            )}

            <section className={`rounded-[34px] border p-6 text-center text-slate-900 sm:p-9 ${isComplete || completedNow ? "border-emerald-200 bg-emerald-50" : "border-cyan-200 bg-cyan-50"}`}>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Lesson checkpoint</p>
              <h2 className="mt-3 text-3xl font-black">{isComplete || completedNow ? "本课已点亮" : "完成本课，点亮课程地图"}</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-slate-600">已检查 {answeredSet.size}/10 项。新作答永久锁定，开放题保留待教师评价；历史自评不算客观成绩。</p>
              {!isComplete && !completedNow && <button type="button" disabled={!locked.ready || answeredSet.size < lesson.tasks.length} onClick={completeLesson} className="mt-6 rounded-2xl bg-white px-7 py-3.5 text-sm font-black text-cyan-800 ring-1 ring-cyan-200 transition hover:bg-cyan-100 disabled:opacity-50">完成并保存本课</button>}
              {(isComplete || completedNow) && nextLesson && <Link href={`/subjects/${subjectId}/grammar/lesson/${nextLesson.n}`} className="mt-6 inline-flex rounded-2xl bg-white px-7 py-3.5 text-sm font-black text-emerald-700 ring-1 ring-emerald-200 transition hover:-translate-y-0.5">进入第 {nextLesson.n} 课 →</Link>}
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">学习状态</p>
              <div className="mt-4 space-y-2 text-center">
                <div className="rounded-2xl bg-cyan-50 p-3"><p className="text-xl font-black text-cyan-700">{progressReady ? answeredSet.size : "--"}</p><p className="mt-1 text-[10px] font-black text-cyan-700/60">已检查</p></div>
                <div className="rounded-2xl bg-emerald-50 p-3"><p className="text-xl font-black text-emerald-700">{progressReady ? masteredSet.size : "--"}</p><p className="mt-1 text-[10px] font-black text-emerald-700/60">已掌握</p></div>
              </div>
              <p className="mt-4 text-xs font-semibold leading-6 text-slate-400">进度会同步至 PostgreSQL，换设备登录后可继续学习。</p>
            </div>
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">原书主题索引</p>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-600">{lesson.sourceRefs}</p>
              <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-400">用于主题追溯，不代表复制原书内容。</p>
            </div>
            <div className="grid gap-2">
              {previousLesson ? <Link href={`/subjects/${subjectId}/grammar/lesson/${previousLesson.n}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-600 transition hover:border-violet-200 hover:text-violet-700"><span className="block text-[10px] text-slate-400">上一课 · {previousLesson.n}</span><span className="mt-1 block">← {previousLesson.title}</span></Link> : null}
              {nextLesson ? <Link href={`/subjects/${subjectId}/grammar/lesson/${nextLesson.n}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-right text-sm font-black text-slate-600 transition hover:border-violet-200 hover:text-violet-700"><span className="block text-[10px] text-slate-400">下一课 · {nextLesson.n}</span><span className="mt-1 block">{nextLesson.title} →</span></Link> : <Link href={`/subjects/${subjectId}/grammar/stage/12`} className="rounded-2xl bg-violet-50 p-4 text-center text-sm font-black text-violet-700 ring-1 ring-violet-200">进入最终阶段测评 →</Link>}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
