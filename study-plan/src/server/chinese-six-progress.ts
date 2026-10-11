import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { ensureCloudProgressSchema } from "@/lib/cloud-progress-schema";
import { localDataFallbackAllowed } from "@/lib/local-fallback";
import { emptySixProgress, rateSixResponse, recordSixResponse, sixAttemptStats, type SixProgress, type SixFeedback, type SixResponse } from "@/lib/chinese-six";
import { sixFeedback, sixPrivateItem } from "./chinese-six-bank";

const scope = "chinese:six:v1";
let localQueue: Promise<unknown> = Promise.resolve();

export type SixAction = { action: "start" | "answer" | "rate" | "review"; itemId: string; attemptId?: string; questionId?: string; value?: string; score?: SixResponse["selfScore"] };

export function transitionSixProgress(state: SixProgress, input: SixAction): SixProgress {
  const item = sixPrivateItem(input.itemId);
  if (!item) throw new Error("没有找到学习内容。");
  const now = new Date().toISOString();
  if (input.action === "review") return { ...state, reviewed: [...new Set([...state.reviewed, item.id])] };
  if (input.action === "start") {
    if (Object.keys(state.attempts).length >= 1000) throw new Error("练习记录已达上限，请先联系家长导出。");
    const id = randomUUID();
    return { ...state, current: { ...state.current, [item.id]: id }, attempts: { ...state.attempts,
      [id]: { id, itemId: item.id, startedAt: now, responses: {} } } };
  }
  const attempt = input.attemptId ? state.attempts[input.attemptId] : undefined;
  if (!attempt || attempt.itemId !== item.id || state.current[item.id] !== attempt.id) throw new Error("练习记录已变化，请刷新页面。");
  const question = item.questions.find(q => q.id === input.questionId);
  if (!question) throw new Error("没有找到这道题。");
  const updated = input.action === "answer"
    ? recordSixResponse(attempt, question, input.value ?? "", question.answer, now)
    : input.action === "rate" ? rateSixResponse(attempt, question.id, input.score)
    : (() => { throw new Error("无效操作。"); })();
  if (sixAttemptStats(updated, item.questions.length).complete) updated.finishedAt ??= now;
  return { ...state, attempts: { ...state.attempts, [updated.id]: updated } };
}

async function localState(studentId: string, action?: SixAction): Promise<SixProgress> {
  const file = path.join(process.cwd(), ".temp", "chinese-six-progress", `${studentId}.json`);
  const run = localQueue.catch(() => undefined).then(async () => {
    let current = emptySixProgress();
    try { current = JSON.parse(await readFile(file, "utf8")) as SixProgress; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (!action) return current;
    const next = transitionSixProgress(current, action);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next), "utf8");
    await rename(temp, file);
    return next;
  });
  localQueue = run;
  return run;
}

export async function sixStudentProgress(studentId: string, action?: SixAction) {
  // Fallback is restricted to development or an explicitly configured local host.
  try { await ensureCloudProgressSchema(); }
  catch (error) {
    if (!localDataFallbackAllowed()) throw error;
    return { progress: await localState(studentId, action), storage: "local" as const };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${studentId}:${scope}`]);
    const result = await client.query("SELECT payload FROM student_cloud_state WHERE student_id=$1 AND scope=$2", [studentId, scope]);
    const state = (result.rows[0]?.payload ?? emptySixProgress()) as SixProgress;
    const next = action ? transitionSixProgress(state, action) : state;
    if (action) await client.query(
      "INSERT INTO student_cloud_state(student_id,scope,payload,updated_at) VALUES($1,$2,$3::jsonb,NOW()) ON CONFLICT(student_id,scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()",
      [studentId,scope,JSON.stringify(next)]);
    await client.query("COMMIT");
    return { progress: next, storage: "cloud" as const };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export function sixSubmittedFeedback(progress: SixProgress, itemId?: string) {
  const feedback: Record<string, Record<string, SixFeedback>> = {};
  for (const attempt of Object.values(progress.attempts)) {
    if (itemId && itemId !== attempt.itemId) continue;
    feedback[attempt.id] = {};
    for (const id of Object.keys(attempt.responses)) {
      const result = sixFeedback(attempt.itemId, id);
      if (result) feedback[attempt.id][id] = result;
    }
  }
  return feedback;
}
