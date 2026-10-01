"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";
import type { NationalDayBlock, NationalDayQuestion, NationalDaySection } from "@/lib/national-day-english";
import { checkNationalDayAnswer } from "@/lib/national-day-english-answer";
import { useNationalDayProgress, type NationalDayAttempt } from "@/lib/national-day-english-progress";

const ACTION = "w-full rounded-2xl border border-orange-200 bg-orange-100 px-5 py-3 text-sm font-bold text-orange-900 transition hover:bg-orange-200 focus-visible:outline-2 focus-visible:outline-orange-400";
const SECONDARY = "w-full rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-50";

function SourceContent({ blocks }: { blocks: NationalDayBlock[] }) {
  const groups: Array<{ title: string; blocks: NationalDayBlock[] }> = [];
  for (const block of blocks) {
    if (block.type === "heading") groups.push({ title: block.text, blocks: [] });
    else {
      if (!groups.length) groups.push({ title: "", blocks: [] });
      groups[groups.length - 1].blocks.push(block);
    }
  }
  return <div className="space-y-5">{groups.filter((group) => group.blocks.length > 0).map((group, index) => (
    <section key={`${group.title}-${index}`} className={`rounded-3xl border p-5 sm:p-6 ${/混淆|辨析|检查/.test(group.title) ? "border-amber-100 bg-amber-50/60" : /例句|故事|Visit|Morning|范例/.test(group.title) ? "border-sky-100 bg-sky-50/50" : "border-stone-200 bg-white"}`}>
      {group.title && <h2 className="mb-4 text-lg font-bold leading-7 text-stone-800">{group.title}</h2>}
      <div className="space-y-4">{group.blocks.map((block, blockIndex) => block.type === "table" ? (
        <div key={blockIndex} className="space-y-3">{block.rows.map((row, rowIndex) => (
          <article key={rowIndex} className="rounded-2xl border border-stone-200 bg-white p-4">
            {row.map((cell, cellIndex) => <div key={cellIndex} className={cellIndex > 0 ? "mt-3 border-t border-stone-100 pt-3" : ""}>
              <p className="text-xs font-semibold text-stone-500">{block.headers[cellIndex]}</p>
              <p className={`mt-1 break-words leading-7 ${cellIndex === 0 ? "text-base font-bold text-sky-800" : "text-sm text-stone-700"}`}>{cell}</p>
            </div>)}
          </article>
        ))}</div>
      ) : <p key={blockIndex} className="break-words text-base leading-8 text-stone-700">{block.text}</p>)}</div>
    </section>
  ))}</div>;
}

