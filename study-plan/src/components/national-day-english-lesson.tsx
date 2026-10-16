"use client";

import { memo, useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { NationalDayBlock, NationalDayQuestion, NationalDaySection } from "@/lib/national-day-english";
import type { useNationalDayProgress, NationalDayAttempt } from "@/lib/national-day-english-progress";
import type { useEnglishLocked } from "@/lib/use-english-locked";

const ACTION = "w-full rounded-2xl border border-orange-200 bg-orange-100 px-5 py-3 text-sm font-bold text-orange-900 transition hover:bg-orange-200 focus-visible:outline-2 focus-visible:outline-orange-400";
const SECONDARY = "w-full rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-600 transition hover:bg-stone-50";

const SourceContent = memo(function SourceContent({ blocks }: { blocks: NationalDayBlock[] }) {
  const groups: Array<{ title: string; blocks: NationalDayBlock[] }> = [];
  for (const block of blocks) {
    if (block.type === "heading") groups.push({ title: block.text, blocks: [] });
    else {
      if (!groups.length) groups.push({ title: "", blocks: [] });
      groups[groups.length - 1].blocks.push(block);
    }
  }
  return <div className="space-y-5">{groups.map((group, index) => (
    <section key={`${group.title}-${index}`} className={`rounded-3xl border p-5 sm:p-6 ${/混淆|辨析|检查/.test(group.title) ? "border-amber-100 bg-amber-50/60" : /例句|故事|Visit|Morning|范例/.test(group.title) ? "border-sky-100 bg-sky-50/50" : "border-stone-200 bg-white"}`}>
      {group.title && <h3 className="mb-4 text-lg font-bold leading-7 text-stone-800">{group.title}</h3>}
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
});

const QuestionCard = memo(function QuestionCard({ question, index, saved, onRecord, locked }: {
  question: NationalDayQuestion;
  index: number;
  saved?: NationalDayAttempt;
  onRecord: (id: string, attempt: NationalDayAttempt) => void;
  locked: ReturnType<typeof useEnglishLocked>;
}) {
  const fieldCount = question.mode === "auto" ? question.accepted.length : 1;
  const [values, setValues] = useState<string[]>(saved?.values.length === fieldCount ? saved.values : Array.from({ length: fieldCount }, () => ""));
  const [revealed, setRevealed] = useState(saved?.checked ?? false);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const record = locked.records[question.id];
  const isLocked = !!record;
  useEffect(() => { if (record && Array.isArray(record.response)) { setValues(record.response); setRevealed(true); } }, [record]);
  const isSentence = /改|连词|翻译|写一句|用.*表达|连接|Where|When|Why|What|How|Name/.test(question.prompt) || question.accepted.some((parts) => parts.some((part) => part.split(" ").length > 4));
  const submit = async (answers = values) => {
    if (isLocked || busy || !locked.ready) return;
    if (answers.some((value) => !value.trim())) { setEmpty(true); return; }
    setEmpty(false);
    setBusy(true); setError("");
    try { await locked.submit(question.id, answers); setRevealed(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败，请重试"); }
    finally { setBusy(false); }
  };
  const saveUnchecked = () => {
    if (!isLocked && !revealed && (saved || values.some((value) => value.trim()))) onRecord(question.id, { values, checked: false, correct: null });
  };

  return (
    <article id={`question-${question.id}`} className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
      <p className="text-xs font-bold text-orange-700">练习 {index + 1}{saved?.checked ? saved.correct ? " · 已掌握 ✓" : " · 待巩固" : ""}</p>
      <h4 className="mt-3 break-words text-lg font-semibold leading-8 text-stone-800">{question.prompt}</h4>
      {question.options ? (
        <div className="mt-5 space-y-3">{question.options.map((option) => (
          <button key={option} type="button" disabled={isLocked || busy || !locked.ready} aria-pressed={values[0] === option} onClick={() => { if (!isLocked) setValues([option]); }} className={`block w-full rounded-2xl border px-4 py-3 text-left text-base font-semibold transition ${values[0] === option ? "border-orange-300 bg-orange-50 text-orange-900" : "border-stone-200 bg-white text-stone-700 hover:bg-orange-50"}`}>{option === "/" ? "不填冠词" : option}</button>
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
              disabled: isLocked || busy || !locked.ready,
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
          <button type="submit" disabled={isLocked || busy || !locked.ready} className={ACTION}>{isLocked ? "已提交 · 已锁定" : busy ? "提交中…" : "提交答案"}</button>
        </form>
      )}
      {question.options && <button type="button" disabled={isLocked || busy || !locked.ready || values.some(value => !value.trim())} onClick={() => void submit()} className={`${ACTION} mt-4`}>{isLocked ? "已提交 · 已锁定" : busy ? "提交中…" : "提交答案"}</button>}
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      {revealed && (
        <div aria-live="polite" className={`mt-5 rounded-2xl border p-4 ${saved?.checked && saved.correct === true ? "border-emerald-200 bg-emerald-50" : saved?.checked && saved.correct === false ? "border-rose-200 bg-rose-50/60" : "border-sky-200 bg-sky-50/60"}`}>
          <p className="text-sm font-bold text-stone-800">{saved?.checked ? saved.correct ? saved.selfRated ? "已按参考答案自评为掌握 ✓" : "答对了 ✓" : "再检查一下" : "参考答案与解析"}</p>
          <p className="mt-3 break-words text-sm leading-7 text-stone-700">{record?.feedback.answer}</p>
          <p className="mt-3 text-xs leading-6 text-stone-500">{record?.feedback.explanation} 首次作答已锁定，不能修改成绩。</p>
        </div>
      )}
    </article>
  );
});

const WritingPractice = memo(function WritingPractice({ section, draft: initialDraft, checks, onSave, onCheck, locked }: {
  section: NationalDaySection;
  draft: string;
  checks: string[];
  onSave: (id: string, value: string) => void;
  onCheck: (id: string, label: string) => void;
  locked: ReturnType<typeof useEnglishLocked>;
}) {
  const [draftText, setDraft] = useState(initialDraft);
  const [saved, setSaved] = useState(false);
  const writing = section.writing!;
  const record = locked.records[`writing:${section.id}`];
  const isLocked = !!record;
  const draft = record && typeof record.response === "string" ? record.response : draftText;
  const words = draft.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  const save = () => { onSave(section.id, draft); setSaved(true); };
  return <section className="rounded-3xl border border-sky-200 bg-sky-50/50 p-5 sm:p-6">
    <h3 className="text-xl font-bold">{writing.label}</h3>
    <p className="mt-3 text-sm leading-7 text-stone-600">{writing.prompt}</p>
    <label htmlFor={`national-day-writing-${section.id}`} className="mt-5 block text-xs font-semibold text-stone-500">写下自己的真实表达</label>
    <textarea id={`national-day-writing-${section.id}`} value={draft} disabled={isLocked || locked.busy || !locked.ready} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} onBlur={save} rows={8} className="mt-2 w-full resize-y rounded-2xl border border-sky-200 bg-white p-4 text-base leading-8 text-stone-800 outline-none focus:ring-2 focus:ring-sky-100" placeholder="从一句完整的英文开始……" />
    <p className="mt-2 text-xs text-stone-500">{words} 个英文词{writing.minWords > 0 ? ` · 建议 ${writing.minWords}–80 词` : ""}{saved ? " · 草稿已保存" : ""}</p>
    <button type="button" disabled={isLocked || locked.busy || !draft.trim() || !locked.ready} onClick={() => void locked.submit(`writing:${section.id}`, draft).catch(() => undefined)} className={`${SECONDARY} mt-4`}>{isLocked ? "已提交 · 已锁定" : locked.busy ? "提交中…" : "提交作文"}</button>
    {locked.error && <p role="alert" className="mt-3 text-sm text-rose-700">{locked.error}</p>}
    <fieldset className="mt-5 rounded-2xl bg-white p-4"><legend className="px-1 text-sm font-bold text-sky-800">写完后，自己检查一遍</legend>{["信息说清：时间、地点、活动和感受", "动词正确：be、时态、主谓一致", "词组正确：介词、搭配、单复数", "句子完整：顺序、大小写和标点"].map((label) => <label key={label} className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-6 text-stone-600"><input type="checkbox" checked={checks.includes(label)} onChange={() => onCheck(section.id, label)} className="mt-1 h-4 w-4 shrink-0 accent-orange-400" /><span>{label}</span></label>)}</fieldset>
    {isLocked && writing.referenceBlocks && <div className="mt-5"><h4 className="text-sm font-bold text-sky-800">参考范例与检查方法</h4><p className="mt-3 text-xs leading-6 text-stone-500">原作文已锁定，保留待教师评价。</p><div className="mt-4"><SourceContent blocks={writing.referenceBlocks} /></div></div>}
  </section>;
});

const EMPTY_CHECKS: string[] = [];

export default function NationalDayEnglishSection({ section, index, pdfUrl, learning }: {
  section: NationalDaySection;
  index: number;
  pdfUrl: string;
  learning: ReturnType<typeof useNationalDayProgress>;
}) {
  const { progress, ready, recordAttempt, saveDraft, toggleWritingCheck, completeSection, locked } = learning;
  const [audioMessage, setAudioMessage] = useState("");
  const questions = useMemo(() => [...section.questions, ...(section.oralQuestions ?? [])], [section]);
  const checked = questions.filter((question) => progress.attempts[question.id]?.checked).length;
  const correct = questions.filter((question) => progress.attempts[question.id]?.checked && progress.attempts[question.id]?.correct).length;
  const completed = progress.completedSections.includes(section.id);
  const onRecord = useCallback((id: string, attempt: NationalDayAttempt) => {
    recordAttempt(id, attempt, section.id);
  }, [recordAttempt, section.id]);
  const speak = () => {
    if (!("speechSynthesis" in window) || !section.audioText) {
      setAudioMessage("当前浏览器不支持朗读，可以直接阅读下方的完整文本。");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(section.audioText);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
    setAudioMessage("浏览器朗读中；可以再听一遍，再对照下方文本核对。");
  };
  useEffect(() => () => {
    if (section.audioText && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [section.audioText]);

  return <section id={`section-${section.id}`} data-national-day-section={section.id} aria-labelledby={`section-title-${section.id}`} className="scroll-mt-6 border-t border-orange-100 pt-8" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 6000px" }}>
    <header className="mb-6 rounded-3xl border border-orange-100 bg-orange-50/50 p-6 sm:p-8">
      <p className="text-xs font-bold text-orange-700">第 {String(index + 1).padStart(2, "0")} 节 · 原 PDF 第 {section.page} 页{completed ? " · 已学完 ✓" : ""}</p>
      <h2 id={`section-title-${section.id}`} className="mt-3 break-words text-2xl font-black leading-snug sm:text-3xl">{section.title.replace(/^\d{2}(?:\.\d+)?\s+/, "")}</h2>
      <a href={`${pdfUrl}#page=${section.page}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-stone-500 underline decoration-stone-300 underline-offset-4">对照这一页原文 ↗</a>
    </header>

    <SourceContent blocks={section.blocks} />

    {section.audioText && <section className="mt-6 rounded-3xl border border-sky-200 bg-sky-50/50 p-5 sm:p-6">
      <h3 className="text-xl font-bold">听读文本与朗读</h3>
      <p className="mt-3 text-sm leading-7 text-stone-600">可以使用浏览器辅助朗读听两遍：第一遍听大意，第二遍记细节。完整文本直接放在下面。</p>
      <button type="button" onClick={speak} className={`${SECONDARY} mt-4`}>▶ 朗读 Sunday Morning</button>
      <button type="button" onClick={() => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); setAudioMessage("朗读已停止。"); }} className="mt-3 block text-sm font-semibold text-stone-500">停止朗读</button>
      {audioMessage && <p aria-live="polite" className="mt-3 text-xs leading-6 text-stone-500">{audioMessage}</p>}
      {section.listeningBlocks && <div className="mt-5"><SourceContent blocks={section.listeningBlocks} /></div>}
    </section>}

    {questions.length > 0 && <section id={`national-day-exercises-${section.id}`} className="mt-8">
      <h3 className="text-2xl font-bold">自己试一试</h3>
      <p className="mt-3 text-sm leading-7 text-stone-500">提交后查看答案；首次作答永久锁定。开放表达保留待评价。</p>
      <p className="mt-4 rounded-2xl border border-stone-200 p-4 text-sm font-semibold">已提交 {ready ? checked : "--"} / {questions.length} 题 · 首次答对 {ready ? correct : "--"} 题</p>
      {!ready ? <p className="mt-6 text-sm text-stone-500">正在读取学习进度……</p> : <div className="mt-5 space-y-5">
        {questions.map((question, questionIndex) => <QuestionCard key={question.id} question={question} index={questionIndex} saved={progress.attempts[question.id]} onRecord={onRecord} locked={locked} />)}
      </div>}
    </section>}

    {section.writing && ready && <div className="mt-8"><WritingPractice section={section} draft={progress.drafts[section.id] ?? ""} checks={progress.writingChecks[section.id] ?? EMPTY_CHECKS} onSave={saveDraft} onCheck={toggleWritingCheck} locked={locked} /></div>}

    <section className="mt-8 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5 sm:p-6">
      <h3 className="text-lg font-bold">{completed ? "本节已学完 ✓" : "给这一节打个勾"}</h3>
      <p className="mt-3 text-sm leading-7 text-stone-600">{questions.length > 0 && checked < questions.length ? `还剩 ${questions.length - checked} 题未提交。` : "本节作答已锁定，可以回看答案与解析复习。"}</p>
      {!completed && <button type="button" disabled={!ready || checked < questions.length} onClick={() => completeSection(section.id)} className="mt-4 w-full rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-bold text-emerald-800 transition enabled:hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">本节学完了，保存进度</button>}
    </section>
  </section>;
}
