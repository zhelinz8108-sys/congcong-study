import "server-only";
import type { PoolClient } from "pg";

import { pool } from "@/lib/db";
import { ensureCloudProgressSchema } from "@/lib/cloud-progress-schema";
import { firstSubmissions, saveFirstSubmission } from "@/server/first-submission";
import { englishSixGrade } from "@/server/english-six";
import { englishSixBankGrade } from "@/server/english-six-bank";
import { englishSixQualityRevision, englishSixReviewedFeedback } from "@/server/english-six-quality";
import { gradeFinalReviewLocked } from "@/server/english-final-review-lock";
import { gradeVocabLocked } from "@/server/english-vocab-lock";
import { gradeListeningPanelLocked } from "@/server/english-listening-panel-lock";
import { listEnglishPracticeBlocks } from "@/server/national-day-english-practice/public-bank";
import { gradeEnglishPracticeQuestion } from "@/server/national-day-english-practice/service";
import { NATIONAL_DAY_SECTIONS } from "@/lib/national-day-english";
import { checkNationalDayAnswer } from "@/lib/national-day-english-answer";
import { getGrammarLesson, getGrammarStage } from "@/lib/grammar-course";
import { ORIGINAL_GRAMMAR_QUESTIONS, buildOriginalGrammarExplanation } from "@/lib/grammar-original-500";
import { TENSE_GRAMMAR_QUESTIONS, buildTenseGrammarExplanation } from "@/lib/grammar-tense-500";
import { GRAMMAR_QUIZ } from "@/lib/english-grammar-guide";
import { QUICK_CHALLENGES } from "@/lib/english-sentence-structure";
import listeningData from "@/data/listening/yiben-grade-6.json";
import type { ListeningBook } from "@/lib/listening-yiben-types";
import type { EnglishLockedAnswer, EnglishLockedFeedback, EnglishLockedModule, EnglishLockedRecord } from "@/lib/english-locked-types";

const modules = new Set<EnglishLockedModule>(["six", "holiday2400", "national-day", "grammar-original", "grammar-tense", "grammar-course", "grammar-stage", "listening", "grammar-guide", "sentence-structure", "final-review", "vocab", "listening-panel"]);
const listening = listeningData as ListeningBook;
type Legacy = { answer: EnglishLockedAnswer; feedback: EnglishLockedFeedback; submittedAt?: string };

