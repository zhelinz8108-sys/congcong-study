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

function Result({ result }: { result: EnglishPracticeResult }) {
  return (
    <div
      className={`${s.feedback} ${result.correct ? s.correct : s.incorrect}`}
      data-feedback={result.questionId}
      role="status"
    >
      <p className={s.resultTitle}>
        {result.correct ? "✓ 答对了" : "再想一想，这一题还需要巩固"}
      </p>
      <p>你的选择：{result.selected}　{result.correct ? "正确" : "不正确"}</p>
      <p className={s.answer}>
        正确答案：{result.correctOption}. {result.correctText}
      </p>
      <p className={s.explanation}><strong>解析：</strong>{result.explanation}</p>
    </div>
  );
}

function QuestionOptions({
  question,
  selected,
  result,
  busy,
  cloze,
  onChange,
}: {
  question: EnglishPracticeQuestion;
  selected?: EnglishPracticeLetter;
  result?: EnglishPracticeResult;
  busy: boolean;
  cloze: boolean;
  onChange: (letter: EnglishPracticeLetter) => void;
}) {
  return (
    <section className={cloze ? s.blankQuestion : s.choiceQuestion}>
      <fieldset className={s.options} disabled={busy} data-question={question.id}>
        <legend className={s.questionLegend}>
          {cloze ? `第 ${pad(question.number)} 空` : "选择一个正确选项"}
          <span className={s.serial}>
            总序号 {pad(question.serial, 4)} · {question.id}
          </span>
        </legend>
        {question.options.map((option, index) => {
          const letter = letters[index];
          return (
            <label
              key={letter}
              className={s.option}
              data-selected={selected === letter}
              data-result={result ? result.correctOption === letter ? "correct" : selected === letter ? "incorrect" : "" : ""}
            >
              <input
                type="radio"
                name={question.id}
                value={letter}
                checked={selected === letter}
                onChange={() => onChange(letter)}
              />
              <span className={s.optionLetter}>{letter}</span>
              <span className={s.optionText}>{option}</span>
            </label>
          );
        })}
      </fieldset>
      {result && <Result result={result} />}
    </section>
  );
}

function ClozePassage({ block }: { block: EnglishPracticeBlock }) {
  return (
    <div className={s.passage} lang="en">
      {(block.text ?? "").split(/(\{\d+\})/g).map((part, index) => {
        const placeholder = /^\{(\d+)\}$/.exec(part);
        if (!placeholder) return <span key={index}>{part}</span>;
        const question = block.questions[Number(placeholder[1]) - 1];
        return (
          <span key={index} className={s.passageBlank} aria-label={`第 ${question?.number ?? placeholder[1]} 空`}>
            ({question ? pad(question.number) : placeholder[1]}) ______
          </span>
        );
      })}
    </div>
  );
}

function PracticeBlock({
  block,
  progress,
  draft,
  record,
  locate,
}: {
  block: EnglishPracticeBlock;
  progress: ReturnType<typeof useEnglishPracticeProgress>["progress"];
  draft: ReturnType<typeof useEnglishPracticeProgress>["draft"];
  record: ReturnType<typeof useEnglishPracticeProgress>["record"];
  locate: (id: string) => void;
}) {
  const [feedback, setFeedback] = useState<EnglishPracticeFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const first = block.questions[0];
  const last = block.questions[block.questions.length - 1];
  const answered = block.questions.filter((question) => progress.attempts[question.id]).length;
  const selected = block.questions.filter((question) => progress.drafts[question.id]).length;

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const missing = block.questions.find((question) => !progress.drafts[question.id]);
    if (missing) {
      setError(block.kind === "cloze" ? "请先完成这篇完形填空的全部 5 空，再提交整篇。" : "请先选择一个选项，再提交答案。");
      form.current?.querySelector<HTMLInputElement>(`input[name="${missing.id}"]`)?.focus();
      return;
    }
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const answers = Object.fromEntries(block.questions.map((question) => [question.id, progress.drafts[question.id]]));
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/english/holiday-2400/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_id: block.id, answers }),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "暂时无法判题，请稍后重试。");
      if (body.blockId !== block.id || !Array.isArray(body.results) || body.results.length !== block.questions.length)
        throw new Error("判题结果不完整，请重试。");
      if (request.current !== controller || controller.signal.aborted) return;
      record(body as EnglishPracticeFeedback);
      locate(first.id);
      setFeedback(body as EnglishPracticeFeedback);
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

  function change(questionId: string, letter: EnglishPracticeLetter) {
    setFeedback(null);
    setError("");
    draft(questionId, letter);
    locate(questionId);
  }

  return (
    <article className={s.card} data-block={block.id} id={first.id}>
      <div className={s.badges}>
        <span className={s.badge} data-difficulty={block.difficulty}>{ENGLISH_PRACTICE_DIFFICULTY_LABELS[block.difficulty]}</span>
        <span className={s.badge}>{block.kind === "cloze" ? "完形填空" : "单项选择"}</span>
        <span className={s.attemptBadge}>{answered ? `已提交 ${answered}/${block.questions.length} 题` : "尚未提交"}</span>
      </div>
      <h2 className={s.cardTitle}>
        {block.kind === "cloze" ? `第 ${pad(first.number)}–${pad(last.number)} 题 · 完形填空 ${block.passage}` : `第 ${pad(first.number)} 题`}
      </h2>
      {block.kind === "cloze" ? (
        <>
          {block.title && <p className={s.passageTitle}>{block.title}</p>}
          <p className={s.note}>先读完整篇，再选择每个空的答案。5 空全部完成后，一次提交判题。</p>
          <ClozePassage block={block} />
        </>
      ) : <p className={s.stem} lang="en">{block.stem}</p>}
      <form ref={form} onSubmit={submit} noValidate>
        {block.questions.map((question) => (
          <QuestionOptions
            key={question.id}
            question={question}
            selected={progress.drafts[question.id]}
            result={feedback?.results.find((result) => result.questionId === question.id)}
            busy={busy}
            cloze={block.kind === "cloze"}
            onChange={(letter) => change(question.id, letter)}
          />
        ))}
        {error && <p className={s.error} role="alert">{error}</p>}
        {feedback && block.kind === "cloze" && <p className={s.blockScore} role="status">本篇答对 {feedback.score}/{feedback.maxScore} 空</p>}
        <button className={s.submit} type="submit" disabled={busy}>
          {busy ? "正在判题…" : block.kind === "cloze" ? "提交整篇 · 查看判题与解析" : "提交答案 · 查看判题与解析"}
        </button>
        <p className={s.submitNote}>
          {block.kind === "cloze" ? `已选择 ${selected}/5 空 · ` : ""}
          正确答案和解析只在提交后显示；修改选择后会再次隐藏。
        </p>
      </form>
    </article>
  );
}

