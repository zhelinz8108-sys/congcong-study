"use client";

import type { ReactNode } from "react";
import { sixQuestionBlanks } from "@/lib/english-six-answer";
import type { SixFeedback, SixQuestion } from "@/lib/english-six";
import styles from "./english-six.module.css";

type Props = {
  question: SixQuestion; values: string[]; disabled: boolean; feedback?: SixFeedback;
  onChange: (values: string[]) => void; onSubmit: () => void;
};

function textRange(question: SixQuestion, start: number, end: number): ReactNode {
  if (!question.promptRuns || question.promptRuns.map(run => run.text).join("") !== question.prompt) return question.prompt.slice(start, end);
  let offset = 0;
  return question.promptRuns.map((run, index) => {
    const from = Math.max(0, start - offset), to = Math.min(run.text.length, end - offset);
    offset += run.text.length;
    if (from >= to) return null;
    return run.underline ? <u key={index}>{run.text.slice(from, to)}</u> : <span key={index}>{run.text.slice(from, to)}</span>;
  });
}

export default function EnglishSixAnswerFields({ question, values, disabled, feedback, onChange, onSubmit }: Props) {
  const blanks = sixQuestionBlanks(question);
  const inline = !question.options.length && question.kind !== "writing" && blanks.length === values.length;
  const change = (index: number, value: string) => { if (!disabled) onChange(values.map((old, n) => n === index ? value : old)); };
  const input = (index: number, inSentence = false) => <input key={`blank-${index}`} aria-label={values.length > 1 ? `第 ${index + 1} 空` : "你的答案"}
    className={inSentence ? styles.inlineAnswer : undefined} value={values[index]} disabled={disabled} required aria-required="true"
    autoComplete="off" spellCheck={false} autoCapitalize="none" data-blank={index + 1}
    onChange={event => change(index, event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onSubmit(); } }} />;
  let offset = 0;
  return <>
    <h2 className={styles.prompt} data-question-prompt={question.id}>
      {inline ? <>{blanks.map((blank, index) => {
        const start = offset;
        offset = blank.end;
        return <span key={index}>{textRange(question, start, blank.start)}{input(index, true)}</span>;
      })}{textRange(question, offset, question.prompt.length)}</> : textRange(question, 0, question.prompt.length)}
    </h2>
    {question.options.length ? <div className={styles.options} role="group" aria-label="选择答案">{question.options.map(option => <button type="button" key={option.id}
      disabled={disabled} aria-pressed={values[0] === option.id}
      data-result={feedback?.correct !== null && feedback ? option.id === feedback.answer ? "correct" : option.id === feedback.response ? "wrong" : "" : ""}
      onClick={() => change(0, option.id)}><span>{option.id}</span><div>{option.runs ? option.runs.map((run, index) => run.underline ? <u key={index}>{run.text}</u> : <span key={index}>{run.text}</span>) : option.text}</div></button>)}</div> : !inline &&
      <div className={styles.bankInputs}>{values.map((value, index) => <label className={styles.answerLabel} key={index}>{values.length > 1 ? `第 ${index + 1} 空` : "你的答案"}
        {question.kind === "writing" || question.kind === "sentence" && values.length === 1 ? <textarea rows={question.kind === "writing" ? 8 : 3} value={value} disabled={disabled} required onChange={event => change(index, event.target.value)} /> : input(index)}
      </label>)}</div>}
  </>;
}
