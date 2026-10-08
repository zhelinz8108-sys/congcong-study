"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import {
  ENGLISH_PRACTICE_DIFFICULTY_LABELS,
  type EnglishPracticeBlock,
  type EnglishPracticeChapter,
  type EnglishPracticeFeedback,
  type EnglishPracticeLetter,
  type EnglishPracticePage,
  type EnglishPracticeQuestion,
  type EnglishPracticeResult,
} from "@/lib/national-day-english-practice-types";
import { useEnglishPracticeProgress } from "@/lib/national-day-english-practice-progress";
import {
  englishPracticeAccuracyLabel,
  englishPracticeStats,
} from "@/lib/national-day-english-practice-stats";
import s from "./national-day-english-practice.module.css";

const letters: EnglishPracticeLetter[] = ["A", "B", "C", "D"];
const palettes = [
  ["#27739c", "#eaf6fd", "#f7fcff", "#c5e2f2"],
  ["#99601b", "#fff4dd", "#fffdf7", "#f1d8a8"],
  ["#21836d", "#e7f8ef", "#f7fcf9", "#bce5d5"],
  ["#8256af", "#f2ebfc", "#fcfaff", "#decaf1"],
  ["#b7526b", "#ffeef2", "#fff9fa", "#f1ccd7"],
  ["#ad622d", "#fff0e4", "#fffbf7", "#eed1ba"],
];

function chapterStyle(number: number): CSSProperties {
  const palette = palettes[(number - 1) % palettes.length] ?? palettes[0];
  return {
    "--english-accent": palette[0],
    "--english-soft": palette[1],
    "--english-tint": palette[2],
    "--english-border": palette[3],
  } as CSSProperties;
}

function pad(number: number, width = 3) {
  return String(number).padStart(width, "0");
}

type PracticeProgressState = ReturnType<typeof useEnglishPracticeProgress>;

function savedQuestionNumber(progress: PracticeProgressState["progress"], chapterId: string) {
  const location = progress.location;
  if (!location || location.chapter !== chapterId) return 1;
  const id = location.id?.match(new RegExp(`^${chapterId}-Q(\\d{3})$`));
  const number = id ? Number(id[1]) : (location.page - 1) * 10 + 1;
  return Math.max(1, Math.min(100, number));
}

function SyncStatus({ sync, retry, compact = false }: Pick<PracticeProgressState, "sync" | "retry"> & { compact?: boolean }) {
  const label = sync === "synced" ? "已同步云端" : sync === "saving" ? "正在同步…" : sync === "offline" ? "已离线保存" : "连接云端中…";
  return (
    <p className={compact ? s.compactSync : s.sync} role="status">
      <span className={s.syncDot} data-offline={sync === "offline"} aria-hidden="true" />
      {label}
      {sync === "offline" && <button type="button" className={s.syncRetry} onClick={retry}>重试</button>}
    </p>
  );
}

function Result({ result }: { result: EnglishPracticeResult }) {
  return (
    <div className={`${s.feedback} ${result.correct ? s.correct : s.incorrect}`} data-feedback={result.questionId} role="status" aria-live="polite">
      <p className={s.resultTitle}>{result.correct ? "✓ 答对了，继续保持！" : "这一题再巩固一下"}</p>
      <p className={s.answer}>你的选择：{result.selected}　正确答案：{result.correctOption}. {result.correctText}</p>
      <p className={s.explanation}><strong>解析：</strong>{result.explanation}</p>
    </div>
  );
}

