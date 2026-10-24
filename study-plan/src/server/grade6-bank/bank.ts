import "server-only";
import { createDecipheriv, createHash, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BankManifest, BankQuestion } from "@/lib/grade6-bank-types";
import type { BankPrivateAnswer } from "@/lib/grade6-bank-grader";
import { nativeBankQuestion, nativeBankAnswer } from "./native-release";
import { activeBankManifest, isRetiredBankQuestion, RAW_BANK_MANIFEST_SHA256 } from "./retired-duplicates";
import { buildBankResultPlan, type BankResultPlan } from "./result-plan";
import { applyBankResultDescriptor, bankFractionGroups } from "./result-descriptor";
import { getBankResultDescriptor, verifyBankResultDescriptors } from "./result-descriptors";
export { isRetiredBankQuestion } from "./retired-duplicates";

const root = path.join(process.cwd(), "content", "grade6-bank");
let manifestPromise: Promise<BankManifest> | null = null;
let activeManifestPromise: Promise<BankManifest> | null = null;
let questionsPromise: Promise<Map<string, BankQuestion>> | null = null;
let answersPromise: Promise<Map<string, BankPrivateAnswer>> | null = null;
let privateKeyPromise: Promise<Buffer> | null = null;
const resultPlans = new Map<string, BankResultPlan | null>();
const resultQuestions = new Map<string, Promise<BankQuestion>>();

type SealedAnswers = { version: number; salt: string; iv: string; tag: string; ciphertext: string };
let sealedAnswersPromise: Promise<SealedAnswers> | null = null;
function sealedAnswers() {
  sealedAnswersPromise ??= readFile(path.join(root, "sealed", "answers.encrypted.json"), "utf8").then((raw) => {
    const data = JSON.parse(raw) as SealedAnswers;
    if (data.version !== 1 || Buffer.from(data.salt, "base64").length !== 16) throw new Error("Invalid sealed bank");
    return data;
  });
  return sealedAnswersPromise;
}
async function privateKey() {
  privateKeyPromise ??= sealedAnswers().then((data) => {
    const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("判题服务尚未配置");
    return scryptSync(secret, Buffer.concat([Buffer.from("grade6-bank-v1:"), Buffer.from(data.salt, "base64")]), 32);
  });
  return privateKeyPromise;
}
async function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer, aad: string) {
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid sealed asset");
  const decipher = createDecipheriv("aes-256-gcm", await privateKey(), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function rawBankManifest() {
  manifestPromise ??= readFile(path.join(root, "manifest.json"), "utf8").then((raw) => {
    if (createHash("sha256").update(raw).digest("hex") !== RAW_BANK_MANIFEST_SHA256) throw new Error("Bank retirement source changed");
    return JSON.parse(raw) as BankManifest;
  });
  return manifestPromise;
}
export function getBankManifest() {
  activeManifestPromise ??= rawBankManifest().then(activeBankManifest);
  return activeManifestPromise;
}
export async function getBankQuestion(id: string) {
  if (isRetiredBankQuestion(id)) return undefined;
  return getArchivedBankQuestion(id);
}
/** Server-only archive lookup for an authenticated learner's already-submitted
 * feedback. Public practice and every writing route must use getBankQuestion. */
export async function getArchivedBankQuestion(id: string) {
  questionsPromise ??= readFile(path.join(root, "questions.public.json"), "utf8").then((raw) => new Map((JSON.parse(raw) as BankQuestion[]).map((q) => [q.id, q])));
  const question = (await questionsPromise).get(id);
  if (!question) return undefined;
  let pending = resultQuestions.get(id);
  if (!pending) {
    pending = prepareBankResultQuestion(question);
    resultQuestions.set(id, pending);
  }
  return pending;
}
async function prepareBankResultQuestion(question: BankQuestion): Promise<BankQuestion> {
  const id = question.id;
  let native = await nativeBankQuestion(question);
  if (!resultPlans.has(id)) {
    const answer = await nativeBankAnswer(id);
    let plan = answer && !isRetiredBankQuestion(id) ? buildBankResultPlan(native, answer) : null;
    const descriptor = !isRetiredBankQuestion(id) ? await getBankResultDescriptor(id) : undefined;
    if (answer && descriptor) {
      await verifyBankResultDescriptors();
      const described = applyBankResultDescriptor(native, answer, descriptor);
      native = described.question; plan = described.plan;
    }
    if (plan) plan = { ...plan, fractionGroups: bankFractionGroups(native, plan) };
    resultPlans.set(id, plan);
  }
  const plan = resultPlans.get(id);
  if (!plan?.ready) return native;
  const results = new Set(plan.resultInputIds);
  const presented: BankQuestion = { ...native, resultInputIds: plan.resultInputIds, inputs: native.inputs.map(field => ({
    ...field,
    label: results.has(field.id)
      ? field.label.replace(/过程与答案|过程与说明|过程及答案|解题过程|解答过程|计算过程|运算过程|竖式过程|过程/g, "最终结果")
      : `${field.label}（选填，不计分）`,
  })) };
  return presented;
}
export async function getBankResultPlan(id: string): Promise<BankResultPlan | null> {
  if (!resultPlans.has(id)) await getArchivedBankQuestion(id);
  return resultPlans.get(id) ?? null;
}
export async function getPrivateBankAnswer(id: string) {
  const native = await nativeBankAnswer(id);
  if (native) return native;
  answersPromise ??= sealedAnswers().then(async (data) => {
    const bytes = await decrypt(Buffer.from(data.ciphertext, "base64"), Buffer.from(data.iv, "base64"), Buffer.from(data.tag, "base64"), "grade6-bank-v1:answers");
    const rows = JSON.parse(bytes.toString("utf8")) as BankPrivateAnswer[];
    const manifest = await rawBankManifest();
    if (rows.length !== manifest.total || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("判题数据不完整");
    return new Map(rows.map((row) => [row.id, row]));
  });
  return (await answersPromise).get(id);
}
export async function readBankImage(relative: string, privacy: "public" | "private") {
  const base = path.resolve(root, privacy === "public" ? "public" : "sealed/private");
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base + path.sep) || !/\.(png|jpg|jpeg|webp)$/.test(resolved)) throw new Error("Invalid asset");
  let bytes: Buffer;
  if (privacy === "public") bytes = await readFile(resolved);
  else {
    const sealed = await readFile(resolved + ".enc");
    if (sealed.length < 34 || !sealed.subarray(0, 6).equals(Buffer.from("G6BK01"))) throw new Error("Invalid sealed asset");
    bytes = await decrypt(sealed.subarray(34), sealed.subarray(6, 18), sealed.subarray(18, 34), "grade6-bank-v1:image:" + relative.replaceAll("\\", "/"));
  }
  return { bytes, mime: /\.png$/.test(resolved) ? "image/png" : /\.webp$/.test(resolved) ? "image/webp" : "image/jpeg" };
}
