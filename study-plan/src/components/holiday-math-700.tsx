"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type {
  HolidayChapter,
  HolidayFeedback,
  HolidayNode,
  HolidayQuestion,
  HolidayStudentAnswer,
} from "@/lib/holiday-math-700-types";
import { HOLIDAY_TYPE_LABELS } from "@/lib/holiday-math-700-types";
import {
  emptyHolidayAnswer,
  completeHolidayAnswer,
} from "@/lib/holiday-math-700-input";
import {
  useHolidayMathProgress,
  type HolidayAttempt,
} from "@/lib/holiday-math-700-progress";
import Rich from "./holiday-math-rich-text";
import s from "./holiday-math-700.module.css";

const palettes = [
  ["#2563a6", "#eaf4ff", "#f7fbff", "#c9dff7"],
  ["#976116", "#fff4d9", "#fffdf6", "#f0d7a2"],
  ["#007e70", "#e3f7ef", "#f6fcf9", "#b4e2d4"],
  ["#8153b6", "#f1eafb", "#fcf9ff", "#d8c5ee"],
  ["#b54c58", "#ffe9ee", "#fff8fa", "#f3c5ce"],
  ["#a45b27", "#fff0df", "#fffbf7", "#edd0b2"],
  ["#267d93", "#e3f5fa", "#f6fcfe", "#b8e1eb"],
];
function chapterStyle(id: string) {
  const p = palettes[Number(id.slice(-2)) - 1] ?? palettes[0];
  return {
    "--holiday-accent": p[0],
    "--holiday-soft": p[1],
    "--holiday-tint": p[2],
    "--holiday-border": p[3],
  } as CSSProperties;
}
const difficultyLabels = { easy: "基础", hard: "进阶", extreme: "挑战" };
function answerText(value: string) {
  return value.replace(/^([+-]?\d+)\/(\d+)(?=\s|$)/, "$\\frac{$1}{$2}$");
}