function QuestionOptions({ question, selected, result, busy, onChange }: {
  question: EnglishPracticeQuestion;
  selected?: EnglishPracticeLetter;
  result?: EnglishPracticeResult;
  busy: boolean;
  onChange: (letter: EnglishPracticeLetter) => void;
}) {
  return (
    <fieldset className={s.options} disabled={busy} data-question={question.id}>
      <legend className={s.questionLegend}>选择一个正确选项</legend>
      {question.options.map((option, index) => {
        const letter = letters[index];
        return (
          <label key={letter} className={s.option} data-selected={selected === letter} data-result={result ? result.correctOption === letter ? "correct" : selected === letter ? "incorrect" : "" : ""}>
            <input type="radio" name={question.id} value={letter} checked={selected === letter} onChange={() => onChange(letter)} />
            <span className={s.optionLetter}>{letter}</span>
            <span className={s.optionText}>{option}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

function ClozePassage({ block, activeQuestion }: { block: EnglishPracticeBlock; activeQuestion: string }) {
  return (
    <div className={s.passage} lang="en">
      {(block.text ?? "").split(/(\{\d+\})/g).map((part, index) => {
        const placeholder = /^\{(\d+)\}$/.exec(part);
        if (!placeholder) return <span key={index}>{part}</span>;
        const question = block.questions[Number(placeholder[1]) - 1];
        const active = question?.id === activeQuestion;
        return (
          <span key={index} className={s.passageBlank} data-active={active} aria-label={`第 ${question?.number ?? placeholder[1]} 空${active ? "，当前作答" : ""}`}>
            ({question ? pad(question.number) : placeholder[1]}) ______
          </span>
        );
      })}
    </div>
  );
}

function FocusQuestion({ block, question, progressState, navigate }: {
  block: EnglishPracticeBlock;
  question: EnglishPracticeQuestion;
  progressState: PracticeProgressState;
  navigate: (number: number) => void;
}) {
  const { progress, draft, record, locate } = progressState;
  const [feedback, setFeedback] = useState<EnglishPracticeFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const questionScroll = useRef<HTMLDivElement | null>(null);
  const selected = progress.drafts[question.id];
  const latestSelection = useRef(selected);
  const attempt = progress.attempts[question.id];
  const result = feedback?.results.find((item) => item.questionId === question.id && item.selected === selected);
  const submitted = !!result || (!!attempt && !!selected && attempt.selected === selected);
  const cloze = block.kind === "cloze";
  const blankIndex = block.questions.findIndex((item) => item.id === question.id) + 1;

  useEffect(() => { latestSelection.current = selected; }, [selected]);
  useEffect(() => {
    if (!result) return;
    const container = questionScroll.current;
    const panel = container?.querySelector<HTMLElement>(`[data-feedback="${question.id}"]`);
    if (!container || !panel) return;
    const box = container.getBoundingClientRect();
    const feedbackBox = panel.getBoundingClientRect();
    // Reveal only this question's feedback inside its bounded reading pane.
    // This never scrolls the document, changes the question, or focuses a next button.
    const top = feedbackBox.height > box.height - 20 ? feedbackBox.top - box.top - 10 : feedbackBox.bottom - box.bottom + 14;
    if (top > 0) container.scrollBy({ top, behavior: "instant" });
  }, [result, question.id]);
  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!selected) {
      setError("请先选择一个选项，再提交答案。");
      form.current?.querySelector<HTMLInputElement>(`input[name="${question.id}"]`)?.focus();
      return;
    }
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const submittedLetter = selected;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/english/holiday-2400/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_id: block.id, question_id: question.id, answers: { [question.id]: submittedLetter } }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "暂时无法判题，请稍后重试。");
      if (body.blockId !== block.id || body.questionId !== question.id || body.maxScore !== 1 || !Array.isArray(body.results) || body.results.length !== 1 || body.results[0].questionId !== question.id || body.results[0].selected !== submittedLetter)
        throw new Error("判题结果不完整，请重试。");
      if (request.current !== controller || controller.signal.aborted || latestSelection.current !== submittedLetter) return;
      record(body as EnglishPracticeFeedback);
      locate({ chapter: question.id.slice(0, 4), page: Math.ceil(question.number / 10), id: question.id });
      setFeedback(body as EnglishPracticeFeedback);
      // Submitting never navigates or scrolls the document. The student decides when to move on.
    } catch (cause) {
      if (request.current === controller)
        setError(controller.signal.aborted ? "判题连接超时，选择已保留，请重新提交。" : cause instanceof Error ? cause.message : "网络暂时不可用，选择已保留，请重新提交。");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  function change(letter: EnglishPracticeLetter) {
    setFeedback(null);
    setError("");
    latestSelection.current = letter;
    draft(question.id, letter);
  }

  return (
    <article className={s.focusCard} data-block={block.id} data-active-question={question.id}>
      <form ref={form} className={s.focusForm} onSubmit={submit} noValidate>
        <header className={s.questionHeader}>
          <div className={s.questionHeading}>
            <h2 className={s.questionTitle}>第 {pad(question.number)} 题 <span>/ 100</span></h2>
            <span className={s.badge} data-difficulty={block.difficulty}>{ENGLISH_PRACTICE_DIFFICULTY_LABELS[block.difficulty]}</span>
            <span className={s.badge}>{cloze ? `完形 ${block.passage} · 第 ${blankIndex}/5 空` : "单项选择"}</span>
          </div>
          <label className={s.jumpLabel}>
            题号
            <select className={s.jumpSelect} aria-label="选择题号" value={question.number} disabled={busy} onChange={(event) => navigate(Number(event.target.value))}>
              {Array.from({ length: 100 }, (_, index) => <option value={index + 1} key={index}>第 {pad(index + 1)} 题</option>)}
            </select>
          </label>
        </header>
        <div ref={questionScroll} className={s.questionScroll} data-question-scroll tabIndex={0} aria-label="当前题目、选项和解析">
          <p className={s.serial}>总序号 {pad(question.serial, 4)} · {question.id}</p>
          {cloze ? (
            <>
              {block.title && <p className={s.passageTitle}>{block.title}</p>}
              <p className={s.clozeNote}>完整短文保留在这里。<strong>高亮的第 {pad(question.number)} 空</strong>是当前题目，只提交这一空。</p>
              <ClozePassage block={block} activeQuestion={question.id} />
            </>
          ) : <p className={s.stem} lang="en">{block.stem}</p>}
          <QuestionOptions question={question} selected={selected} result={result} busy={busy} onChange={change} />
          {error && <p className={s.error} role="alert">{error}</p>}
          {result && <Result result={result} />}
        </div>
        <footer className={s.questionFooter}>
          <p className={s.manualNote} role="status">{result ? "已判题，请看解析。准备好了，再手动点下一题。" : submitted ? "这题已有提交记录。可重新提交查看解析，也可手动继续。" : "先选答案，再点提交。不会自动跳题。"}</p>
          <div className={s.actions}>
            <button type="button" className={s.previous} data-nav="previous" disabled={busy || question.number === 1} onClick={() => navigate(question.number - 1)}>← 上一题</button>
            <button className={s.submit} type="submit" disabled={busy}>{busy ? "判题中…" : result ? "重新提交" : "提交答案"}</button>
            <button type="button" className={s.next} data-nav="next" disabled={busy || !submitted || question.number === 100} onClick={() => navigate(question.number + 1)}>下一题 →</button>
          </div>
          <div className={s.footerDetail}>
            <span>{attempt ? `已提交 ${attempt.submissions} 次` : "答案与解析在提交后显示"}</span>
            <button type="button" className={s.skip} data-nav="skip" disabled={busy || question.number === 100} onClick={() => navigate(question.number + 1)}>先跳过这题 →</button>
          </div>
        </footer>
      </form>
    </article>
  );
}

function ChapterFocus({ chapter, initialNumber, progressState }: {
  chapter: EnglishPracticeChapter;
  initialNumber: number;
  progressState: PracticeProgressState;
}) {
  const [number, setNumber] = useState(initialNumber);
  const [data, setData] = useState<EnglishPracticePage | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const { locate } = progressState;
  const page = Math.ceil(number / 10);
  const currentData = data?.chapter === chapter.id && data?.page === page ? data : null;
  const block = currentData?.blocks.find((item) => item.questions.some((question) => question.number === number));
  const question = block?.questions.find((item) => item.number === number);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    let active = true;
    async function load() {
      try {
        const query = new URLSearchParams({ chapter: chapter.id, page: String(page) });
        const response = await fetch(`/api/english/holiday-2400/questions?${query}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "题目暂时无法读取。");
        if (body.chapter !== chapter.id || body.page !== page || !Array.isArray(body.blocks)) throw new Error("题目页不完整，请重试。");
        if (!active) return;
        setError("");
        setData(body as EnglishPracticePage);
      } catch (cause) {
        if (active) setError(controller.signal.aborted ? "读取题目超时，请重试。" : cause instanceof Error ? cause.message : "无法读取题目，请检查网络后重试。");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [chapter.id, page, reload]);

  function navigate(nextNumber: number) {
    if (nextNumber < 1 || nextNumber > 100 || nextNumber === number) return;
    setNumber(nextNumber);
    setError("");
    locate({ chapter: chapter.id, page: Math.ceil(nextNumber / 10), id: `${chapter.id}-Q${pad(nextNumber)}` });
    // No window scroll, wheel handler, timer, or answer callback changes the question.
  }

  if (error) return <section className={s.focusLoading} role="alert"><p>{error}</p><button className={s.secondary} type="button" onClick={() => { setError(""); setReload((value) => value + 1); }}>重新读取题目</button></section>;
  if (!block || !question) return <section className={s.focusLoading} role="status"><span className={s.loadingDot} aria-hidden="true" /><p>正在读取第 {pad(number)} 题…</p></section>;
  return <FocusQuestion key={question.id} block={block} question={question} progressState={progressState} navigate={navigate} />;
}

export default function NationalDayEnglishPractice({ subjectId, chapters, chapterId }: {
  subjectId: string;
  chapters: EnglishPracticeChapter[];
  chapterId?: string;
}) {
  const progressState = useEnglishPracticeProgress(subjectId);
  const { progress, ready, sync, retry } = progressState;
  const chapter = chapters.find((item) => item.id === chapterId);
  const stats = englishPracticeStats(progress, chapter?.id);
  const total = chapter?.count ?? chapters.reduce((sum, item) => sum + item.count, 0);
  const baseUrl = `/subjects/${subjectId}/national-day-english-practice`;
  const location = progress.location;
  const resumeChapter = location && chapters.find((item) => item.id === location.chapter);

  if (chapter) return (
    <main className={s.focusPage} style={chapterStyle(chapter.number)}>
      <div className={s.focusWrap}>
        <header className={s.focusHeader}>
          <Link href={baseUrl} className={s.focusBack} prefetch={false}>← 返回练习章节</Link>
          <p className={s.focusEyebrow}>🍁 国庆英语练习 · CH{pad(chapter.number, 2)}</p>
          <h1 className={s.focusTitle}>{pad(chapter.number, 2)} · {chapter.title}</h1>
        </header>
        <section className={s.compactProgress} aria-label="我的练习进度">
          <p className={s.compactStats}>{ready ? <>
            已答 <strong data-stat="answered">{stats.answered}</strong> / 100　·　答对 <strong data-stat="correct">{stats.correct}</strong>　·　正确率 <strong data-stat="accuracy">{englishPracticeAccuracyLabel(stats.accuracy)}</strong>
          </> : "读取进度中…"}</p>
          <progress className={s.compactBar} max={100} value={stats.answered} aria-label="本章已答题数" />
          <SyncStatus sync={sync} retry={retry} compact />
        </section>
        {ready ? <ChapterFocus key={`${subjectId}-${chapter.id}`} chapter={chapter} initialNumber={savedQuestionNumber(progress, chapter.id)} progressState={progressState} /> : <section className={s.focusLoading} role="status">正在恢复你的练习…</section>}
      </div>
    </main>
  );

  return (
    <main className={s.page} style={chapterStyle(1)}>
      <div className={s.wrap}>
        <Link href={`/subjects/${subjectId}`} className={s.back} prefetch={false}>← 返回英语</Link>
        <header className={s.hero}>
          <p className={s.eyebrow}>🍁 国庆英语练习</p>
          <h1 className={s.title}>一次专心做一题，<br />一步一步把语法用起来。</h1>
          <p className={s.intro}>24 个章节，2,400 道选择与完形。进入章节后，每屏只呈现一道题。提交后留在当前题看解析，准备好了，再手动进入下一题。</p>
          <p className={s.summary}>每章 100 题 · 中等 → 困难 → 超级困难 · 题号与打印版一致</p>
        </header>
        <section className={s.panel} aria-label="我的练习进度">
          <h2 className={s.panelTitle}>我的练习进度</h2>
          {ready ? <>
            <p className={s.statLine}>已答 <strong data-stat="answered">{stats.answered}</strong> / {total} 题 · 答对 <strong data-stat="correct">{stats.correct}</strong> 题</p>
            <p className={s.accuracy}>正确率 <strong data-stat="accuracy">{englishPracticeAccuracyLabel(stats.accuracy)}</strong></p>
            <progress className={s.progress} max={total} value={stats.answered} aria-label="全部已答题数" />
          </> : <p className={s.note} role="status">正在读取学习进度…</p>}
          <SyncStatus sync={sync} retry={retry} />
          <p className={s.note}>按每题最近一次提交统计，重复提交不增加已答题数。完形填空每个空计 1 题。</p>
          {ready && resumeChapter && <Link className={s.continue} href={`${baseUrl}/${resumeChapter.id}`} prefetch={false}>继续上次练习 · {pad(resumeChapter.number, 2)} {resumeChapter.title} · 第 {pad(savedQuestionNumber(progress, resumeChapter.id))} 题 →</Link>}
        </section>
        <section className={s.panel} aria-label="选择章节">
          <h2 className={s.panelTitle}>选择章节</h2>
          <p className={s.note}>按目录顺序排列。点击章节进入题目，不随机出题，也不会自动跳题。</p>
          <div className={s.chapters}>
            {chapters.map((item) => {
              const chapterStats = englishPracticeStats(progress, item.id);
              return <Link href={`${baseUrl}/${item.id}`} className={s.chapter} style={chapterStyle(item.number)} key={item.id} data-chapter={item.id} prefetch={false}>
                <span className={s.chapterNumber}>CH{pad(item.number, 2)} · 第 {pad((item.number - 1) * 100 + 1, 4)}–{pad(item.number * 100, 4)} 题</span>
                <strong className={s.chapterTitle}>{pad(item.number, 2)} · {item.title}</strong>
                <span className={s.chapterFocus}>{item.focus.join(" · ")}</span>
                <span className={s.chapterMeta}>100 题 · 60 道选择 · 8 篇完形（40 空）</span>
                <span className={s.chapterStats}>{ready ? `已答 ${chapterStats.answered} 题 · 答对 ${chapterStats.correct} 题 · 正确率 ${englishPracticeAccuracyLabel(chapterStats.accuracy)}` : "正在读取进度…"}</span>
                <span className={s.chapterEnter}>进入本章练习 →</span>
              </Link>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
