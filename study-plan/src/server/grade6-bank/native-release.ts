import "server-only";
import { createHash, createDecipheriv, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BankInput, BankQuestion } from "@/lib/grade6-bank-types";
import type { BankNativeContent } from "@/lib/grade6-bank-native-types";
import type { BankPrivateAnswer } from "@/lib/grade6-bank-grader";
import { assertBankNative } from "@/lib/grade6-bank-native-validation";

type NativeRow = { id: string; inputs: BankInput[]; native: BankNativeContent };
type NativeRelease = { version: 1; total: number; baseDigest: string; questions: NativeRow[] };
type LoadedRelease = { digest: string; rows: Map<string, NativeRow> };
type SealedNative = { version: number; publicDigest: string; salt: string; iv: string; tag: string; ciphertext: string };
const root = path.join(process.cwd(), "content", "grade6-bank");
let releasePromise: Promise<LoadedRelease | null> | null = null;
let answerPromise: Promise<Map<string, BankPrivateAnswer> | null> | null = null;
let sealedPromise: Promise<SealedNative> | null = null;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function sealedAnswers() {
  sealedPromise ??= readFile(path.join(root, "sealed", "native-answers.encrypted.json"), "utf8").then((raw) => JSON.parse(raw) as SealedNative);
  return sealedPromise;
}

/** Only a complete, verified release file may activate native mode. No per-question fallback. */
async function release(): Promise<LoadedRelease | null> {
  releasePromise ??= (async () => {
    let raw: string;
    try { raw = await readFile(path.join(root, "questions.native.public.json"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const [baseRaw, manifestRaw] = await Promise.all([
      readFile(path.join(root, "questions.public.json"), "utf8"), readFile(path.join(root, "manifest.json"), "utf8"),
    ]);
    const data = JSON.parse(raw) as NativeRelease;
    const base = JSON.parse(baseRaw) as BankQuestion[];
    const total = JSON.parse(manifestRaw).total;
    if (Object.keys(data).some((key) => !["version", "total", "baseDigest", "questions"].includes(key)) || data.version !== 1 || total !== 2394 || data.total !== total || data.baseDigest !== sha(baseRaw + "\n" + manifestRaw) || !Array.isArray(data.questions) || data.questions.length !== total) throw new Error("原生题库尚未完成全库验收");
    const ids = new Set(base.map((row) => row.id)), rows = new Map<string, NativeRow>();
    for (const row of data.questions) {
      if (Object.keys(row).some((key) => !["id", "inputs", "native"].includes(key)) || !ids.has(row.id) || rows.has(row.id)) throw new Error("原生题目对应错误");
      assertBankNative(row.inputs, row.native); rows.set(row.id, row);
    }
    const digest = sha(raw), sealed = await sealedAnswers();
    if (sealed.version !== 1 || sealed.publicDigest !== digest || Buffer.from(sealed.salt, "base64").length !== 16 || Buffer.from(sealed.iv, "base64").length !== 12 || Buffer.from(sealed.tag, "base64").length !== 16 || !sealed.ciphertext) throw new Error("Invalid sealed native bank");
    return { digest, rows };
  })();
  return releasePromise;
}

export async function nativeBankQuestion(question: BankQuestion): Promise<BankQuestion> {
  const data = await release();
  if (!data) return question;
  const row = data.rows.get(question.id);
  if (!row) throw new Error("原生题目缺失");
  // A paired filename/header alone is not proof of usable grading data. Verify
  // authenticated decryption and full private coverage before showing native
  // fields; a malformed release must fail closed, not become an ungradable UI.
  if (!(await nativeBankAnswer(question.id))) throw new Error("原生答案缺失");
  // All original identifiers, numbering, collection and difficulty remain unchanged.
  return { ...question, inputs: row.inputs, native: row.native, questionImages: [] };
}

export async function nativeBankAnswer(id: string): Promise<BankPrivateAnswer | null> {
  answerPromise ??= (async () => {
    const data = await release();
    if (!data) return null;
    const sealed = await sealedAnswers();
    const salt = Buffer.from(sealed.salt, "base64"), iv = Buffer.from(sealed.iv, "base64"), tag = Buffer.from(sealed.tag, "base64");
    if (sealed.version !== 1 || sealed.publicDigest !== data.digest || salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid sealed native bank");
    const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("判题服务尚未配置");
    const key = scryptSync(secret, Buffer.concat([Buffer.from("grade6-native-v1:"), salt]), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from("grade6-native-v1:answers:" + data.digest)); decipher.setAuthTag(tag);
    const rows = JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8")) as BankPrivateAnswer[];
    if (!Array.isArray(rows) || rows.length !== data.rows.size || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("原生答案覆盖不完整");
    for (const row of rows) {
      const publicRow = data.rows.get(row.id);
      if (Object.keys(row).some((key) => !["id", "rules", "reviewRequired", "answerText", "answerStatus", "answerImages"].includes(key)) || !publicRow || row.answerStatus !== "verified_native" || typeof row.reviewRequired !== "boolean" || typeof row.answerText !== "string" || !row.answerText.trim() || !Array.isArray(row.answerImages) || row.answerImages.length || !Array.isArray(row.rules)) throw new Error("原生答案不匹配");
      const inputIds = new Set(publicRow.inputs.map((field) => field.id));
      if (row.rules.some((rule) => Object.keys(rule).some((key) => !["id", "expected", "numeric", "unit"].includes(key)) || !inputIds.has(rule.id) || !Array.isArray(rule.expected) || !rule.expected.length || rule.expected.some((value) => typeof value !== "string" || !value.trim()) || (rule.numeric !== undefined && typeof rule.numeric !== "boolean") || (rule.unit !== undefined && (typeof rule.unit !== "string" || !rule.unit.trim())) || (publicRow.inputs.find((field) => field.id === rule.id)?.kind === "choice" && rule.expected.some((value) => !publicRow.inputs.find((field) => field.id === rule.id)?.choices?.includes(value)))) || new Set(row.rules.map((rule) => rule.id)).size !== row.rules.length || (!row.reviewRequired && (row.rules.length !== inputIds.size || publicRow.inputs.some((field) => field.kind === "drawing")))) throw new Error("原生判分字段不匹配");
    }
    return new Map(rows.map((row) => [row.id, row]));
  })();
  return (await answerPromise)?.get(id) ?? null;
}
