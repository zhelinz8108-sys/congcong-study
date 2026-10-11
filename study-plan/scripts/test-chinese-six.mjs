import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import nextEnv from "@next/env";
import { appRoot } from "./holiday-math-test-utils.mjs";

nextEnv.loadEnvConfig(appRoot, false, { info() {}, error() {} });

const require = createRequire(import.meta.url);
const cache = new Map();
// Exercise the real transitions without opening a connection to student storage.
export function loadSixTestModule(file) {
  const filename = path.resolve(appRoot, file);
  if (cache.has(filename)) return cache.get(filename);
  const loaded = { exports: {} };
  cache.set(filename, loaded.exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = specifier => {
    if (specifier === "server-only") return {};
    if (["@/lib/db", "@/lib/cloud-progress-schema", "@/lib/local-fallback"].includes(specifier)) return {};
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      let target = specifier.startsWith("@/") ? path.join(appRoot, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      if (!path.extname(target)) target += ".ts";
      return loadSixTestModule(target);
    }
    return require(specifier);
  };
  new Function("require", "module", "exports", code)(localRequire, loaded, loaded.exports);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}

export function verifySix() {
  const bankModule = loadSixTestModule("src/server/chinese-six-bank.ts");
  const bank = bankModule.sixBank();
  const lib = loadSixTestModule("src/lib/chinese-six.ts");
  const server = loadSixTestModule("src/server/chinese-six-progress.ts");
  const guide = loadSixTestModule("src/lib/chinese-six-guides.ts");
  const counts = Object.fromEntries(["lessons", "sentences", "reading", "writing"].map(key => [key, bank.items.filter(i => i.module === key).length]));
  assert.deepEqual(counts, { lessons: 34, sentences: 13, reading: 40, writing: 80 });
  assert.equal(bank.methods.length, 24);
  const sorting = bankModule.sixPrivateItem("sentence-11").questions.find(q => q.prompt.includes("曹冲"));
  assert.ok(sorting.prompt.includes("资料改编订正") && sorting.answer.includes("4、1、2、5、3"));
  assert.equal(new Set(bank.items.map(i => i.id)).size, bank.items.length);
  const index = JSON.parse(readFileSync(path.join(appRoot, "src/data/chinese-six-index.json"), "utf8"));
  assert.equal(index.items.length, 167);
  assert.ok(!JSON.stringify(index).includes('"answer"'));
  let questions = 0, choices = 0, images = 0;
  for (const source of bank.sources) {
    for (let page = 1; page <= source.pageCount; page++) {
      const image = bankModule.sixSourceImage(source.id, page);
      assert.equal(image.subarray(0, 4).toString(), "RIFF");
      assert.equal(image.subarray(8, 12).toString(), "WEBP");
      images++;
    }
  }
  assert.throws(() => bankModule.sixSourceImage("../lessons", 1));
  assert.throws(() => bankModule.sixSourceImage("lessons", 0));
  for (const raw of [...bank.items, ...bank.methods]) {
    const item = bankModule.sixPrivateItem(raw.id);
    const publicItem = bankModule.sixPublicItem(raw.id);
    assert.ok(item.pages.length > 0 && item.title.trim());
    assert.ok(guide.sixGuide(item).checks.length >= 3);
    assert.equal(new Set(item.questions.map(q => q.id)).size, item.questions.length);
    if (!item.id.startsWith("skill-")) assert.ok(item.questions.length > 0, item.id);
    if (item.module === "reading") assert.ok(item.sections[0].text.length > 80, item.id);
    for (const q of item.questions) {
      questions++;
      assert.ok(q.prompt.trim() && q.answer.trim(), q.id);
      if (item.module === "lessons" && q.id.endsWith("q2")) assert.ok(q.answer.split("\n")[0].trim().endsWith("。"), `incomplete word meaning: ${q.id}`);
      const feedback = bankModule.sixFeedback(item.id, q.id);
      assert.ok(feedback.explanation && feedback.points.length >= 1, q.id);
      const publicQ = publicItem.questions.find(publicQ => publicQ.id === q.id);
      for (const key of ["answer", "points", "explanation"]) assert.equal(publicQ[key], undefined);
      if (q.kind === "choice") { choices++; assert.equal(q.options.length, 4); assert.ok(q.options.some(o => o.value === q.answer.trim())); }
    }
  }
  let state = lib.emptySixProgress();
  assert.deepEqual(server.sixSubmittedFeedback(state), {});
  const short = bankModule.sixPrivateItem("sentence-01");
  state = server.transitionSixProgress(state, { action: "start", itemId: short.id });
  const attemptId = state.current[short.id], questionId = short.questions[0].id;
  const answer = { action: "answer", itemId: short.id, attemptId, questionId, value: "我的第一次答案" };
  assert.throws(() => server.transitionSixProgress(state, { ...answer, value: "" }));
  assert.throws(() => server.transitionSixProgress(state, { ...answer, questionId: "invalid" }));
  state = server.transitionSixProgress(state, answer);
  assert.throws(() => server.transitionSixProgress(state, { ...answer, value: "改掉原答案" }));
  assert.equal(state.attempts[attemptId].responses[questionId].value, answer.value);
  assert.deepEqual(Object.keys(server.sixSubmittedFeedback(state)[attemptId]), [questionId]);
  const rate = { action: "rate", itemId: short.id, attemptId, questionId, score: "partial" };
  state = server.transitionSixProgress(state, rate);
  assert.throws(() => server.transitionSixProgress(state, { ...rate, score: "full" }));
  assert.equal(lib.sixAttemptStats(state.attempts[attemptId], short.questions.length).mastery, 50);
  state = server.transitionSixProgress(state, { action: "start", itemId: short.id });
  assert.notEqual(state.current[short.id], attemptId);
  assert.equal(state.attempts[attemptId].responses[questionId].value, answer.value);
  assert.throws(() => server.transitionSixProgress(state, answer));
  const choiceItem = bank.items.find(i => i.questions.some(q => q.kind === "choice"));
  const choice = choiceItem.questions.find(q => q.kind === "choice");
  state = server.transitionSixProgress(state, { action: "start", itemId: choiceItem.id });
  const choiceInput = { action: "answer", itemId: choiceItem.id, attemptId: state.current[choiceItem.id], questionId: choice.id, value: choice.answer };
  assert.throws(() => server.transitionSixProgress(state, { ...choiceInput, value: "E" }));
  state = server.transitionSixProgress(state, choiceInput);
  assert.equal(state.attempts[choiceInput.attemptId].responses[choice.id].correct, true);
  assert.throws(() => server.transitionSixProgress(state, choiceInput));
  const report = { counts, methods: bank.methods.length, questions, choices, sourceImages: images, checks: "content, provenance, private answers, single submission, single self-rating, restart history" };
  console.log(JSON.stringify(report, null, 2));
  return { lib, server, bankModule };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifySix();
