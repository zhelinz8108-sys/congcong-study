"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { finalExamGroups, finalExamPdf, finalExamQuestionPoints, finalExamSections, questionAnswered, type ExamField, type ExamQuestion, type ExamState } from "@/lib/math-final-exams";
import ExamDrawing from "./ExamDrawing";
import { useExamDraft } from "./useExamDraft";

function Field({ field, value, locked, change }: { field: ExamField; value: string; locked: boolean; change: (v: string) => void }) {
  const id = "field-" + field.id;
  if (field.options) {
    const multiple = field.kind === "multi", selected = value ? value.split(",") : [];
    return <fieldset className="exam-field answers-choice" disabled={locked}><legend>{field.label}</legend>
      {field.options.map(option => <label className="exam-option" key={option.value}>
        <input type={multiple ? "checkbox" : "radio"} name={id} value={option.value}
          checked={multiple ? selected.includes(option.value) : value === option.value}
          onChange={event => change(multiple ? (event.target.checked ? [...selected, option.value] : selected.filter(item => item !== option.value)).join(",") : option.value)} />
        {field.label === "选择答案" && <b>{option.value}.</b>}<span dangerouslySetInnerHTML={{ __html: option.html }} />
      </label>)}
    </fieldset>;
  }
  const placeholder = field.kind === "point" ? "列,行" : field.kind === "path" ? "列,行；列,行；…" : field.kind.endsWith("Ratio") || field.kind === "ratio" ? "前项:后项" : undefined;
  return <div className="exam-field written"><label htmlFor={id}>{field.label}</label><div>
    <input id={id} name={id} value={value} disabled={locked} autoComplete="off" placeholder={placeholder}
      maxLength={field.kind === "path" ? 256 : 120} onChange={event => change(event.target.value)} />
    {field.unit && <span>{field.unit}</span>}
  </div></div>;
}
function ReferenceValue({ value }: { value: string }) {
  const fraction = /^(\d+)(π?)\/(\d+)$/.exec(value);
  if (!fraction) return <>{value}</>;
  return <span className="exam-frac" aria-label={fraction[3]+"分之"+fraction[1]+fraction[2]}>
    <span>{fraction[1]}{fraction[2]}</span><span>{fraction[3]}</span>
  </span>;
}
export default function PaperForm({ number, student, initial, questions, directory }: {
  number: number; student: string; initial: ExamState; questions: ExamQuestion[]; directory: string;
}) {
  const draft = useExamDraft(number, student, initial);
  const { values, result } = draft;
  const [onlyWrong, setOnlyWrong] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (result && !initial.submittedAt) resultHeading.current?.focus(); }, [result, initial.submittedAt]);
  const answered = questions.map(q => questionAnswered(q, values)), count = answered.filter(Boolean).length;
  const missing = answered.indexOf(false) + 1;
  const locked = !!result || draft.sending || draft.conflict || !draft.ready;
  const correct = result?.marks?.filter(m => m.correct).length ?? 0;
  return <>
    <p className="exam-note">圆周率取 3.14，要求用 π 表示时保留 π。多项作答全部正确得 2 分。</p>
    {result ? <section className="exam-score" aria-label="考试成绩">
      <h2 ref={resultHeading} tabIndex={-1}>得分 <strong>{result.score}</strong> / 100</h2>
      <p>答对 {correct} 题，答错 {50-correct} 题。</p>
      <div className="exam-tools"><button type="button" aria-pressed={onlyWrong} disabled={correct === 50} onClick={() => setOnlyWrong(!onlyWrong)}>{onlyWrong ? "显示全部题目" : "只看错题"}</button>
        <a href={finalExamPdf(number,"answers")} download>下载本卷答案解析</a></div>
    </section> : <div className="exam-progress">
      <div><strong>已答 {count} / 50 题</strong><span role="status">{draft.saving || (initial.revision ? "已保存" : "")}</span></div>
      <progress value={count} max={50} aria-label="整卷作答进度" />
      <div className="exam-progress-links">{missing > 0 && <a href={"#q"+missing}>前往首道未答题</a>}<a href="#exam-submit">前往交卷</a>
        <a href={finalExamPdf(number,"student")} download>打印试卷</a></div>
    </div>}
    <nav className="exam-sections" aria-label="题型导航">{finalExamSections.map((s,k) => {
      const [a,b] = finalExamGroups[k];
      return !onlyWrong || result?.marks?.slice(a,b).some(m => !m.correct) ? <a key={s} href={"#part-"+(k+1)}>{s}</a> : null;
    })}</nav>
    <form onSubmit={event => { event.preventDefault(); if (count === 50) void draft.submit(); }}>
      <article className="exam-sheet" aria-label="在线试卷">
        {finalExamGroups.map(([a,b],k) => {
          if (onlyWrong && result?.marks?.slice(a,b).every(m => m.correct)) return null;
          return <section id={"part-"+(k+1)} key={k}>
            <header><h2>{finalExamSections[k]}</h2><span>{b-a} 题 · {(b-a)*finalExamQuestionPoints} 分</span></header>
            <ol start={a+1}>{questions.slice(a,b).map((question,j) => {
              const n = a+j+1, mark = result?.marks?.[n-1], workId = "work."+n;
              if (onlyWrong && mark?.correct) return null;
              return <li key={n} id={"q"+n} value={n}>
                <div className="exam-stem" dangerouslySetInnerHTML={{ __html: question.stem }} />
                {question.grid ? <ExamDrawing question={question} values={values} locked={locked} change={draft.change} />
                  : question.figure && <figure dangerouslySetInnerHTML={{ __html: question.figure }} />}
                <div className="exam-inputs">{question.fields.map(field => <Field key={field.id} field={field} value={values[field.id] ?? ""} locked={locked} change={v => draft.change(field.id,v)}/>)}</div>
                {n >= 27 && (!result || values[workId]) && <details className="exam-work" open={result ? true : undefined}><summary>我的解题过程{!result && "（选填）"}</summary>
                  {result ? <p>{values[workId]}</p> : <textarea aria-label={"第 "+n+" 题解题过程"} maxLength={800} disabled={locked} rows={2} value={values[workId] ?? ""} onChange={e => draft.change(workId,e.target.value)} />}</details>}
                {mark && <section className={"exam-feedback "+(mark.correct ? "right" : "wrong")} aria-label={"第 "+n+" 题反馈"}>
                  <h3>{mark.correct ? "答对 · 2 分" : "答错 · 0 分"}</h3>
                  <p><b>正确答案　</b><span dangerouslySetInnerHTML={{ __html: mark.answer }} /></p>
                  {question.fields.length > 1 && <dl className="exam-field-key">{question.fields.map((f,fi) => <div key={f.id}><dt>{f.label}</dt>
                    <dd>{f.kind === "path" ? "见参考作图" : number === 7 && n === 40 && fi === 0 ? "第 6 行的任一格点" : <ReferenceValue value={mark.fieldAnswers[fi]} />}{f.unit && " "+f.unit}</dd></div>)}</dl>}
                  <p><b>解析　</b><span dangerouslySetInnerHTML={{ __html: mark.explanation }} /></p>
                  {mark.figure && <figure dangerouslySetInnerHTML={{ __html: mark.figure }} />}
                </section>}
              </li>;
            })}</ol>
          </section>;
        })}
      </article>
      {!result && <section className="exam-submit" id="exam-submit">
        <h2>提交整卷</h2>
        <p>{missing ? <>还差 {50-count} 题。<a href={"#q"+missing}>去做第 {missing} 题</a></> : "50 题已答完，交卷后锁定本卷作答。"}</p>
        <button className="exam-primary" type="submit" disabled={locked || count !== 50}>{draft.sending ? "正在交卷…" : "交卷并查看成绩"}</button>
      </section>}
    </form>
    {draft.failure && <aside role="alert" className="exam-save-error">{draft.failure}
      {draft.conflict ? <><button type="button" onClick={() => draft.resolve(true)}>保留我的修改</button><button type="button" onClick={() => draft.resolve(false)}>采用云端作答</button></>
        : <button type="button" onClick={() => void draft.retry()}>重试保存</button>}</aside>}
    <nav className="exam-end"><Link href={directory} prefetch={false}>← 全部试卷</Link><a href="#part-1" onClick={() => setOnlyWrong(false)}>回到试卷开头 ↑</a></nav>
  </>;
}
