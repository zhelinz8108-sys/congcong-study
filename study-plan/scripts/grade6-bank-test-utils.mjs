import fs from "node:fs/promises";
import path from "node:path";
import { createDecipheriv, createHash, scryptSync } from "node:crypto";
import nextEnv from "@next/env";

// Tests use the same sealed deployment assets. Secrets stay in process memory.
nextEnv.loadEnvConfig(process.cwd(), false);
const root = path.join(process.cwd(), "content", "grade6-bank");
let state;
async function context() {
  state ??= fs.readFile(path.join(root, "sealed", "answers.encrypted.json"), "utf8").then(raw => {
    const data = JSON.parse(raw);
    const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Existing answer-key configuration is required");
    if (data.version !== 1) throw new Error("Invalid sealed bank");
    return { data, key: scryptSync(secret, Buffer.concat([Buffer.from("grade6-bank-v1:"), Buffer.from(data.salt, "base64")]), 32) };
  });
  return state;
}
async function open(bytes, iv, tag, aad) {
  const { key } = await context();
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(Buffer.from(aad)); d.setAuthTag(tag);
  return Buffer.concat([d.update(bytes), d.final()]);
}
export async function readTestBankAnswers() {
  const { data } = await context();
  const raw = await open(Buffer.from(data.ciphertext, "base64"), Buffer.from(data.iv, "base64"), Buffer.from(data.tag, "base64"), "grade6-bank-v1:answers");
  return JSON.parse(raw.toString("utf8"));
}
// Local tests only. Native reference answers are decrypted in this server-side
// Node process, never exported to browser fixtures, logs or the public bundle.
export async function readTestNativeBankAnswers() {
  const data = JSON.parse(await fs.readFile(path.join(root, "sealed", "native-answers.encrypted.json"), "utf8"));
  const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Existing answer-key configuration is required");
  const publicRaw = await fs.readFile(path.join(root, "questions.native.public.json"), "utf8");
  if (data.version !== 1 || data.publicDigest !== createHash("sha256").update(publicRaw).digest("hex") || Buffer.from(data.salt, "base64").length !== 16 || Buffer.from(data.iv, "base64").length !== 12 || Buffer.from(data.tag, "base64").length !== 16) throw new Error("Native test release pair is invalid");
  const salt = Buffer.from(data.salt, "base64");
  const key = scryptSync(secret, Buffer.concat([Buffer.from("grade6-native-v1:"), salt]), 32);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
  d.setAAD(Buffer.from("grade6-native-v1:answers:" + data.publicDigest));
  d.setAuthTag(Buffer.from(data.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data.ciphertext, "base64")), d.final()]).toString("utf8"));
}
export async function readTestBankImage(relative) {
  const base = path.resolve(root, "sealed", "private"), resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base + path.sep)) throw new Error("Invalid asset");
  const sealed = await fs.readFile(resolved + ".enc");
  if (!sealed.subarray(0, 6).equals(Buffer.from("G6BK01"))) throw new Error("Invalid sealed asset");
  return open(sealed.subarray(34), sealed.subarray(6, 18), sealed.subarray(18, 34), "grade6-bank-v1:image:" + relative.replaceAll("\\", "/"));
}
