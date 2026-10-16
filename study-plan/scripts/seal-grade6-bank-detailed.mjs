import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readDetailedWork } from "./grade6-bank-detailed-authoring.mjs";

// All-or-nothing local content preparation. No network or database calls.
// Never print plaintext solutions/keys. Reviewed content required for sealing.
const check = process.argv.includes("--check"), authoring = await readDetailedWork({ complete: true });
if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error("Unexpected argument");
const reviewedFile = path.resolve("content/grade6-bank/private/detailed/release-review.json");
const reviewed = JSON.parse(await fs.readFile(reviewedFile, "utf8"));
if (reviewed.status !== "verified" || reviewed.total !== authoring.native.total || reviewed.publicDigest !== authoring.publicDigest || reviewed.resolvedDigest !== authoring.resolvedDigest || reviewed.pendingIds?.length !== 0 || !Array.isArray(reviewed.batches) || JSON.stringify(reviewed.batches) !== JSON.stringify(authoring.batches)) throw new Error("Full detailed-solution review has not passed; release blocked");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Existing answer-key configuration unavailable; no key created");
const file = path.resolve("content/grade6-bank/sealed/detailed-solutions.encrypted.json");
if (check) {
  const envelope = JSON.parse(await fs.readFile(file, "utf8"));
  if (envelope.version !== 1 || envelope.publicDigest !== authoring.publicDigest) throw new Error("Sealed solution pair mismatch");
  const salt = Buffer.from(envelope.salt, "base64"), iv = Buffer.from(envelope.iv, "base64"), tag = Buffer.from(envelope.tag, "base64");
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid sealed solutions");
  const key = scryptSync(secret, Buffer.concat([Buffer.from("grade6-detailed-v1:"), salt]), 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from("grade6-detailed-v1:solutions:" + authoring.publicDigest)); decipher.setAuthTag(tag);
  const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8"));
  if (data.version !== 1 || data.total !== 2394 || JSON.stringify(data.solutions) !== JSON.stringify(authoring.solutions)) throw new Error("Sealed detailed content differs from reviewed content");
} else {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(secret, Buffer.concat([Buffer.from("grade6-detailed-v1:"), salt]), 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("grade6-detailed-v1:solutions:" + authoring.publicDigest));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ version: 1, total: 2394, solutions: authoring.solutions })), cipher.final()]);
  const envelope = { version: 1, publicDigest: authoring.publicDigest, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  let existing;
  try { existing = await fs.lstat(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("Unsafe sealed destination");
  await fs.writeFile(file, JSON.stringify(envelope) + "\n", { mode: 0o600 });
}
console.log(JSON.stringify({ passed: true, checked: check, total: authoring.total, privateOnly: true, studentWrites: 0 }));
