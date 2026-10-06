import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

async function run() {
  const bankRoot = path.resolve(appRoot, "src/server/national-day-english-practice");
  const sourcePath = path.resolve(appRoot, "../tmp/pdfs/grammar-choice-cloze/content-reviewed.json");
  const sourceAvailable = existsSync(sourcePath) && !process.argv.includes("--without-source");
  let source = sourceAvailable ? JSON.parse(readFileSync(sourcePath, "utf8")) : null;
  const publicText = readFileSync(path.join(bankRoot, "questions.public.json"), "utf8");
  const bank = JSON.parse(publicText);
  const manifest = JSON.parse(readFileSync(path.join(bankRoot, "manifest.public.json"), "utf8"));
  assert.equal(createHash("sha256").update(publicText.replaceAll("\r\n", "\n"), "utf8").digest("hex"), manifest.publicSha256, "Frozen public bank checksum changed.");
  assert.equal(bank.length, manifest.chapters);
  assert.equal(manifest.items, 2400);
  const { ENGLISH_PRACTICE_CHAPTERS, englishPracticeBlock, listEnglishPracticeBlocks } = await loadHolidayTestModule("src/server/national-day-english-practice/public-bank.ts");
  const { EnglishPracticeInputError, gradeEnglishPracticeBlock } = await loadHolidayTestModule("src/server/national-day-english-practice/service.ts");
  const { englishPracticePrivateAnswer } = await loadHolidayTestModule("src/server/national-day-english-practice/private-bank.ts");
  const forbidden = new Set(["correct", "letter", "explanation", "correctOption", "correctText", "levels", "skill"]);
  function noPrivateFields(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key), false, `Private field found in public response: ${key}`);
      noPrivateFields(child);
    }
  }
  function invalid(blockId, answers, status = 400) {
    assert.throws(() => gradeEnglishPracticeBlock(blockId, answers), (error) => error instanceof EnglishPracticeInputError && error.status === status);
  }
  // Invalid/incomplete answers must be rejected before even attempting decryption.
  const savedKey = process.env.HOLIDAY_MATH_700_KEY;
  delete process.env.HOLIDAY_MATH_700_KEY;
  invalid("CH01-B026", { "CH01-Q026": "A" });
  invalid("CH01-B001", {});
  invalid("CH01-B001", { "CH01-Q001": "Z" });
  invalid("CH01-B069", { "CH01-Q001": "A" }, 404);
  if (savedKey === undefined) delete process.env.HOLIDAY_MATH_700_KEY;
  else process.env.HOLIDAY_MATH_700_KEY = savedKey;
  if (!source) {
    // A fresh clone retains the frozen public manifest and encrypted answers, not private PDF work files.
    // Reconstruct expected records in memory only; never write or print decrypted contents.
    const levelNames = { medium: "中等", hard: "困难", extreme: "超级困难" };
    source = bank.map((row) => {
      const blocks = row.blocks.map((block) => {
        const questions = block.questions.map((question) => {
          const key = englishPracticePrivateAnswer(question.id);
          assert.ok(key, "Encrypted answer record missing.");
          return { id: question.id, serial: question.serial, seq: question.number, options: question.options,
            letter: key.correctOption, correct: key.correctText, explanation: key.explanation };
        });
        return block.kind === "choice"
          ? { kind: block.kind, level: levelNames[block.difficulty], q: { ...questions[0], stem: block.stem } }
          : { kind: block.kind, level: levelNames[block.difficulty], title: block.title, text: block.text, passage: block.passage, items: questions };
      });
      return { number: row.chapter.number, title: row.chapter.title, focus: row.chapter.focus, blocks,
        questions: blocks.flatMap((block) => block.kind === "choice" ? [block.q] : block.items) };
    });
  }
  assert.equal(ENGLISH_PRACTICE_CHAPTERS.length, 24);
  let correctCases = 0;
  let wrongCases = 0;
  let clozePassages = 0;
  let expectedSerial = 1;
  const difficulties = { "中等": "medium", "困难": "hard", "超级困难": "extreme" };
  const sizes = [...Array(25).fill(1), ...Array(3).fill(5), ...Array(25).fill(1), ...Array(3).fill(5), ...Array(10).fill(1), ...Array(2).fill(5)];
  const allIds = [];
  for (const [chapterIndex, chapter] of source.entries()) {
    const id = `CH${String(chapterIndex + 1).padStart(2, "0")}`;
    assert.deepEqual(ENGLISH_PRACTICE_CHAPTERS[chapterIndex], {
      id, number: chapter.number, title: chapter.title, focus: chapter.focus,
      count: 100, singleChoices: 60, clozePassages: 8,
    });
    const pages = Array.from({ length: 10 }, (_, index) => listEnglishPracticeBlocks({ chapter: id, page: index + 1 }));
    for (const page of pages) {
      assert.equal(page.total, 100);
      assert.equal(page.pages, 10);
      assert.equal(page.chapter, id);
      assert.equal(page.blocks.flatMap((block) => block.questions).length, 10);
      noPrivateFields(page);
    }
    const blocks = pages.flatMap((page) => page.blocks);
    assert.equal(blocks.length, 68);
    const levelCounts = { medium: 0, hard: 0, extreme: 0 };
    for (const [index, raw] of chapter.blocks.entries()) {
      const block = blocks[index];
      const blockId = `${id}-B${String(index + 1).padStart(3, "0")}`;
      assert.equal(block.id, blockId);
      assert.equal(englishPracticeBlock(blockId), block);
      assert.equal(block.kind, raw.kind);
      assert.equal(block.questions.length, sizes[index]);
      assert.equal(block.kind, sizes[index] === 1 ? "choice" : "cloze");
      assert.equal(block.difficulty, difficulties[raw.level]);
      levelCounts[block.difficulty] += block.questions.length;
      const rawQuestions = raw.kind === "choice" ? [raw.q] : raw.items;
      if (raw.kind === "choice") assert.equal(block.stem, raw.q.stem);
      else {
        clozePassages++;
        assert.equal(block.questions.length, 5);
        assert.equal(block.title, raw.title);
        assert.equal(block.text, raw.text);
        assert.equal(block.passage, raw.passage);
        assert.deepEqual([...block.text.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])), [1, 2, 3, 4, 5]);
      }
      const correct = {};
      const wrong = {};
      for (const [questionIndex, question] of block.questions.entries()) {
        const rawQuestion = rawQuestions[questionIndex];
        assert.deepEqual(question, { id: rawQuestion.id, serial: rawQuestion.serial, number: rawQuestion.seq, options: rawQuestion.options });
        const number = expectedSerial - chapterIndex * 100;
        assert.equal(question.id, `${id}-Q${String(number).padStart(3, "0")}`);
        assert.equal(question.number, number);
        assert.equal(question.serial, expectedSerial++);
        allIds.push(question.id);
        correct[question.id] = rawQuestion.letter;
        wrong[question.id] = "ABCD"[("ABCD".indexOf(rawQuestion.letter) + 1) % 4];
      }
      const good = gradeEnglishPracticeBlock(blockId, correct);
      const bad = gradeEnglishPracticeBlock(blockId, wrong);
      assert.equal(good.blockId, blockId);
      assert.equal(good.score, rawQuestions.length);
      assert.equal(good.maxScore, rawQuestions.length);
      assert.equal(bad.score, 0);
      assert.equal(bad.maxScore, rawQuestions.length);
      for (const [questionIndex, result] of good.results.entries()) {
        const rawQuestion = rawQuestions[questionIndex];
        assert.deepEqual(result, {
          questionId: rawQuestion.id,
          selected: rawQuestion.letter,
          correct: true,
          correctOption: rawQuestion.letter,
          correctText: rawQuestion.correct,
          explanation: rawQuestion.explanation,
        });
        assert.equal(bad.results[questionIndex].correct, false);
        assert.equal(bad.results[questionIndex].selected, wrong[rawQuestion.id]);
      }
      correctCases += good.results.length;
      wrongCases += bad.results.length;
      invalid(blockId, null);
      invalid(blockId, []);
      invalid(blockId, { ...correct, "CH99-Q001": "A" });
      const invalidLetter = { ...correct, [rawQuestions[0].id]: "a" };
      invalid(blockId, invalidLetter);
      const missing = { ...correct };
      delete missing[rawQuestions[0].id];
      invalid(blockId, missing);
    }
    assert.deepEqual(levelCounts, { medium: 40, hard: 40, extreme: 20 });
    assert.deepEqual(blocks.flatMap((block) => block.questions).map((question) => question.id), chapter.questions.map((question) => question.id));
    assert.deepEqual(listEnglishPracticeBlocks({ chapter: id, page: 999 }), pages[9]);
    assert.deepEqual(listEnglishPracticeBlocks({ chapter: id }), pages[0]);
    assert.throws(() => listEnglishPracticeBlocks({ chapter: id, page: 0 }));
    assert.throws(() => listEnglishPracticeBlocks({ chapter: id, page: 1.5 }));
  }
  assert.equal(correctCases, 2400);
  assert.equal(wrongCases, 2400);
  assert.equal(clozePassages, 192);
  assert.equal(new Set(allIds).size, 2400);
  assert.equal(expectedSerial, 2401);
  assert.equal(englishPracticeBlock("CH25-B001"), undefined);
  assert.throws(() => listEnglishPracticeBlocks({ chapter: "CH25" }));
  const encrypted = JSON.parse(readFileSync(path.resolve(appRoot, "src/server/national-day-english-practice/answers.encrypted.json"), "utf8"));
  assert.equal(encrypted.aad, "holiday-english-2400-v1");
  assert.equal(encrypted.algorithm, "aes-256-gcm");
  assert.equal(Buffer.from(encrypted.salt, "base64").length, 16);
  assert.equal(Buffer.from(encrypted.iv, "base64").length, 12);
  assert.equal(Buffer.from(encrypted.tag, "base64").length, 16);
  assert.ok(!JSON.stringify(encrypted).includes(source[0].questions[0].explanation));
  console.log(JSON.stringify({ result: "passed", chapters: 24, pages: 240, frozenOrderedItems: 2400, reviewedSourceAvailable: sourceAvailable, correctGradingCases: correctCases, wrongGradingCases: wrongCases, intactClozePassages: clozePassages, publicAnswerFields: 0, privateAnswers: "encrypted only" }));
}

run().catch((error) => {
  // Assertion diffs and transpiled data URLs can contain private data.
  // Emit only the error category; inspect the individual assertion locally if needed.
  console.error(`English practice verification failed (${error instanceof Error ? error.name : "unknown failure"}).`);
  process.exitCode = 1;
});
