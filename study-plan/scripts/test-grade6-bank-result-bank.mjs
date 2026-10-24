import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const bankSource = readFileSync(new URL("../src/server/grade6-bank/bank.ts", import.meta.url), "utf8");
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

// Exercise the real cache/presentation code without keys, files, network calls
// or learner records. The native provider uses the same fulfilled-promise
// await boundaries as the warmed production native and private-answer loaders.
async function isolatedBank(serial) {
  const key = `bankResultCacheFixture${serial}`;
  globalThis[key] = {
    question: { id: "synthetic-closed", prompt: "Public original", inputs: [{ id: "original-work", kind: "text", label: "Original work" }], questionImages: [] },
    answer: { id: "synthetic-closed", rules: [], reviewRequired: true, answerStatus: "verified_native", answerText: "Synthetic teacher conclusion", answerImages: [] },
    plan: { ready: true, assessment: "closed-v1", rules: [{ id: "result-choice", expected: ["B"] }], resultInputIds: ["result-choice"], optionalInputIds: [] },
  };
  const fixture = `const fixture = globalThis[${JSON.stringify(key)}];`;
  const mocks = {
    "node:fs/promises": `${fixture} export async function readFile() { return JSON.stringify([fixture.question]); }`,
    "./native-release": `${fixture}
      const releasePromise = Promise.resolve({ rows: new Map([[fixture.question.id, fixture.question]]) });
      const answerPromise = Promise.resolve(new Map([[fixture.answer.id, fixture.answer]]));
      export async function nativeBankAnswer(id) { return (await answerPromise).get(id); }
      export async function nativeBankQuestion(question) {
        await releasePromise;
        await nativeBankAnswer(question.id);
        return { ...question, native: { version: 1, blocks: [] } };
      }`,
    "./retired-duplicates": `export const RAW_BANK_MANIFEST_SHA256 = ""; export const activeBankManifest = value => value; export const isRetiredBankQuestion = () => false;`,
    "./result-plan": `export const buildBankResultPlan = () => null;`,
    "./result-descriptor": `${fixture}
      export const bankFractionGroups = () => [];
      export const applyBankResultDescriptor = question => ({
        question: { ...question, resultAssessment: "closed-v1", inputs: [{ id: "result-choice", kind: "choice", label: "Final answer", choices: ["A", "B", "C", "D"] }] },
        plan: fixture.plan,
      });`,
    "./result-descriptors": `export async function getBankResultDescriptor() { await Promise.resolve(); return { closed: {} }; } export async function verifyBankResultDescriptors() {}`,
  };
  let compiled = ts.transpileModule(bankSource.replace(/^\s*import\s+['"]server-only['"];?\s*$/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, mock] of Object.entries(mocks)) compiled = compiled.replaceAll(JSON.stringify(name), JSON.stringify(url(mock)));
  const bank = await import(url(`${compiled}\n// Isolated module ${serial}`));
  return { bank, dispose: () => { delete globalThis[key]; } };
}

let concurrentReads = 0;
for (let delay = 0; delay < 18; delay++) {
  const { bank, dispose } = await isolatedBank(delay);
  const first = bank.getBankQuestion("synthetic-closed");
  for (let index = 0; index < delay; index++) await Promise.resolve();
  const second = bank.getBankQuestion("synthetic-closed");
  const questions = await Promise.all([first, second]);
  const plan = await bank.getBankResultPlan("synthetic-closed");
  const cached = await bank.getBankQuestion("synthetic-closed");
  assert.ok(plan?.ready);
  for (const question of [...questions, cached]) {
    assert.equal(question.resultAssessment, "closed-v1", `Concurrent variant lost at delay ${delay}`);
    assert.deepEqual(question.inputs.map(field => field.id), plan.resultInputIds, `Public fields differ from grading plan at delay ${delay}`);
    assert.deepEqual(question.resultInputIds, plan.resultInputIds, `Result field presentation differs at delay ${delay}`);
    assert.equal(question.inputs[0].kind, "choice");
    concurrentReads++;
  }
  assert.deepEqual(questions[0], cached, `Concurrent response differs from cached version at delay ${delay}`);
  assert.deepEqual(questions[1], cached, `Concurrent response differs from cached version at delay ${delay}`);
  dispose();
}

console.log(JSON.stringify({ passed: true, interleavings: 18, concurrentAndCachedPublicReads: concurrentReads, secretsRead: false, learnerWrites: 0 }));