function AnswerControls({
  node,
  value,
  onChange,
  name,
  disabled,
}: {
  node: HolidayNode;
  value: HolidayStudentAnswer;
  onChange: (value: HolidayStudentAnswer) => void;
  name: string;
  disabled: boolean;
}) {
  if (node.parts?.length) {
    const answers =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return (
      <>
        {node.parts.map((part) => (
          <section
            className={s.part}
            key={part.part_id}
            data-part={part.part_id}
          >
            <h3 className={s.partTitle}>小题 {part.part_id}</h3>
            <div className={s.stem}>
              <Rich text={part.stem} />
            </div>
            <AnswerControls
              node={part}
              value={answers[part.part_id] ?? emptyHolidayAnswer(part)}
              onChange={(v) => onChange({ ...answers, [part.part_id]: v })}
              name={`${name}.${part.part_id}`}
              disabled={disabled}
            />
          </section>
        ))}
      </>
    );
  }
  if (node.choices?.length) {
    const multi = node.type === "multi_choice";
    const selected = multi && Array.isArray(value) ? value : [];
    return (
      <fieldset className={s.options} disabled={disabled}>
        <legend className={s.fieldLabel}>
          {multi ? "选择所有符合条件的选项（可多选）" : "选择一个选项"}
        </legend>
        {node.choices.map((choice) => (
          <label
            key={choice.id}
            className={s.option}
            data-selected={
              multi ? selected.includes(choice.id) : value === choice.id
            }
          >
            <input
              type={multi ? "checkbox" : "radio"}
              name={name}
              value={choice.id}
              checked={
                multi ? selected.includes(choice.id) : value === choice.id
              }
              onChange={() =>
                onChange(
                  multi
                    ? selected.includes(choice.id)
                      ? selected.filter((v) => v !== choice.id)
                      : [...selected, choice.id]
                    : choice.id,
                )
              }
            />
            <span className={s.optionMark}>{choice.id}</span>
            <span className={s.optionText}>
              <Rich text={choice.text} />
            </span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (node.type === "matching" || node.type === "classification") {
    const answers =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const left = node.interaction?.left ?? node.interaction?.items ?? [],
      right = node.interaction?.right ?? node.interaction?.categories ?? [];
    return (
      <div>
        {left.map((item) => (
          <fieldset
            className={s.matchingItem}
            key={item.id}
            disabled={disabled}
          >
            <legend className={s.fieldLabel}>
              <Rich text={`${item.id} · ${item.text}`} />
            </legend>
            {right.map((target) => (
              <label
                key={target.id}
                className={s.option}
                data-selected={answers[item.id] === target.id}
              >
                <input
                  type="radio"
                  name={`${name}.${item.id}`}
                  checked={answers[item.id] === target.id}
                  onChange={() =>
                    onChange({ ...answers, [item.id]: target.id })
                  }
                  value={target.id}
                />
                <span className={s.optionMark}>{target.id}</span>
                <span className={s.optionText}>
                  <Rich text={target.text} />
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    );
  }
  if (node.type === "ordering") {
    const list = node.interaction?.items ?? [],
      sequence = Array.isArray(value) ? value : [];
    function move(at: number, direction: number) {
      const next = [...sequence];
      [next[at], next[at + direction]] = [next[at + direction], next[at]];
      onChange(next);
    }
    return (
      <div>
        <p className={s.fieldLabel}>
          按题目要求依次加入项目；可用上移、下移调整顺序。
        </p>
        {list
          .filter((item) => !sequence.includes(item.id))
          .map((item) => (
            <button
              type="button"
              key={item.id}
              data-order-item={item.id}
              className={s.option}
              disabled={disabled}
              onClick={() => onChange([...sequence, item.id])}
            >
              <span className={s.optionMark}>＋</span>
              <span className={s.optionText}>
                <Rich text={`${item.id} · ${item.text}`} />
              </span>
            </button>
          ))}
        <ol aria-label="我的排序">
          {sequence.map((id, i) => (
            <li key={id} className={s.sequenceItem}>
              <Rich
                text={`${i + 1}. ${list.find((item) => item.id === id)?.text ?? id}`}
              />
              <div>
                <button
                  type="button"
                  className={s.smallButton}
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`第${i + 1}项上移`}
                >
                  上移
                </button>
                <button
                  type="button"
                  className={s.smallButton}
                  disabled={disabled || i === sequence.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`第${i + 1}项下移`}
                >
                  下移
                </button>
                <button
                  type="button"
                  className={s.smallButton}
                  disabled={disabled}
                  onClick={() => onChange(sequence.filter((_, at) => at !== i))}
                  aria-label={`移除第${i + 1}项`}
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ol>
        <p className={s.muted}>
          已加入 {sequence.length}/{list.length} 项
        </p>
      </div>
    );
  }
  const multiple = node.type === "multi_blank" || node.type === "table_fill",
    answers = multiple && Array.isArray(value) ? value : [];
  return (
    <div>
      {node.interaction?.table && (
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                {node.interaction.table.header.map((cell, i) => (
                  <th key={i}>
                    <Rich text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.interaction.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(node.input?.blanks ?? [{ label: "答案", unit: null }]).map(
        (blank, i) => (
          <label className={s.inputUnit} key={i}>
            <span className={s.fieldLabel}>
              <Rich
                text={`${multiple ? `第 ${blank.label} 空` : blank.label}${blank.unit ? `（${blank.unit}）` : ""}`}
              />
            </span>
            <input
              className={s.input}
              type="text"
              name={multiple ? `${name}.${i}` : name}
              value={
                multiple
                  ? (answers[i] ?? "")
                  : typeof value === "string"
                    ? value
                    : ""
              }
              maxLength={200}
              autoComplete="off"
              disabled={disabled}
              placeholder="输入答案后提交"
              onChange={(e) => {
                if (multiple) {
                  const next = Array.from(
                    { length: node.input!.blanks.length },
                    (_, at) => answers[at] ?? "",
                  );
                  next[i] = e.target.value;
                  onChange(next);
                } else onChange(e.target.value);
              }}
            />
          </label>
        ),
      )}
    </div>
  );
}

type ProgressApi = ReturnType<typeof useHolidayMathProgress>;
function QuestionCard({
  question,
  progress,
}: {
  question: HolidayQuestion;
  progress: ProgressApi;
}) {
  const [feedback, setFeedback] = useState<HolidayFeedback | null>(null),
    [hints, setHints] = useState<string[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const draft =
      progress.progress.drafts[question.id] ?? emptyHolidayAnswer(question),
    attempt: HolidayAttempt | undefined =
      progress.progress.attempts[question.id];
  async function request(kind: "check" | "hint", level?: number) {
    if (kind === "check" && !completeHolidayAnswer(question, draft)) {
      setError("请先完成全部选项、空格和小题，再提交。");
      return;
    }
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/math/holiday-700/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "check"
            ? { question_id: question.id, student_answer: draft }
            : { question_id: question.id, level },
        ),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "暂时无法提交，请重试。");
      if (kind === "hint")
        setHints((old) => {
          const next = [...old];
          next[(level ?? 1) - 1] = result.hint;
          return next;
        });
      else {
        setFeedback(result);
        progress.record(result, hints.length > 0);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "网络未连接，请稍后重试。",
      );
    } finally {
      setPending(false);
    }
  }
  function edit(value: HolidayStudentAnswer) {
    setFeedback(null);
    setError("");
    progress.draft(question.id, value);
  }
  return (
    <article
      id={question.id}
      className={s.card}
      style={chapterStyle(question.chapter_id)}
      data-question={question.id}
      data-type={question.type}
    >
      <p className={s.eyebrow}>
        {question.chapter_title} · 第 {Number(question.id.slice(-3))} 题
      </p>
      <h2 className={s.sectionHead}>{HOLIDAY_TYPE_LABELS[question.type]}</h2>
      <p className={s.muted}>
        {question.id} · {difficultyLabels[question.difficulty]} · 参考{" "}
        {Math.max(1, Math.round(question.estimated_time_seconds / 60))} 分钟
        {attempt
          ? ` · 上次${attempt.correct ? "全部正确" : "需要订正"} ${attempt.score}/${attempt.maxScore}`
          : ""}
      </p>
      <p className={s.muted}>
        {(question.knowledge_point_names ?? question.knowledge_points).join(
          " · ",
        )}
        {question.extension_topic ? ` · 拓展：${question.extension_topic}` : ""}
      </p>
      <div className={s.stem}>
        <Rich text={question.stem} />
      </div>
      {/* SVG is a passive image, never injected as executable markup. */}
      {question.diagram && (
        <figure className={s.diagram}>
          {/* Original SVG dimensions stay responsive without image transformation. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/holiday-math-700/${question.diagram.src}`}
            alt={question.diagram.alt}
            loading="lazy"
          />
          <figcaption className={s.muted}>
            <Rich text={question.diagram.alt} />
          </figcaption>
        </figure>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void request("check");
        }}
      >
        <AnswerControls
          node={question}
          value={draft}
          onChange={edit}
          name={question.id}
          disabled={pending}
        />
        <button className={s.submit} type="submit" disabled={pending}>
          {pending ? "正在处理…" : "提交答案 · 查看判题与解析"}
        </button>
      </form>
      <button
        className={s.action}
        type="button"
        disabled={pending || hints.length >= 2}
        onClick={() => void request("hint", hints.length + 1)}
      >
        {hints.length >= 2
          ? "两条提示已展开"
          : hints.length === 1
            ? "再看一个提示"
            : "需要帮助？看第一个提示"}
      </button>
      {hints.map((hint, i) => (
        <div className={s.hint} key={i}>
          <p className={s.fieldLabel}>提示 {i + 1}</p>
          <Rich text={hint} />
        </div>
      ))}
      {error && (
        <p className={s.notice} role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <section
          className={s.feedback}
          data-correct={feedback.correct}
          aria-live="polite"
          data-feedback={question.id}
        >
          <h3 className={s.sectionHead}>
            {feedback.correct ? "全部答对了！" : "继续想一想，再试一次"}
          </h3>
          <p>
            {feedback.score}/{feedback.maxScore}{" "}
            项正确。每个空、匹配项、排序位置或多选选项均为一个判分项。
          </p>
          {feedback.items.map((item) => (
            <div key={item.path} className={s.result}>
              <p className={s.fieldLabel}>
                {item.correct ? "✓" : "待订正"} · <Rich text={item.label} />
              </p>
              <p>
                正确答案：
                <Rich text={answerText(item.expected)} />
              </p>
            </div>
          ))}
          <div className={s.solution}>
            <h4 className={s.fieldLabel}>解题思路</h4>
            <Rich text={feedback.solution.short_explanation} />
            <ol>
              {feedback.solution.steps.map((step, i) => (
                <li key={i}>
                  <Rich text={step} />
                </li>
              ))}
            </ol>
          </div>
          {Object.keys(feedback.choice_rationales ?? {}).length > 0 && (
            <div className={s.solution}>
              <h4 className={s.fieldLabel}>选项为什么对或错</h4>
              {Object.entries(feedback.choice_rationales).flatMap(
                ([key, reason]) =>
                  typeof reason === "string"
                    ? [
                        <p key={key}>
                          <Rich text={`${key}：${reason}`} />
                        </p>,
                      ]
                    : Object.entries(reason).map(([id, text]) => (
                        <p key={`${key}.${id}`}>
                          <Rich text={`小题 ${key} · ${id}：${text}`} />
                        </p>
                      )),
              )}
            </div>
          )}
          {feedback.common_mistakes.length > 0 && (
            <div className={s.solution}>
              <h4 className={s.fieldLabel}>易错提醒</h4>
              {feedback.common_mistakes.map((text, i) => (
                <p key={i}>
                  <Rich text={text} />
                </p>
              ))}
            </div>
          )}
          <button
            type="button"
            className={s.action}
            onClick={() => {
              setFeedback(null);
              progress.draft(question.id, emptyHolidayAnswer(question));
            }}
          >
            收起答案，重新作答
          </button>
        </section>
      )}
    </article>
  );
}

export default function HolidayMath700({
  subjectId,
  chapters,
}: {
  subjectId: string;
  chapters: HolidayChapter[];
}) {
  const progress = useHolidayMathProgress(subjectId),
    location = progress.progress.location;
  const [data, setData] = useState<{
      questions: HolidayQuestion[];
      total: number;
      page: number;
      pages: number;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [wrongOnly, setWrongOnly] = useState(false),
    [retry, setRetry] = useState(0);
  const wrongIds = useMemo(
    () =>
      Object.entries(progress.progress.attempts)
        .filter(([, a]) => a.wrongCount > 0)
        .map(([id]) => id)
        .sort()
        .join(","),
    [progress.progress.attempts],
  );
  const requestedWrongIds = wrongOnly ? wrongIds : "";
  useEffect(() => {
    if (!progress.ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      chapter: location.chapter,
      page: String(location.page),
    });
    if (location.type) params.set("type", location.type);
    if (location.difficulty) params.set("difficulty", location.difficulty);
    if (wrongOnly) params.set("ids", requestedWrongIds);
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return;
        setLoading(true);
        setError("");
        return fetch(`/api/math/holiday-700/questions?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
      })
      .then(async (response) => {
        if (!response || controller.signal.aborted) return;
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? "题目加载失败");
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "网络未连接");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    progress.ready,
    location.chapter,
    location.type,
    location.difficulty,
    location.page,
    wrongOnly,
    requestedWrongIds,
    retry,
  ]);
  function filter(change: Partial<typeof location>) {
    progress.locate({ ...location, ...change, page: 1, id: "" });
  }
  function page(value: number) {
    progress.locate({ ...location, page: value, id: "" });
    document
      .getElementById("holiday-questions")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const attempts = Object.values(progress.progress.attempts),
    completed = attempts.filter((a) => a.correct).length;
  return (
    <main className={s.page}>
      <div className={s.wrap} style={chapterStyle(location.chapter)}>
        <Link className={s.action} href={`/subjects/${subjectId}`}>
          ← 返回数学
        </Link>
        <header className={s.hero}>
          <p className={s.eyebrow}>NATIONAL DAY · MATH PRACTICE</p>
          <h1 className={s.title}>国庆数学练习</h1>
          <p className={s.intro}>
            七个章节，700 道题。从会算到会想，按自己的节奏向下练。
          </p>
          <p className={s.muted}>
            13 种题型 · 原题 SVG 图示 · 分步提示 · 提交后判题解析
          </p>
        </header>
        <section className={s.panel}>
          <h2 className={s.sectionHead}>我的练习进度</h2>
          <p>
            已提交 {attempts.length}/700 题 · 全部答对 {completed} 题 · 曾答错{" "}
            {attempts.filter((a) => a.wrongCount > 0).length} 题
          </p>
          <progress
            className={s.progress}
            aria-label="全部答对的题目进度"
            value={completed}
            max={700}
          />
          <p className={s.muted} role="status">
            {
              {
                loading: "正在读取进度…",
                saving: "正在保存…",
                saved: "草稿与判分进度已同步云端",
                offline: "云端暂未连接，已保留本机草稿",
              }[progress.sync]
            }
          </p>
          {progress.sync === "offline" && (
            <button className={s.action} onClick={progress.retry}>
              重新同步进度
            </button>
          )}
        </section>
        <section className={s.panel}>
          <h2 className={s.sectionHead}>选择章节</h2>
          <div className={s.chapters}>
            {chapters.map((chapter, i) => (
              <button
                key={chapter.chapter_id}
                type="button"
                style={chapterStyle(chapter.chapter_id)}
                className={s.chapter}
                aria-pressed={location.chapter === chapter.chapter_id}
                disabled={!progress.ready}
                onClick={() => filter({ chapter: chapter.chapter_id })}
              >
                <strong>
                  {String(i + 1).padStart(2, "0")} · {chapter.chapter_title}
                </strong>
                <span className={s.muted}>
                  {" "}
                  {chapter.count} 题 · 已答{" "}
                  {
                    Object.keys(progress.progress.attempts).filter((id) =>
                      id.includes(`_${chapter.chapter_id}_`),
                    ).length
                  }{" "}
                  题
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className={s.panel}>
          <h2 className={s.sectionHead}>安排本次练习</h2>
          <label className={s.inputUnit}>
            <span className={s.fieldLabel}>练习范围</span>
            <select
              className={s.select}
              disabled={!progress.ready}
              value={wrongOnly ? "wrong" : "chapter"}
              onChange={(e) => {
                setWrongOnly(e.target.value === "wrong");
                filter({});
              }}
            >
              <option value="chapter">当前章节全部题目</option>
              <option value="wrong">当前章节错题记录（改对后仍保留）</option>
            </select>
          </label>
          <label className={s.inputUnit}>
            <span className={s.fieldLabel}>题型</span>
            <select
              className={s.select}
              disabled={!progress.ready}
              value={location.type}
              onChange={(e) => filter({ type: e.target.value })}
            >
              <option value="">全部题型</option>
              {Object.entries(HOLIDAY_TYPE_LABELS).map(([type, label]) => (
                <option value={type} key={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={s.inputUnit}>
            <span className={s.fieldLabel}>难度</span>
            <select
              className={s.select}
              disabled={!progress.ready}
              value={location.difficulty}
              onChange={(e) => filter({ difficulty: e.target.value })}
            >
              <option value="">全部难度</option>
              {Object.entries(difficultyLabels).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className={s.muted}>
            每页 10 题，上下排列。难度标签来自原题库编者，尚未经过学生实测。
          </p>
        </section>
        <section
          id="holiday-questions"
          style={{ scrollMarginTop: 90 }}
          aria-busy={loading}
        >
          <h2 className={s.sectionHead}>
            {
              chapters.find((c) => c.chapter_id === location.chapter)
                ?.chapter_title
            }{" "}
            · {wrongOnly ? "错题订正" : "章节练习"}
          </h2>
          {error && (
            <div className={s.notice} role="alert">
              {error}
              <button
                className={s.action}
                onClick={() => setRetry((v) => v + 1)}
              >
                重新加载
              </button>
            </div>
          )}
          {loading || !progress.ready ? (
            <p className={s.panel} role="status">
              正在加载题目…
            </p>
          ) : (
            data && (
              <>
                <p className={s.muted}>
                  {data.total} 题 · 第 {data.page}/{data.pages} 页
                </p>
                {data.questions.length === 0 ? (
                  <p className={s.panel}>
                    这个范围暂时没有题目，请选择其他题型或章节。
                  </p>
                ) : (
                  data.questions.map((question) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      progress={progress}
                    />
                  ))
                )}
                <nav className={s.panel} aria-label="题目分页">
                  <button
                    className={s.action}
                    disabled={data.page <= 1}
                    onClick={() => page(data.page - 1)}
                  >
                    ↑ 上一页
                  </button>
                  <label className={s.inputUnit}>
                    <span className={s.fieldLabel}>跳转页码</span>
                    <select
                      className={s.select}
                      aria-label="跳转页码"
                      value={data.page}
                      onChange={(e) => page(Number(e.target.value))}
                    >
                      {Array.from({ length: data.pages }, (_, i) => (
                        <option key={i} value={i + 1}>
                          第 {i + 1} 页
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={s.action}
                    disabled={data.page >= data.pages}
                    onClick={() => page(data.page + 1)}
                  >
                    下一页 ↓
                  </button>
                </nav>
              </>
            )
          )}
        </section>
        <aside className={s.panel}>
          <h2 className={s.sectionHead}>练习与判分说明</h2>
          <p className={s.muted}>
            填写或选择全部答案后才显示本题解析。数值题核对结果和单位；最简分数、最简整数比等仍需满足题目格式。多空、多小题、匹配、排序和多选逐项判分，所有项正确才计为本题全部答对。选择判断理由不代表系统核验了完整文字推理。
          </p>
          <p className={s.muted}>
            原题库质量报告：573 题完成数学核查，127 题待进一步逻辑复核；另有 39
            项认知覆盖缺口。本模块保留原数据，不把上述待核查项视为已解决。建议结合课本与老师讲解学习。
          </p>
        </aside>
      </div>
    </main>
  );
}
