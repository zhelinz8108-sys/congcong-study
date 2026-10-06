/** Derive the web bank from the frozen, reviewed PDF source; never shuffle it. */
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(appRoot, false);
const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
if (!secret || !/^[a-f0-9]{64}$/i.test(secret))
  throw new Error("Existing HOLIDAY_MATH_700_KEY is required; no key was created or changed.");
const sourcePath = path.resolve(appRoot, "../tmp/pdfs/grammar-choice-cloze/content-reviewed.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const levels = { "中等": "medium", "困难": "hard", "超级困难": "extreme" };
const publicChapters = [];
const privateAnswers = [];
let expectedSerial = 1;
let clozeCount = 0;
assert.equal(source.length, 24, "The frozen bank must have 24 chapters.");
for (const [chapterIndex, row] of source.entries()) {
  assert.equal(row.number, chapterIndex + 1);
  const chapterId = `CH${String(row.number).padStart(2, "0")}`;
  const blocks = row.blocks.map((block, index) => {
    const items = block.kind === "choice" ? [block.q] : block.items;
    assert.ok(["choice", "cloze"].includes(block.kind));
    assert.equal(items.length, block.kind === "choice" ? 1 : 5);
    assert.ok(levels[block.level]);
    const questions = items.map((question) => {
      const number = expectedSerial - chapterIndex * 100;
      assert.equal(question.serial, expectedSerial++);
      assert.equal(question.seq, number);
      assert.equal(question.id, `${chapterId}-Q${String(number).padStart(3, "0")}`);
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options).size, 4);
      assert.match(question.letter, /^[ABCD]$/);
      assert.equal(question.options["ABCD".indexOf(question.letter)], question.correct);
      assert.ok(typeof question.explanation === "string" && question.explanation.trim());
      assert.equal(question.difficulty, block.level);
      privateAnswers.push({
        questionId: question.id,
        correctOption: question.letter,
        correctText: question.correct,
        explanation: question.explanation,
      });
      return {
        id: question.id,
        serial: question.serial,
        number: question.seq,
        options: question.options,
      };
    });
    const result = {
      id: `${chapterId}-B${String(index + 1).padStart(3, "0")}`,
      kind: block.kind,
      difficulty: levels[block.level],
      questions,
    };
    if (block.kind === "choice") {
      assert.ok(typeof block.q.stem === "string" && block.q.stem.trim());
      result.stem = block.q.stem;
    } else {
      clozeCount++;
      assert.deepEqual([...block.text.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])), [1, 2, 3, 4, 5]);
      assert.deepEqual(block.items.map((item) => item.blank), [1, 2, 3, 4, 5]);
      result.title = block.title;
      result.text = block.text;
      result.passage = block.passage;
    }
    return result;
  });
  const questions = blocks.flatMap((block) => block.questions);
  assert.equal(questions.length, 100);
  assert.deepEqual(questions.map((question) => question.id), row.questions.map((question) => question.id));
  assert.equal(blocks.filter((block) => block.kind === "choice").length, 60);
  assert.equal(blocks.filter((block) => block.kind === "cloze").length, 8);
  publicChapters.push({
    chapter: {
      id: chapterId,
      number: row.number,
      title: row.title,
      focus: row.focus,
      count: 100,
      singleChoices: 60,
      clozePassages: 8,
    },
    blocks,
  });
}
assert.equal(expectedSerial, 2401);
assert.equal(clozeCount, 192);
const aad = "holiday-english-2400-v1";
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(secret, Buffer.concat([Buffer.from(`${aad}:`), salt]), 32);
const cipher = createCipheriv("aes-256-gcm", key, iv);
cipher.setAAD(Buffer.from(aad));
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(privateAnswers), "utf8"), cipher.final()]);
const encrypted = {
  version: 1,
  algorithm: "aes-256-gcm",
  aad,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  tag: cipher.getAuthTag().toString("base64"),
  ciphertext: ciphertext.toString("base64"),
};
const target = path.resolve(appRoot, "src/server/national-day-english-practice");
mkdirSync(target, { recursive: true });
// These are derived data artifacts; the decrypted key is never written to disk.
const publicJson = JSON.stringify(publicChapters, null, 2) + "\n";
writeFileSync(path.join(target, "questions.public.json"), publicJson, "utf8");
writeFileSync(path.join(target, "answers.encrypted.json"), JSON.stringify(encrypted, null, 2) + "\n", "utf8");
writeFileSync(path.join(target, "manifest.public.json"), JSON.stringify({
  version: 1,
  publicSha256: createHash("sha256").update(publicJson, "utf8").digest("hex"),
  chapters: 24,
  items: 2400,
  singleChoices: 1440,
  clozePassages: 192,
  clozeBlanks: 960,
  chapterItems: 100,
  sequence: "CH01-Q001 through CH24-Q100; global serial 1 through 2400",
}, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ chapters: publicChapters.length, questions: privateAnswers.length, clozePassages: clozeCount, privateAnswers: "encrypted only" }));