function Pagination({
  page,
  changePage,
  bottom = false,
}: {
  page: number;
  changePage: (page: number) => void;
  bottom?: boolean;
}) {
  return (
    <nav className={s.pagination} aria-label={bottom ? "底部题目分页" : "题目分页"}>
      {!bottom && <label className={s.pageLabel}>
        按题号顺序练习
        <select className={s.select} aria-label="选择题目页码" value={page} onChange={(event) => changePage(Number(event.target.value))}>
          {Array.from({ length: 10 }, (_, index) => (
            <option value={index + 1} key={index}>第 {index + 1}/10 页 · 第 {pad(index * 10 + 1)}–{pad((index + 1) * 10)} 题</option>
          ))}
        </select>
      </label>}
      <button type="button" className={s.secondary} disabled={page === 1} onClick={() => changePage(page - 1)}>← 上一页</button>
      <button type="button" className={s.secondary} disabled={page === 10} onClick={() => changePage(page + 1)}>下一页 →</button>
      <p className={s.note}>第 {page}/10 页 · 题目与选项顺序固定，与无答案 PDF 完全对应。</p>
    </nav>
  );
}

function ChapterQuestions({
  chapter,
  initialPage,
  progressState,
}: {
  chapter: EnglishPracticeChapter;
  initialPage: number;
  progressState: ReturnType<typeof useEnglishPracticeProgress>;
}) {
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<EnglishPracticePage | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const pageTop = useRef<HTMLDivElement | null>(null);
  const { progress, draft, record, locate } = progressState;
  const currentData = data?.chapter === chapter.id && data?.page === page ? data : null;

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
        if (body.chapter !== chapter.id || body.page !== page || !Array.isArray(body.blocks))
          throw new Error("题目页不完整，请重试。");
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
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [chapter.id, page, reload]);

  function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > 10 || nextPage === page) return;
    setPage(nextPage);
    setError("");
    locate({ chapter: chapter.id, page: nextPage });
    pageTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={pageTop} className={s.questionPages}>
      <Pagination page={page} changePage={changePage} />
      {!currentData && !error && <p className={s.loading} role="status">正在读取本页题目…</p>}
      {error && <div className={s.loadError} role="alert">
        <p>{error}</p>
        <button className={s.secondary} type="button" onClick={() => setReload((value) => value + 1)}>重新读取题目</button>
      </div>}
      {currentData && !error && <div key={`${chapter.id}-${page}`}>
        {currentData.blocks.map((block) => (
          <PracticeBlock key={block.id} block={block} progress={progress} draft={draft} record={record} locate={(id) => locate({ chapter: chapter.id, page, id })} />
        ))}
        <Pagination page={page} changePage={changePage} bottom />
      </div>}
    </div>
  );
}

