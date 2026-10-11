import "server-only";
import { createDecipheriv, scryptSync } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { SixFeedback, SixItem, SixQuestion } from "@/lib/chinese-six";
import { sixGuide, writingPractice } from "@/lib/chinese-six-guides";

type PrivateQuestion = SixQuestion & SixFeedback;
type PrivateItem = Omit<SixItem, "questions"> & { questions: PrivateQuestion[] };
type Bank = { items: PrivateItem[]; methods: PrivateItem[]; sources: { id: string; filename: string; pageCount: number }[] };
let cached: Bank | undefined;
let cachedStamp = 0;
let sealedKey: Buffer | undefined;

export const sixContentRoot = path.join(process.cwd(), "content", "chinese-six");
const sealedBankFile = path.join(sixContentRoot, "sealed", "bank.encrypted.json");

function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer, aad: string) {
  if (!sealedKey || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid sealed Chinese resource");
  const decipher = createDecipheriv("aes-256-gcm", sealedKey, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sixBank() {
  const sealed = process.env.NODE_ENV === "production" || existsSync(sealedBankFile);
  const file = sealed ? sealedBankFile : path.join(sixContentRoot, "bank.private.json");
  const stamp = process.env.NODE_ENV === "production" && cached ? cachedStamp : statSync(file).mtimeMs;
  if (!cached || stamp !== cachedStamp) {
    let bytes = readFileSync(file);
    if (sealed) {
      const envelope = JSON.parse(bytes.toString("utf8")) as { version: number; salt: string; iv: string; tag: string; ciphertext: string };
      const salt = Buffer.from(envelope.salt, "base64");
      const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
      if (envelope.version !== 1 || salt.length !== 16 || !secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("语文资料服务尚未配置");
      sealedKey = scryptSync(secret, Buffer.concat([Buffer.from("chinese-six-v1:"), salt]), 32);
      bytes = decrypt(Buffer.from(envelope.ciphertext, "base64"), Buffer.from(envelope.iv, "base64"), Buffer.from(envelope.tag, "base64"), "chinese-six-v1:bank");
    }
    cached = JSON.parse(bytes.toString("utf8")) as Bank;
    cachedStamp = stamp;
  }
  return cached;
}

export function sixSourceImage(source: string, page: number) {
  const document = sixBank().sources.find(item => item.id === source);
  if (!document || !/^[a-z]+$/.test(source) || !Number.isInteger(page) || page < 1 || page > document.pageCount) throw new Error("Invalid source page");
  const relative = `${source}/${page}.webp`;
  if (!sealedKey) return readFileSync(path.join(sixContentRoot, "pages", relative));
  const bytes = readFileSync(path.join(sixContentRoot, "sealed", "pages", relative + ".enc"));
  if (bytes.length <= 34 || !bytes.subarray(0, 6).equals(Buffer.from("C6BK01"))) throw new Error("Invalid sealed source page");
  return decrypt(bytes.subarray(34), bytes.subarray(6, 18), bytes.subarray(18, 34), "chinese-six-v1:image:" + relative);
}

export function sixPrivateItem(id: string): PrivateItem | undefined {
  const bank = sixBank();
  const item = bank.items.find(item => item.id === id) ?? bank.methods.find(item => item.id === id);
  if (!item) return undefined;
  return item.module === "writing" ? { ...item, questions: [writingPractice(item)] } : item;
}

export function sixPublicItem(id: string): SixItem | undefined {
  const item = sixPrivateItem(id);
  if (!item) return undefined;
  return { ...item, questions: item.questions.map(({ answer: _answer, explanation: _explanation, points: _points, ...question }) => {
    void _answer; void _explanation; void _points;
    return question;
  }) };
}

export function sixFeedback(itemId: string, questionId: string): SixFeedback | undefined {
  const item = sixPrivateItem(itemId);
  const question = item?.questions.find(q => q.id === questionId);
  if (!item || !question) return undefined;
  const guide = sixGuide(item);
  return { answer: question.answer, prompt: question.prompt, topic: question.topic,
    explanation: question.explanation || guide.steps.join("\n"),
    points: question.points.length ? question.points : guide.checks };
}
