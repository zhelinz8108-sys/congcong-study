import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { validateAuthoring, validationModule, sha } from "./grade6-bank-native-authoring.mjs";

// Offline/in-memory only: no environment, credentials, live API or learner records.
const work = await validateAuthoring();
const { assertBankNative, assertBankDrawing } = await validationModule();
const schemaCompiled=ts.transpileModule(await fs.readFile("src/lib/grade6-bank-input-schema.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const schemaContext={module:{exports:{}},exports:{},Error,require:name=>{if(name.endsWith("grade6-bank-native-validation"))return{assertBankDrawing};throw new Error("Unexpected schema dependency");}};schemaContext.exports=schemaContext.module.exports;vm.runInNewContext(schemaCompiled,schemaContext);
const {bankNativeInputSchema}=schemaContext.module.exports;
const graderText = await fs.readFile("src/lib/grade6-bank-grader.ts", "utf8");
const grader = await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(graderText, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
let accepted = 0, rejected = 0, reviewed = 0, perField = 0;
for (const { row } of work.entries) {
  const privateRow = { id: row.id, ...row.private, answerImages: [] };
  const correct = Object.fromEntries(row.private.rules.map((rule) => [rule.id, rule.expected[0]]));
  if (row.private.reviewRequired) {
    assert.equal(grader.gradeBankAnswer(privateRow, correct).outcome, "review"); reviewed++;
  } else {
    assert.equal(grader.gradeBankAnswer(privateRow, correct).outcome, "correct", row.id); accepted++;
    assert.equal(grader.gradeBankAnswer(privateRow, Object.fromEntries(row.inputs.map((field) => [field.id, "故意错误"])) ).outcome, "incorrect", row.id); rejected++;
    for (const field of row.inputs) {
      const outcome = grader.gradeBankAnswer(privateRow, { ...correct, [field.id]: "故意错误" });
      assert.equal(outcome.score, row.inputs.length - 1); assert.equal(outcome.fields.find((item) => item.id === field.id).correct, false); perField++;
    }
  }
  // Public export is an explicit whitelist, not a spread of author rows.
  const publicRow = { id: row.id, inputs: row.inputs, native: row.native };
  assert(!/"(?:private|answerText|rules|expected|answerStatus|reviewRequired|answerImages)":/.test(JSON.stringify(publicRow)));
}
const first = work.entries.find(({ row }) => row.id === "SYNC-CH00-P011-0001").row;
const numericFixture = (expected, unit) => ({ id: "test-native-exact", answerStatus: "verified_native", reviewRequired: false, answerText: "test-only", answerImages: [], rules: [{ id: "answer", expected: [expected], numeric: true, ...(unit ? { unit } : {}) }] });
for (const [expected, actual, correct, unit] of [
  ["11111.88888", "11111.88889", false], ["320000", "320000.001", false],
  ["1/4", "0.25", true], ["1/4", "25%", true], ["1/3", "0.3333333333", false],
  ["2.75", "2又3/4", true], ["-1/2", "-0又1/2", true], ["6.015", "6.0150km", true, "km"],
  ["1/4", "1/0", false], ["0", "-0.000", true], ["10", "1e1", false],
]) assert.equal(grader.gradeBankAnswer(numericFixture(expected, unit), { answer: actual }).outcome === "correct", correct, expected + " / " + actual);
assert.equal(grader.bankExactNumber("9".repeat(300)), null);
assert.equal(first.inputs.length, 6); assert.equal(first.native.blocks.flatMap((b) => b.content ?? []).filter((n) => n.type === "blank").length, 6);
const invalid = (edit) => { const row = structuredClone(first); edit(row); assert.throws(() => assertBankNative(row.inputs, row.native)); };
invalid((q) => q.native.blocks.push({ type: "image", src: "question.png" }));
invalid((q) => q.native.blocks.push({ type: "html", value: "<script>bad()</script>" }));
invalid((q) => q.native.blocks.push({ type: "paragraph", content: [{ type: "math", tex: "\\href{javascript:alert(1)}{x}" }] }));
invalid((q) => q.native.blocks.push({ type: "paragraph", content: [{ type: "blank", fieldId: q.inputs[0].id }] }));
invalid((q) => q.inputs.push({ id: "lost", label: "lost" }));
invalid((q) => q.inputs[0].expected = "private" );
invalid((q) => q.native.blocks.push({ type: "diagram", viewBox: [0, 0, 10, 10], label: "x", shapes: [{ type: "circle", cx: 5, cy: 5, r: 2, fill: "url(https://bad)" }] }));
invalid((q) => q.native.blocks.push({ type: "diagram", viewBox: [0, 0, 10, 10], label: "x", shapes: [{ type: "path", d: "M0 0L10 10", onclick: "bad()" }] }));
invalid((q) => q.native.blocks.push({ type: "paragraph", content: [{ type: "text", value: "\uF0B8" }] }));
invalid((q) => q.native.blocks.push({ type: "diagram", viewBox: [0, 0, 10, 10], label: "x", shapes: [{ type: "path", d: "M0 0L1e999 10" }] }));
invalid((q) => q.native.blocks.push({ type: "diagram", viewBox: [0, 0, 10, 10], label: "x", shapes: [{ type: "polyline", points: "0,0 1e999,10" }] }));
const drawing = { version: 1, viewBox: [0, 0, 100, 100], items: [{ type: "line", from: [10, 20], to: [90, 20] }, { type: "circle", center: [50, 50], radius: 25 }, { type: "text", at: [20, 80], value: "x" }] };
assertBankDrawing(JSON.stringify(drawing), drawing.viewBox);
assertBankDrawing(JSON.stringify({ ...drawing, items: [{ type: "shade", points: [[10, 10], [30, 10], [30, 30], [10, 30]] }] }), drawing.viewBox);
for (const bad of [
  { ...drawing, items: [] }, { ...drawing, items: [{ type: "image", src: "data:image/png" }] },
  { ...drawing, items: [{ type: "line", from: [-1, 20], to: [90, 20] }] },
  { ...drawing, items: [{ type: "circle", center: [50, 50], radius: 60 }] },
  { ...drawing, items: [{ type: "text", at: [0, 0], value: "x", onload: "bad" }] },
  { ...drawing, items: Array(25).fill(drawing.items[0]) },
  { ...drawing, items: [{ type: "shade", points: [[10, 10], [30, 10]] }] },
  { ...drawing, items: [{ type: "shade", points: [[10, 10], [30, 10], [101, 30]] }] },
  { ...drawing, items: [{ type: "shade", points: [[10, 10], [30, 10], [30, 30]], fill: "url(https://bad)" }] },
]) assert.throws(() => assertBankDrawing(JSON.stringify(bad), drawing.viewBox));
assert.throws(() => assertBankDrawing(JSON.stringify(drawing), [0, 0, 200, 200]));

// Exercise the real HTTP input/response validators without any request, server,
// cookies, credentials or persistence; mocks may not perform network or writes.
const httpCompiled = ts.transpileModule(await fs.readFile("src/server/grade6-bank/http.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const httpContext = { module: { exports: {} }, exports: {}, Error, require: (name) => {
  if (name === "server-only") return {};
  if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, ...options }) } };
  if (name.endsWith("family-access")) return {};
  if (name.endsWith("holiday-math-700/http")) return { holidayHeaders: {} };
  if (name.endsWith("grade6-bank-native-validation")) return { assertBankDrawing };
  if (name.endsWith("grade6-bank-input-schema")) return schemaContext.module.exports;
  throw new Error("Unexpected HTTP dependency");
} };
httpContext.exports = httpContext.module.exports; vm.runInNewContext(httpCompiled, httpContext);
const { bankStudentAnswers, bankFailure, bankInputSchema } = httpContext.module.exports;
let validatedHttpRows = 0;
for (const { row } of work.entries) {
  const question = { ...work.byId.get(row.id), inputs: row.inputs, native: row.native };
  bankInputSchema(bankNativeInputSchema(question), question);
  assert.throws(() => bankInputSchema(undefined, question), /提交字段已更新/);
  assert.throws(() => bankInputSchema("old-schema", question), /提交字段已更新/);
  const answer = Object.fromEntries(row.inputs.map((field) => {
    if (field.kind !== "drawing") return [field.id, row.private.rules.find((rule) => rule.id === field.id)?.expected[0] ?? (field.kind === "choice" ? field.choices[0] : "测试过程")];
    const block = row.native.blocks.find((block) => block.type === "drawing" && block.fieldId === field.id);
    const [x, y, w, h] = block.viewBox;
    return [field.id, JSON.stringify({ version: 1, viewBox: block.viewBox, items: [{ type: "line", from: [x + w / 4, y + h / 4], to: [x + w / 2, y + h / 2] }] })];
  }));
  assert.equal(Object.keys(bankStudentAnswers(answer, question, true)).length, row.inputs.length);
  assert.throws(() => bankStudentAnswers({ ...answer, unknown: "x" }, question, true));
  assert.throws(() => bankStudentAnswers({ ...answer, [row.inputs[0].id]: "" }, question, true));
  assert.equal(bankStudentAnswers({}, question, false)[row.inputs[0].id], "");
  validatedHttpRows++;
}
const drawRow = work.entries.find(({ row }) => row.inputs.some((field) => field.kind === "drawing")).row;
bankInputSchema(undefined, { ...work.byId.get(first.id), native: undefined });
const drawingField = drawRow.inputs.find((field) => field.kind === "drawing");
const drawingQuestion = { ...work.byId.get(drawRow.id), inputs: drawRow.inputs, native: drawRow.native };
assert.throws(() => bankStudentAnswers({ [drawingField.id]: JSON.stringify(drawing) }, drawingQuestion, false), /绘图/);
assert.throws(() => bankStudentAnswers({ [drawingField.id]: JSON.stringify(drawing) }, { ...drawingQuestion, native: undefined }, false), /绘图/);
assert.equal(bankFailure(new Error("提交格式不正确，请检查绘图内容")).status, 400);
const opaqueFailure = bankFailure(new Error("private credential or source detail"));
assert.equal(opaqueFailure.status, 503); assert(!opaqueFailure.body.error.includes("credential"));