export default function NationalDayEnglishPractice({
  subjectId,
  chapters,
  chapterId,
}: {
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
  const initialPage = chapter && location?.chapter === chapter.id ? Math.max(1, Math.min(10, location.page)) : 1;

  return (
    <main className={s.page} style={chapterStyle(chapter?.number ?? 1)}>
      <div className={s.wrap}>
        <Link href={chapter ? baseUrl : `/subjects/${subjectId}`} className={s.back} prefetch={false}>
          {chapter ? "← 返回练习章节" : "← 返回英语"}
        </Link>
        <header className={s.hero}>
          <p className={s.eyebrow}>🍁 国庆英语练习 {chapter && `· CH${pad(chapter.number, 2)}`}</p>
          <h1 className={s.title}>{chapter ? `${pad(chapter.number, 2)} · ${chapter.title}` : "一步一步，把语法用起来。"}</h1>
          <p className={s.intro}>{chapter ? "先独立作答，再看即时反馈与解析。题号、选项和打印版一一对应，按自己的节奏从上往下练。" : "24 个章节，2,400 道选择与完形。先进入章节，再按固定题号练习；每次提交后，才显示正确答案与解析。"}</p>
          <p className={s.summary}>{chapter ? "60 道单项选择 · 8 篇完形 / 40 空 · 共 100 题" : "每章 100 题 · 中等 → 困难 → 超级困难 · 词汇控制在 2,000 以内"}</p>
          {chapter && <ul className={s.focus}>{chapter.focus.map((item) => <li key={item}>{item}</li>)}</ul>}
        </header>
        <section className={s.panel} aria-label="我的练习进度">
          <h2 className={s.panelTitle}>{chapter ? "本章练习进度" : "我的练习进度"}</h2>
          {ready ? <>
            <p className={s.statLine}>已答 <strong data-stat="answered">{stats.answered}</strong> / {total} 题 · 答对 <strong data-stat="correct">{stats.correct}</strong> 题</p>
            <p className={s.accuracy}>正确率 <strong data-stat="accuracy">{englishPracticeAccuracyLabel(stats.accuracy)}</strong></p>
            <progress className={s.progress} max={total} value={stats.answered} aria-label={`${chapter ? "本章" : "全部"}已答题数`} />
          </> : <p className={s.note} role="status">正在读取学习进度…</p>}
          <p className={s.sync} role="status">
            {sync === "synced" ? "草稿和练习进度已同步云端" : sync === "saving" ? "已保存到本机，正在同步云端…" : sync === "offline" ? "暂时离线，草稿和进度已保留在本机" : "正在连接云端…"}
          </p>
          {sync === "offline" && <button className={s.secondary} type="button" onClick={retry}>重试云端同步</button>}
          <p className={s.note}>按每道题最近一次提交统计，重复提交不增加已答题数。完形填空每个空计 1 题。</p>
          {!chapter && ready && resumeChapter && <Link className={s.continue} href={`${baseUrl}/${resumeChapter.id}`} prefetch={false}>继续上次练习 · {pad(resumeChapter.number, 2)} {resumeChapter.title} · 第 {location?.page} 页 →</Link>}
        </section>
        {chapter ? ready && <ChapterQuestions key={chapter.id} chapter={chapter} initialPage={initialPage} progressState={progressState} /> : <section className={s.panel} aria-label="选择章节">
          <h2 className={s.panelTitle}>选择章节</h2>
          <p className={s.note}>按目录顺序排列。点击章节进入题目，不随机出题。</p>
          <div className={s.chapters}>
            {chapters.map((item) => {
              const chapterStats = englishPracticeStats(progress, item.id);
              return (
                <Link href={`${baseUrl}/${item.id}`} className={s.chapter} style={chapterStyle(item.number)} key={item.id} data-chapter={item.id} prefetch={false}>
                  <span className={s.chapterNumber}>CH{pad(item.number, 2)} · 第 {pad((item.number - 1) * 100 + 1, 4)}–{pad(item.number * 100, 4)} 题</span>
                  <strong className={s.chapterTitle}>{pad(item.number, 2)} · {item.title}</strong>
                  <span className={s.chapterFocus}>{item.focus.join(" · ")}</span>
                  <span className={s.chapterMeta}>100 题 · 60 道选择 · 8 篇完形（40 空）</span>
                  <span className={s.chapterStats}>{ready ? `已答 ${chapterStats.answered} 题 · 答对 ${chapterStats.correct} 题 · 正确率 ${englishPracticeAccuracyLabel(chapterStats.accuracy)}` : "正在读取进度…"}</span>
                  <span className={s.chapterEnter}>进入本章练习 →</span>
                </Link>
              );
            })}
          </div>
        </section>}
        {chapter && <Link className={s.returnLink} href={baseUrl} prefetch={false}>← 返回 24 个章节</Link>}
      </div>
    </main>
  );
}
