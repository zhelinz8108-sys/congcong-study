import "server-only";
import { createDecipheriv, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BankManifest, BankQuestion } from "@/lib/grade6-bank-types";
import type { BankPrivateAnswer } from "@/lib/grade6-bank-grader";

const root = path.join(process.cwd(), "content", "grade6-bank");
let manifestPromise: Promise<BankManifest> | null = null;
let questionsPromise: Promise<Map<string, BankQuestion>> | null = null;
let answersPromise: Promise<Map<string, BankPrivateAnswer>> | null = null;
let privateKeyPromise: Promise<Buffer> | null = null;

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

export function getBankManifest() {
  manifestPromise ??= readFile(path.join(root, "manifest.json"), "utf8").then((raw) => JSON.parse(raw) as BankManifest);
  return manifestPromise;
}
export async function getBankQuestion(id: string) {
  questionsPromise ??= readFile(path.join(root, "questions.public.json"), "utf8").then((raw) => new Map((JSON.parse(raw) as BankQuestion[]).map((q) => [q.id, q])));
  return (await questionsPromise).get(id);
}
export async function getPrivateBankAnswer(id: string) {
  answersPromise ??= sealedAnswers().then(async (data) => {
    const bytes = await decrypt(Buffer.from(data.ciphertext, "base64"), Buffer.from(data.iv, "base64"), Buffer.from(data.tag, "base64"), "grade6-bank-v1:answers");
    const rows = JSON.parse(bytes.toString("utf8")) as BankPrivateAnswer[];
    const manifest = await getBankManifest();
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
