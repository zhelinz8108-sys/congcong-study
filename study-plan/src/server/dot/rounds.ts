import "server-only";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

export const isRoundId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

const activityNames: Record<string, string> = {
  "math:grade-six:v1": "六上数学", "math:generated:v1": "数学专项练习",
  "math:holiday700:v1": "数学假期练习", "math:national-day:v1": "数学国庆练习",
  "chinese:reading:attempts:v1": "语文阅读",
};
const englishNames: Record<string, string> = {
  six: "六上英语", vocab: "英语单词", holiday2400: "英语假期练习", "national-day": "英语国庆练习",
  listening: "英语听力", "listening-panel": "英语听力", "final-review": "英语期末复习",
  "grammar-original": "英语语法原题", "grammar-tense": "英语时态", "grammar-course": "英语语法课程",
  "grammar-stage": "英语语法测试", "grammar-guide": "英语语法", "sentence-structure": "英语句子结构",
};

export function submissionActivity(scope: string) {
  const moduleName = /^english:locked:([a-z0-9-]+):v1(?:$|:session:)/.exec(scope)?.[1];
  return moduleName ? englishNames[moduleName] : activityNames[scope];
}

// Called only when a new answer has been graded, on the same transaction as that answer.
export async function recordPracticeAnswer(client: PoolClient, student: string, activity: string, key?: string | null, count = 1) {
  const session = isRoundId(key) ? key : "automatic";
  await client.query(`
    INSERT INTO practice_rounds(student_id,activity,session_key,answered,due_at)
    VALUES ($1,$2,$3,$4,now()+interval '20 minutes')
    ON CONFLICT (student_id,activity,session_key) WHERE finished_at IS NULL
    DO UPDATE SET answered=practice_rounds.answered+EXCLUDED.answered, due_at=EXCLUDED.due_at
  `, [student, activity, session, count]);
}

export async function finishPaper(client: PoolClient, student: string, attempt: string) {
  const counted = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM math_responses WHERE attempt_id=$1 AND btrim(response_text)<>''", [attempt]);
  const count = counted.rows[0].count;
  if (!count) return;
  const round = await client.query(`INSERT INTO practice_rounds(student_id,activity,session_key,answered,due_at)
    VALUES ($1,'数学试卷',$2,$3,now()) RETURNING id`, [student, "paper:" + attempt, count]);
  await client.query("UPDATE practice_rounds SET finished_at=now() WHERE id=$1", [round.rows[0].id]);
}

export async function updatePracticeRound(student: string, session: string, finish: boolean) {
  const update = finish ? "finished_at=now()" : "due_at=now()+interval '20 minutes'";
  await pool.query(`UPDATE practice_rounds SET ${update} WHERE student_id=$1 AND session_key=$2 AND finished_at IS NULL`, [student, session]);
}