function QuestionCard({ question, index, saved, onRecord }: {
  question: NationalDayQuestion;
  index: number;
  saved?: NationalDayAttempt;
  onRecord: (id: string, attempt: NationalDayAttempt) => void;
}) {
  const fieldCount = question.mode === "auto" ? question.accepted.length : 1;
  const [values, setValues] = useState<string[]>(saved?.values.length === fieldCount ? saved.values : Array.from({ length: fieldCount }, () => ""));
  const [revealed, setRevealed] = useState(saved?.checked ?? false);
  const [empty, setEmpty] = useState(false);
  const isSentence = /改|连词|翻译|写一句|用.*表达|连接|Where|When|Why|What|How|Name/.test(question.prompt) || question.accepted.some((parts) => parts.some((part) => part.split(" ").length > 4));
  const submit = (answers = values) => {
    if (answers.some((value) => !value.trim())) { setEmpty(true); return; }
    setEmpty(false);
    setRevealed(true);
    onRecord(question.id, { values: answers, checked: question.mode === "auto", correct: question.mode === "auto" ? checkNationalDayAnswer(answers, question.accepted) : null });
  };
  const saveUnchecked = () => {
    if (!revealed && (saved || values.some((value) => value.trim()))) onRecord(question.id, { values, checked: false, correct: null });
  };
  const rate = (correct: boolean) => {
    setRevealed(true);
    onRecord(question.id, { values, checked: true, correct, selfRated: true });
  };

  return (
    <article id={`question-${question.id}`} className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
      <p className="text-xs font-bold text-orange-700">练习 {index + 1}{saved?.checked ? saved.correct ? " · 已掌握 ✓" : " · 待巩固" : ""}</p>
      <h3 className="mt-3 break-words text-lg font-semibold leading-8 text-stone-800">{question.prompt}</h3>
      {question.options ? (
        <div className="mt-5 space-y-3">{question.options.map((option) => (
          <button key={option} type="button" aria-pressed={values[0] === option} onClick={() => { setValues([option]); submit([option]); }} className={`block w-full rounded-2xl border px-4 py-3 text-left text-base font-semibold transition ${values[0] === option ? "border-orange-300 bg-orange-50 text-orange-900" : "border-stone-200 bg-white text-stone-700 hover:bg-orange-50"}`}>{option === "/" ? "不填冠词" : option}</button>
        ))}</div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="mt-5 space-y-3">
          {values.map((value, fieldIndex) => {
            const label = question.labels?.[fieldIndex] ?? (fieldCount > 1 ? `第 ${fieldIndex + 1} 项答案（按题目顺序）` : question.mode === "self" ? "我的判断与理由" : isSentence ? "我的完整回答" : "我的答案（填空题只写空缺词）");
            const fieldId = `${question.id}-answer-${fieldIndex}`;
            const fieldProps = {
              id: fieldId,
              value,
              autoComplete: "off",
              spellCheck: false,
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const nextValues = values.map((item, position) => position === fieldIndex ? event.target.value : item);
                setValues(nextValues);
                setRevealed(false);
                setEmpty(false);
                if (saved?.checked || (saved && nextValues.every((item) => !item.trim()))) {
                  onRecord(question.id, { values: nextValues, checked: false, correct: null });
                }
              },
              onBlur: saveUnchecked,
              className: "mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base leading-7 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100",
            };
            return <div key={fieldIndex}><label htmlFor={fieldId} className="text-xs font-semibold text-stone-500">{label}</label>{question.mode === "self" || isSentence ? <textarea {...fieldProps} rows={2} placeholder="先自己想一想，再写下来……" /> : <input {...fieldProps} type="text" placeholder="输入答案" />}</div>;
          })}
          {empty && <p role="alert" className="text-sm text-rose-700">先写好每一项答案，再核对。</p>}
          <button type="submit" className={ACTION}>{question.mode === "self" ? "对照参考答案" : "核对答案"}</button>
        </form>
      )}
      {!revealed && <button type="button" onClick={() => { setRevealed(true); setEmpty(false); }} className="mt-4 block text-sm font-semibold text-stone-500 underline decoration-stone-300 underline-offset-4">先看看答案与解析</button>}
      {revealed && (
        <div aria-live="polite" className={`mt-5 rounded-2xl border p-4 ${saved?.checked && saved.correct === true ? "border-emerald-200 bg-emerald-50" : saved?.checked && saved.correct === false ? "border-rose-200 bg-rose-50/60" : "border-sky-200 bg-sky-50/60"}`}>
          <p className="text-sm font-bold text-stone-800">{saved?.checked ? saved.correct ? saved.selfRated ? "已按参考答案自评为掌握 ✓" : "答对了 ✓" : "再检查一下" : "参考答案与解析"}</p>
          <p className="mt-3 break-words text-sm leading-7 text-stone-700">{question.reference}</p>
          {saved?.checked && saved.correct === false && question.mode === "auto" && <p className="mt-3 text-xs leading-6 text-stone-500">当前回答尚未匹配参考答案。根据解析修改后，可以再次核对。</p>}
          {question.mode === "self" && <div className="mt-4 space-y-3"><p className="text-xs leading-6 text-stone-500">对照意思和理由判断，不要求每个字都与参考答案相同。</p><button type="button" onClick={() => rate(true)} className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-800">意思和理由都对，我掌握了</button><button type="button" onClick={() => rate(false)} className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-800">还要再想一想，加入待巩固</button></div>}
          {question.mode === "auto" && isSentence && saved?.checked && saved.correct === false && <button type="button" onClick={() => rate(true)} className="mt-4 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-semibold leading-6 text-stone-600">我的表达不同，但意思正确（对照解析自评）</button>}
        </div>
      )}
    </article>
  );
}

