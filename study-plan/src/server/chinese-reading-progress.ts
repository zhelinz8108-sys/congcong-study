import "server-only";
import { pool } from "@/lib/db";
import { ensureCloudProgressSchema } from "@/lib/cloud-progress-schema";
import { firstSubmissions, saveFirstSubmission } from "./first-submission";
import { CHINESE_READING_PASSAGES, getChineseReadingPassage, getChineseReadingTopic, gradeChineseReadingQuestion } from "@/lib/chinese-reading";
import type { ReadingFeedback, ReadingMistake, ReadingPublicPassage, ReadingSubmission } from "@/lib/chinese-reading-model";

export const CHINESE_READING_SCOPE = "chinese:reading:attempts:v1";
const legacyScope = "chinese:reading:mistakes:v1";

export function readingPublicPassage(id: string): ReadingPublicPassage | undefined {
  const passage = getChineseReadingPassage(id);
  if (!passage) return undefined;
  return { ...passage, questions: passage.questions.map(({ id, type, prompt, options }) => ({ id, type, prompt, ...(options ? { options } : {}) })) };
}

export function gradeReadingSubmission(passageId: string, questionId: string, value: string): ReadingFeedback {
  const question = getChineseReadingPassage(passageId)?.questions.find(q => q.id === questionId);
  if (!question) throw new Error("没有找到这道题。");
  if (!value.trim() || value.length > 8000) throw new Error("请填写答案（最多 8000 字）。");
  if (question.type === "choice" && !question.options?.includes(value)) throw new Error("请选择有效选项。");
  return { answer: question.answer, scoringPoints: question.scoringPoints, template: question.template,
    explanation: question.explanation, mistakeTags: question.mistakeTags, isCorrect: gradeChineseReadingQuestion(question, value) };
}

// Old reading only saved mistakes, not every answer. Keep those retained answers
// locked; do not invent scores for the historical answers that were never saved.
async function retainedLegacyMistakes(studentId: string): Promise<ReadingMistake[]> {
  // A failed history read is not evidence of no history, even in development.
  await ensureCloudProgressSchema();
  const result = await pool.query("SELECT payload FROM student_cloud_state WHERE student_id=$1 AND scope=$2", [studentId, legacyScope]);
  return Array.isArray(result.rows[0]?.payload) ? result.rows[0].payload : [];
}

function legacySubmission(record: ReadingMistake): ReadingSubmission | undefined {
  const question = getChineseReadingPassage(record.passageId)?.questions.find(q => q.id === record.questionId);
  if (!question || typeof record.response !== "string" || !record.response.trim()) return undefined;
  return { answer: record.response, submittedAt: record.updatedAt || new Date(0).toISOString(),
    feedback: { answer: question.answer, scoringPoints: question.scoringPoints, template: question.template,
      explanation: question.explanation, mistakeTags: question.mistakeTags,
      // These legacy entries are retained mistakes, not new submissions. Keep
      // their recorded wrong outcome even if today's answer rules differ.
      isCorrect: question.type === "short" ? null : false } };
}

export async function readingStudentResults(studentId: string, passageId?: string) {
  const saved = await firstSubmissions<string, ReadingFeedback>(studentId, CHINESE_READING_SCOPE);
  const legacy = await retainedLegacyMistakes(studentId);
  const records: Record<string, ReadingSubmission> = {};
  for (const record of [...legacy].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""))) {
    const submission = legacySubmission(record);
    if (submission && !records[record.questionId]) records[record.questionId] = submission;
  }
  Object.assign(records, saved);
  if (passageId) {
    const passage = getChineseReadingPassage(passageId);
    if (!passage) throw new Error("没有找到阅读材料。");
    const ids = new Set(passage.questions.map(q => q.id));
    return { records: Object.fromEntries(Object.entries(records).filter(([id]) => ids.has(id))) };
  }
  const mistakes: ReadingMistake[] = [];
  for (const passage of CHINESE_READING_PASSAGES) for (const question of passage.questions) {
    const record = records[question.id];
    if (!record || record.feedback.isCorrect === true) continue;
    mistakes.push({ id: question.id, passageId: passage.id, passageTitle: passage.title, topicKey: passage.topicKey,
      topicName: getChineseReadingTopic(passage.topicKey).name, questionId: question.id, questionPrompt: question.prompt,
      response: record.answer, answer: record.feedback.answer, mistakeTags: record.feedback.mistakeTags,
      scoringPoints: record.feedback.scoringPoints, updatedAt: record.submittedAt });
  }
  return { records, mistakes };
}

export async function submitReadingResponse(studentId: string, passageId: string, questionId: string, value: string) {
  gradeReadingSubmission(passageId, questionId, value); // Validate before any persistence.
  const legacy = (await retainedLegacyMistakes(studentId)).filter(r => r.passageId === passageId && r.questionId === questionId)
    .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""))[0];
  const result = await saveFirstSubmission<string, ReadingFeedback>(studentId, CHINESE_READING_SCOPE, questionId, value.trim(),
    answer => gradeReadingSubmission(passageId, questionId, answer), legacy ? legacySubmission(legacy) : undefined);
  return { ...result, ...(await readingStudentResults(studentId, passageId)) };
}