// The actual server loader is isolated behind memory file/crypto stubs. Its test
// key is invented locally; never load a real family access or grading secret.
const loaderText = await fs.readFile("src/server/grade6-bank/native-release.ts", "utf8");
const compiled = ts.transpileModule(loaderText, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function loader(files) {
  const context = { module: { exports: {} }, exports: {}, Buffer, process: { cwd: () => "/test", env: { HOLIDAY_MATH_700_KEY: "12".repeat(32) } }, require: (name) => {
    if (name === "server-only") return {};
    if (name === "node:crypto") return { createHash: (awaitedCrypto.createHash), createDecipheriv: awaitedCrypto.createDecipheriv, scryptSync };
    if (name === "node:path") return { default: awaitedPath, ...awaitedPath };
    if (name === "node:fs/promises") return { readFile: async (name) => { const key = name.split(/[\\/]/).at(-1); if (!files.has(key)) { const error = new Error("missing"); error.code = "ENOENT"; throw error; } return files.get(key); } };
    if (name.endsWith("grade6-bank-native-validation")) return { assertBankNative };
    throw new Error("Unexpected import " + name);
  } };
  context.exports = context.module.exports; vm.runInNewContext(compiled, context); return context.module.exports;
}
const awaitedCrypto = await import("node:crypto"), awaitedPath = (await import("node:path")).default;
const baseRaw = JSON.stringify(work.base), manifestRaw = JSON.stringify(work.manifest);
const memoryFiles = new Map([["questions.public.json", baseRaw], ["manifest.json", manifestRaw]]);
assert.equal((await loader(memoryFiles).nativeBankQuestion(work.base[0])).id, work.base[0].id);
const nativeRows = work.base.map((q) => ({ id: q.id, inputs: first.inputs, native: first.native })); // Artificial fixtures, not authoring results.
const release = { version: 1, total: work.manifest.total, baseDigest: sha(baseRaw + "\n" + manifestRaw), questions: nativeRows };
memoryFiles.set("questions.native.public.json", JSON.stringify({ ...release, questions: nativeRows.slice(0, 59) }));
await assert.rejects(loader(memoryFiles).nativeBankQuestion(work.base[0]), /全库验收/);
memoryFiles.set("questions.native.public.json", JSON.stringify(release));
await assert.rejects(loader(memoryFiles).nativeBankQuestion(work.base[0]), /missing/);
const raw = memoryFiles.get("questions.native.public.json"), publicDigest = sha(raw), salt = randomBytes(16), iv = randomBytes(12);
const key = scryptSync("12".repeat(32), Buffer.concat([Buffer.from("grade6-native-v1:"), salt]), 32);
const privateRows = work.base.map((q) => ({ id: q.id, ...first.private, answerImages: [] }));
const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(Buffer.from("grade6-native-v1:answers:" + publicDigest));
const bytes = Buffer.concat([cipher.update(JSON.stringify(privateRows)), cipher.final()]);
const sealed = { version: 1, publicDigest, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: bytes.toString("base64") };
memoryFiles.set("native-answers.encrypted.json", JSON.stringify(sealed));
const active = await loader(memoryFiles).nativeBankQuestion(work.base[0]);
assert.equal(active.number, work.base[0].number); assert.equal(active.id, work.base[0].id); assert.equal(active.questionImages.length, 0);
assert.equal((await loader(memoryFiles).nativeBankAnswer(work.base[0].id)).id, work.base[0].id);
memoryFiles.set("native-answers.encrypted.json", JSON.stringify({ ...sealed, publicDigest: "0".repeat(64) }));
await assert.rejects(loader(memoryFiles).nativeBankAnswer(work.base[0].id), /sealed native/);
memoryFiles.set("native-answers.encrypted.json", JSON.stringify({ ...sealed, tag: Buffer.alloc(16).toString("base64") }));
await assert.rejects(loader(memoryFiles).nativeBankQuestion(work.base[0]), /authenticate|auth|state/i);
console.log(JSON.stringify({ passed: true, authoring: work.stats, grading: { accepted, rejected, perField, reviewed }, exactArithmeticRegressions: 12, httpValidatedRows: validatedHttpRows, unsafeNodesRejected: 11, invalidDrawingsRejected: 10, releaseGate: ["absent release keeps current bank", "partial release rejected", "missing private data rejected before activation", "stable ids and numbers", "private/public digest mismatch rejected", "unauthenticated private data rejected before activation"], studentWrites: 0 }));