function WritingPractice({ section, draft: initialDraft, checks, onSave, onCheck }: {
  section: NationalDaySection;
  draft: string;
  checks: string[];
  onSave: (value: string) => void;
  onCheck: (label: string) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [saved, setSaved] = useState(false);
  const writing = section.writing!;
  const words = draft.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  const save = () => { onSave(draft); setSaved(true); };
  return <section className="rounded-3xl border border-sky-200 bg-sky-50/50 p-5 sm:p-6">
    <h2 className="text-xl font-bold">{writing.label}</h2>
    <p className="mt-3 text-sm leading-7 text-stone-600">{writing.prompt}</p>
    <label htmlFor="national-day-writing" className="mt-5 block text-xs font-semibold text-stone-500">写下自己的真实表达</label>
    <textarea id="national-day-writing" value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} onBlur={save} rows={8} className="mt-2 w-full resize-y rounded-2xl border border-sky-200 bg-white p-4 text-base leading-8 text-stone-800 outline-none focus:ring-2 focus:ring-sky-100" placeholder="从一句完整的英文开始……" />
    <p className="mt-2 text-xs text-stone-500">{words} 个英文词{writing.minWords > 0 ? ` · 建议 ${writing.minWords}–80 词` : ""}{saved ? " · 草稿已保存" : ""}</p>
    <button type="button" onClick={save} className={`${SECONDARY} mt-4`}>保存我的草稿</button>
    <fieldset className="mt-5 rounded-2xl bg-white p-4"><legend className="px-1 text-sm font-bold text-sky-800">写完后，自己检查一遍</legend>{["信息说清：时间、地点、活动和感受", "动词正确：be、时态、主谓一致", "词组正确：介词、搭配、单复数", "句子完整：顺序、大小写和标点"].map((label) => <label key={label} className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" checked={checks.includes(label)} onChange={() => onCheck(label)} className="mt-1 h-4 w-4 shrink-0 accent-orange-400" /><span>{label}</span></label>)}</fieldset>
    {writing.referenceBlocks && <details className="mt-5"><summary className="cursor-pointer text-sm font-bold text-sky-800">写完后查看参考范例与检查方法 ↓</summary><p className="mt-3 text-xs leading-6 text-stone-500">范例只是其中一种写法，请保留自己的真实经历。</p><div className="mt-4"><SourceContent blocks={writing.referenceBlocks} /></div></details>}
  </section>;
}

export default function NationalDayEnglishLesson({ subjectId, section, previous, next, pdfUrl }: {
  subjectId: string;
  section: NationalDaySection;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  pdfUrl: string;
}) {
  const { progress, ready, recordAttempt, saveDraft, toggleWritingCheck, completeSection } = useNationalDayProgress(subjectId, section.id);
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [reviewQuestionIds, setReviewQuestionIds] = useState<string[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioMessage, setAudioMessage] = useState("");
  const base = `/subjects/${subjectId}/national-day-english`;
  const questions = [...section.questions, ...(section.oralQuestions ?? [])];
  const checked = questions.filter((question) => progress.attempts[question.id]?.checked).length;
  const correct = questions.filter((question) => progress.attempts[question.id]?.checked && progress.attempts[question.id]?.correct).length;
  const wrong = questions.filter((question) => progress.attempts[question.id]?.checked && progress.attempts[question.id]?.correct === false).length;
  const visibleQuestions = questions.filter((question) => !onlyMistakes ||
    (progress.attempts[question.id]?.correct !== true && reviewQuestionIds.includes(question.id)));
  const completed = progress.completedSections.includes(section.id);
  const speak = () => {
    if (!("speechSynthesis" in window) || !section.audioText) { setAudioMessage("当前浏览器不支持朗读，可以展开文本完成阅读练习。"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(section.audioText);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
    setAudioMessage("浏览器朗读中；可再听一遍，或展开文本核对。");
  };
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  return <main className="min-h-screen bg-white text-stone-800">
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-7 sm:px-6">
      <Link href={base} className="inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-500 hover:text-orange-700">← 国庆英语目录</Link>
      <header className="mt-6 rounded-3xl border border-orange-100 bg-orange-50/50 p-6 sm:p-8">
        <p className="text-xs font-bold text-orange-700">🍁 国庆英语 · {section.category === "lesson" ? "语法讲解" : section.category === "practice" ? "综合运用" : "随手速查"}</p>
        <h1 className="mt-4 break-words text-2xl font-black leading-tight sm:text-3xl">{section.title}</h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">{questions.length > 0 ? "先读懂，再自己作答；核对时一起看理由。" : "按自己的节奏读，遇到不熟悉的表达就停下来练一练。"}</p>
        <a href={`${pdfUrl}#page=${section.page}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-orange-700 underline decoration-orange-200 underline-offset-4">对照原 PDF 第 {section.page} 页 ↗</a>
        {questions.length > 0 && <a href="#national-day-exercises" className={`${SECONDARY} mt-5 block text-center`}>进入本节练习 ↓</a>}
      </header>
      <div className="mt-6"><SourceContent blocks={section.blocks} /></div>
      {section.audioText && <section className="mt-6 rounded-3xl border border-sky-200 bg-sky-50/50 p-5 sm:p-6"><h2 className="text-xl font-bold">先听，再回答</h2><p className="mt-3 text-sm leading-7 text-stone-600">可以使用浏览器朗读听两遍：第一遍听大意，第二遍记细节。这是辅助朗读。</p><button type="button" onClick={speak} className={`${SECONDARY} mt-4`}>▶ 朗读 Sunday Morning</button><button type="button" onClick={() => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); setAudioMessage("朗读已停止。"); }} className="mt-3 block text-sm font-semibold text-stone-500">停止朗读</button>{audioMessage && <p aria-live="polite" className="mt-3 text-xs leading-6 text-stone-500">{audioMessage}</p>}<button type="button" aria-expanded={showTranscript} onClick={() => setShowTranscript(!showTranscript)} className={`${SECONDARY} mt-4`}>{showTranscript ? "收起听读文本 ↑" : "完成听读后，展开文本核对 ↓"}</button>{showTranscript && section.listeningBlocks && <div className="mt-4"><SourceContent blocks={section.listeningBlocks} /></div>}</section>}

      {questions.length > 0 && <section id="national-day-exercises" className="mt-8 scroll-mt-6">
        <h2 className="text-2xl font-bold">自己试一试</h2>
        <p className="mt-3 text-sm leading-7 text-stone-500">选项点击即反馈；填空、改写和阅读题写好后核对。解释题与真实表达对照参考答案自评。</p>
        <div className="mt-4 rounded-2xl border border-stone-200 p-4"><p className="text-sm font-semibold">已核对 {ready ? checked : "--"} / {questions.length} 题 · 已掌握 {ready ? correct : "--"} 题</p><label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={onlyMistakes} onChange={(event) => {
          setOnlyMistakes(event.target.checked);
          setReviewQuestionIds(event.target.checked ? questions.filter((question) => progress.attempts[question.id]?.checked && progress.attempts[question.id]?.correct === false).map((question) => question.id) : []);
        }} className="h-4 w-4 accent-orange-400" />只看待巩固 · {wrong} 题</label></div>
        {!ready ? <p className="mt-6 text-sm text-stone-500">正在读取学习进度……</p> : <div className="mt-5 space-y-5">{visibleQuestions.map((question) => <QuestionCard key={question.id} question={question} index={questions.indexOf(question)} saved={progress.attempts[question.id]} onRecord={recordAttempt} />)}{onlyMistakes && visibleQuestions.length === 0 && <p className="rounded-2xl bg-emerald-50 p-5 text-sm leading-7 text-emerald-800">本页暂时没有待巩固题目。取消筛选即可查看全部题目。</p>}</div>}
      </section>}

      {section.writing && ready && <div className="mt-8"><WritingPractice section={section} draft={progress.drafts[section.id] ?? ""} checks={progress.writingChecks[section.id] ?? []} onSave={(value) => saveDraft(section.id, value)} onCheck={(label) => toggleWritingCheck(section.id, label)} /></div>}
      <section className="mt-8 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5 sm:p-6">
        <h2 className="text-xl font-bold">{completed ? "本节已学完 ✓" : "给今天的学习打个勾"}</h2>
        <p className="mt-3 text-sm leading-7 text-stone-600">{questions.length > 0 && checked < questions.length ? `还剩 ${questions.length - checked} 题未核对。看完答案后，也要说清为什么。` : "把不确定的地方留在待巩固里，下次再练一遍。"}</p>
        {!completed && <button type="button" disabled={!ready || checked < questions.length} onClick={() => completeSection(section.id)} className="mt-4 w-full rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-bold text-emerald-800 transition enabled:hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">本节学完了，保存进度</button>}
      </section>
      <nav aria-label="章节导航" className="mt-6 space-y-3">
        {next && <Link href={`${base}/${next.id}`} className={`${ACTION} block text-center`}>下一节：{next.title} →</Link>}
        {previous && <Link href={`${base}/${previous.id}`} className={`${SECONDARY} block text-center`}>← 上一节：{previous.title}</Link>}
        <Link href={base} className={`${SECONDARY} block text-center`}>返回国庆英语目录</Link>
      </nav>
    </div>
  </main>;
}