export function englishLockedModule(value: unknown): value is EnglishLockedModule { return typeof value === "string" && modules.has(value as EnglishLockedModule); }
export const englishLockedScope = (module: EnglishLockedModule) => `english:locked:${module}:v1`;
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (answer: EnglishLockedAnswer): string => {
  if (typeof answer !== "string" || !answer.trim() || answer.length > 10000) throw new Error("请先完成本题");
  return answer;
};
const normalize = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[\s.,，。;；:：、'"“”‘’()（）\-_]/g, "");

export function gradeEnglishLocked(module: EnglishLockedModule, id: string, response: EnglishLockedAnswer): EnglishLockedFeedback {
  if (module === "grammar-guide" || module === "sentence-structure") {
    const match = (module === "grammar-guide" ? /^gg-([1-9]\d*)$/ : /^ss-([1-9]\d*)$/).exec(id);
    const question = match && (module === "grammar-guide" ? GRAMMAR_QUIZ : QUICK_CHALLENGES)[Number(match[1]) - 1];
    if (!question || !/^\d+$/.test(text(response)) || Number(response) >= question.choices.length) throw new Error("题目或选项不正确");
    return { correct: Number(response) === question.answer, answer: `${String.fromCharCode(65 + question.answer)}. ${question.choices[question.answer]}`, explanation: question.explanation };
  }
  if (module === "six") {
    const unit = /^u([1-8])-q([1-9]\d*)$/.exec(id);
    const feedback = unit ? englishSixGrade(Number(unit[1]), id, text(response)) : englishSixBankGrade(id, text(response));
    if (!feedback) throw new Error("题目或答案格式不正确");
    return { correct: feedback.correct, answer: feedback.answer, explanation: feedback.explanation,
      ...(englishSixQualityRevision(id) ? { contentRevision: englishSixQualityRevision(id) } : {}) };
  }
  if (module === "holiday2400") {
    const match = /^(CH(?:0[1-9]|1\d|2[0-4]))-Q(00[1-9]|0[1-9]\d|100)$/.exec(id);
    if (!match || !/^[ABCD]$/.test(text(response))) throw new Error("题目或答案格式不正确");
    const page = listEnglishPracticeBlocks({ chapter: match[1], page: Math.ceil(Number(match[2]) / 10) });
    const block = page.blocks.find(block => block.questions.some(question => question.id === id));
    if (!block) throw new Error("题目不存在");
    const result = gradeEnglishPracticeQuestion(block.id, id, { [id]: response }).results[0];
    return { correct: result.correct, answer: `${result.correctOption}. ${result.correctText}`, explanation: result.explanation };
  }
  if (module === "national-day") {
    const writing = /^writing:(.+)$/.exec(id);
    if (writing) {
      const section = NATIONAL_DAY_SECTIONS.find(section => section.id === writing[1] && section.writing);
      if (!section) throw new Error("写作任务不存在");
      text(response);
      return { correct: null, answer: (section.writing!.referenceBlocks ?? []).filter(block => block.type !== "table").map(block => "text" in block ? block.text : "").join("\n"), explanation: "写作原文已锁定，待教师评价，不计入自动判题正确率。" };
    }
    const question = NATIONAL_DAY_SECTIONS.flatMap(section => [...section.questions, ...(section.oralQuestions ?? [])]).find(question => question.id === id);
    const count = question?.mode === "auto" ? question.accepted.length : 1;
    if (!question || !Array.isArray(response) || response.length !== count || response.some(value => typeof value !== "string" || !value.trim() || value.length > 10000)) throw new Error("请完成本题所有答案");
    return { correct: question.mode === "auto" ? checkNationalDayAnswer(response, question.accepted) : null, answer: question.reference, explanation: question.mode === "self" ? "开放表达已锁定，待教师评价，不计入自动判题正确率。" : "请结合参考答案检查对应语法规则。" };
  }
  if (module === "grammar-original" || module === "grammar-tense") {
    const bank = module === "grammar-original" ? ORIGINAL_GRAMMAR_QUESTIONS : TENSE_GRAMMAR_QUESTIONS;
    const question = bank.find(question => String(question.id) === id);
    if (!question || !/^[ABCD]$/.test(text(response))) throw new Error("题目或选项不正确");
    const explanation = module === "grammar-original" ? buildOriginalGrammarExplanation(question) : buildTenseGrammarExplanation(question as typeof TENSE_GRAMMAR_QUESTIONS[number]);
    return { correct: response === question.answer, answer: `${question.answer}. ${question.answerText}`, explanation: `${explanation.rule}\n${explanation.reason}\n正确表达：${explanation.correctSentence}\n易错提醒：${explanation.trap}` };
  }
  if (module === "grammar-course") {
    const match = /^lesson:([1-9]\d*):(task|deep|quiz):(0|[1-9]\d*)$/.exec(id);
    const lesson = match && getGrammarLesson(Number(match[1]));
    const item = lesson && (match![2] === "task" ? lesson.tasks : match![2] === "deep" ? lesson.deepPractice : lesson.quiz.map(([prompt, answer]) => ({ prompt, answer })))[Number(match![3])];
    if (!item) throw new Error("语法任务不存在");
    text(response);
    return { correct: null, answer: item.answer, explanation: "首次作答已保存。此题需要结合表达与理由复核，不计入自动判题正确率。" };
  }
  if (module === "grammar-stage") {
    const match = /^stage:([1-9]\d*):(question:(?:0|[1-9]\d*)|writing)$/.exec(id);
    const stage = match && getGrammarStage(Number(match[1]));
    if (!stage) throw new Error("阶段任务不存在");
    text(response);
    const item = match![2] === "writing" ? { answer: stage.review.check } : stage.review.questions[Number(match![2].split(":")[1])];
    if (!item) throw new Error("阶段题目不存在");
    return { correct: null, answer: item.answer, explanation: "首次作答已锁定，待教师评价，不计入自动判题正确率。" };
  }
  if (module === "listening") {
    const exercise = listening.exercises.find(exercise => String(exercise.number).padStart(3, "0") === id);
    const answers = object(response);
    const items = exercise?.sections.flatMap(section => section.items) ?? [];
    if (!exercise || !answers || Object.keys(answers).length !== items.length || items.some(item => !(item.id in answers))) throw new Error("请完成本篇全部题目");
    let score = 0;
    const itemResults: NonNullable<EnglishLockedFeedback["itemResults"]> = {};
    for (const item of items) {
      const value = answers[item.id];
      let correct = false;
      if (item.type === "multi_choice") {
        if (!Array.isArray(value) || value.length === 0 || value.some(letter => typeof letter !== "string" || !/^[A-G]$/.test(letter))) throw new Error("答案格式不正确");
        const expected = [...new Set(item.answer.toUpperCase().match(/[A-G]/g) ?? [])].sort();
        correct = [...new Set(value)].sort().join("") === expected.join("");
      } else {
        if (typeof value !== "string" || !value.trim() || value.length > 1000) throw new Error("请完成本篇全部题目");
        const candidates = item.answer.split(/\s*(?:\||；|;|或)\s*/).flatMap(candidate => {
          if (!candidate.includes("/")) return [candidate];
          const [left, right] = candidate.split("/", 2), suffix = right.match(/^\S+\s+(.+)$/)?.[1];
          return suffix ? [candidate, `${left} ${suffix}`, right] : [candidate, left, right];
        });
        correct = candidates.some(candidate => normalize(candidate) === normalize(value));
      }
      if (correct) score++;
      itemResults[item.id] = { correct, answer: item.answer };
    }
    return { correct: score === items.length, score, total: items.length, itemResults, answer: items.map(item => `${item.label}：${item.answer}`).join("\n"), explanation: exercise.transcript };
  }
  throw new Error("无效的练习模块");
}

export async function gradeEnglishLockedAsync(module: EnglishLockedModule, id: string, response: EnglishLockedAnswer, client?: Pick<PoolClient, "query">): Promise<EnglishLockedFeedback> {
  if (module === "final-review") return gradeFinalReviewLocked(id, response);
  if (module === "vocab") return gradeVocabLocked(id, response, client);
  if (module === "listening-panel") return gradeListeningPanelLocked(id, response, client);
  return gradeEnglishLocked(module, id, response);
}

async function legacyRecords(studentId: string, module: EnglishLockedModule): Promise<Record<string, Legacy>> {
  let scopePattern: string;
  if (module === "holiday2400") scopePattern = "english:holiday2400:%:v1";
  else if (module === "national-day") scopePattern = "english:national-day:%:v1";
  else if (module === "listening") scopePattern = "listening:yiben-grade6:v1";
  else return {};
  await ensureCloudProgressSchema();
  // A question's identity is independent of a URL's subject parameter. Read all
  // historic subject aliases so changing that parameter cannot unlock an answer.
  const data = await pool.query("SELECT payload, updated_at FROM student_cloud_state WHERE student_id=$1 AND scope LIKE $2 ORDER BY updated_at ASC, scope ASC", [studentId, scopePattern]);
  const result: Record<string, Legacy> = {};
  for (const row of data.rows) {
  const payload = object(row.payload);
  if (!payload) continue;
  const saved = object(module === "listening" ? payload.exercises : payload.attempts) ?? {};
  for (const [id, raw] of Object.entries(saved)) {
    if (result[id]) continue;
    const value = object(raw);
    if (!value || (module === "national-day" ? !value.checked : module === "listening" ? !value.submitted : typeof value.selected !== "string")) continue;
    const response = module === "holiday2400" ? value.selected : module === "national-day" ? value.values : value.answers;
    try {
      const feedback = gradeEnglishLocked(module, id, response as EnglishLockedAnswer);
      // Keep the recorded outcome; newly stricter graders must not rewrite historic scores.
      if (module !== "listening" && typeof value.correct === "boolean") feedback.correct = value.correct;
      if (module === "listening" && typeof value.score === "number") { feedback.score = value.score; feedback.total = typeof value.total === "number" ? value.total : feedback.total; feedback.correct = feedback.score === feedback.total; }
      if (value.selfRated === true) feedback.correct = null;
      result[id] = { answer: response as EnglishLockedAnswer, feedback, submittedAt: typeof value.at === "string" ? value.at : typeof value.updatedAt === "string" ? value.updatedAt : new Date(row.updated_at).toISOString() };
    } catch { /* Unknown or malformed legacy rows are not imported as answers. */ }
  }
  }
  return result;
}

function publicRecord(module: EnglishLockedModule, id: string, saved: { answer: EnglishLockedAnswer; feedback: EnglishLockedFeedback; submittedAt?: string }): EnglishLockedRecord {
  const feedback = module === "six" ? englishSixReviewedFeedback(id, saved.feedback, () => gradeEnglishLocked(module, id, saved.answer)) : saved.feedback;
  return { id, response: saved.answer, feedback, submittedAt: saved.submittedAt ?? "" };
}
export async function englishLockedRecords(studentId: string, module: EnglishLockedModule, subjectId: string) {
  void subjectId; // Kept for the URL/API contract; never used as a lock namespace.
  const legacy = await legacyRecords(studentId, module);
  const saved = await firstSubmissions<EnglishLockedAnswer, EnglishLockedFeedback>(studentId, englishLockedScope(module));
  return Object.fromEntries(Object.entries({ ...legacy, ...saved }).map(([id, record]) => [id, publicRecord(module, id, record)]));
}
export async function englishLockedSubmit(studentId: string, module: EnglishLockedModule, subjectId: string, id: string, response: EnglishLockedAnswer) {
  if (!id || id.length > 200 || /[\u0000-\u001f]/.test(id)) throw new Error("题目编号不正确");
  const legacy = (await legacyRecords(studentId, module))[id];
  const saved = await saveFirstSubmission<EnglishLockedAnswer, EnglishLockedFeedback>(studentId, englishLockedScope(module), id, response, async (answer, client) => gradeEnglishLockedAsync(module, id, answer, client), legacy);
  return publicRecord(module, id, saved);
}
