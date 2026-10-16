import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import nextEnv from "@next/env";

// Isolated harness: all database/store calls are in-memory doubles. It never
// contacts production, writes student progress, or prints private answers.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(appRoot);
nextEnv.loadEnvConfig(appRoot, false);
const nativeRequire = createRequire(import.meta.url);
const modules = new Map(), saved = new Map(), locks = new Map();
let legacyRows = [];
let capturedPattern = "";
let listeningFixture = null;
const storeKey = (student, scope, id) => JSON.stringify([student, scope, id]);
const memoryStore = {
  async firstSubmissions(student, scope) {
    return Object.fromEntries([...saved].filter(([key]) => {
      const parts = JSON.parse(key); return parts[0] === student && parts[1] === scope;
    }).map(([key, record]) => [JSON.parse(key)[2], record]));
  },
  async saveFirstSubmission(student, scope, id, answer, grade, legacy) {
    const key = storeKey(student, scope, id);
    const previous = locks.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      if (saved.has(key)) return { ...saved.get(key), replayed: true };
      const record = legacy ?? { answer, feedback: await grade(answer, db.pool), submittedAt: "2026-10-11T00:00:00Z" };
      saved.set(key, structuredClone(record));
      return { ...record, replayed: false };
    });
    locks.set(key, pending);
    return pending;
  },
};
const db = { pool: { async query(sql, values) {
  if (sql.includes("student_cloud_state")) { capturedPattern = values[1]; return { rows: legacyRows }; }
  if (listeningFixture && sql.includes("SELECT subject_id FROM study_units")) return { rows: listeningFixture.some(unit => unit.id === values[0]) ? [{ subject_id: "canonical-subject" }] : [] };
  if (listeningFixture && sql.includes("FROM study_units WHERE subject_id")) return { rows: listeningFixture };
  if (listeningFixture && sql.includes("FROM study_words WHERE subject_id")) return { rows: listeningFixture.flatMap(unit => unit.words.map(word => ({ ...word, unit_id: unit.id }))) };
  if (listeningFixture && sql.includes("FROM study_materials m")) return { rows: listeningFixture.flatMap(unit => unit.materials.map(material => ({ ...material, unit_id: unit.id }))) };
  throw new Error("Unexpected database access in isolated test");
} } };
function load(relative) {
  const filename = path.isAbsolute(relative) ? relative : path.join(appRoot, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  if (filename.endsWith(".json")) return JSON.parse(readFileSync(filename, "utf8"));
  const state = { exports: {} }; modules.set(filename, state);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const requireLocal = specifier => {
    if (specifier === "server-only") return {};
    if (specifier === "@/lib/db") return db;
    if (specifier === "@/lib/cloud-progress-schema") return { ensureCloudProgressSchema: async () => undefined };
    if (specifier === "@/server/first-submission") return memoryStore;
    if (specifier === "@/server/holiday-math-700/http") return { holidayAccess: () => null, holidayHeaders: { "Cache-Control": "private, no-store" }, holidayBody: async request => JSON.parse(await request.text()) };
    if (specifier === "next/server") return { NextResponse: class extends Response { static json(value, options = {}) { return new Response(JSON.stringify(value), { ...options, headers: { "Content-Type": "application/json", ...options.headers } }); } } };
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      let destination = specifier.startsWith("@/") ? path.join(appRoot, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      if (!path.extname(destination)) destination += ".ts";
      if (!existsSync(destination)) throw new Error(`Missing test dependency: ${specifier}`);
      return load(destination);
    }
    return nativeRequire(specifier);
  };
  vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${source}\n})`, { filename })(requireLocal, state, state.exports, filename, path.dirname(filename));
  return state.exports;
}

const service = load("src/server/english-locked.ts");
const six = load("src/server/english-six.ts");
const original = load("src/lib/grammar-original-500.ts");
const tense = load("src/lib/grammar-tense-500.ts");
const national = load("src/lib/national-day-english.ts");
const guide = load("src/lib/english-grammar-guide.ts");
const structure = load("src/lib/english-sentence-structure.ts");
const listening = load("src/data/listening/yiben-grade-6.json");
let checks = 0;
const verify = (condition, description) => { assert.ok(condition, description); checks++; };

for (const exerciseModule of ["six", "holiday2400", "national-day", "grammar-original", "grammar-tense", "grammar-course", "grammar-stage", "listening", "grammar-guide", "sentence-structure", "final-review", "vocab", "listening-panel"]) {
  verify(service.englishLockedModule(exerciseModule), `module ${exerciseModule} has a fixed namespace`);
}
verify(!service.englishLockedModule("unknown"), "arbitrary module is refused");
const firstQuestion = six.englishSixPaper(1).questions.find(question => question.options.length > 1);
const wrong = firstQuestion.options.find(option => option.id !== firstQuestion.answer).id;
const first = await service.englishLockedSubmit("isolation-student", "six", "subject-a", firstQuestion.id, wrong);
verify(first.feedback.correct === false, "incorrect first attempt stays incorrect");
const second = await service.englishLockedSubmit("isolation-student", "six", "subject-b", firstQuestion.id, firstQuestion.answer);
assert.deepEqual(second, first); checks++;
const records = await service.englishLockedRecords("isolation-student", "six", "subject-c");
assert.deepEqual(records[firstQuestion.id], first); checks++;
verify(!(await service.englishLockedRecords("another-student", "six", "subject-a"))[firstQuestion.id], "accounts remain separate");
const concurrentQuestion = six.englishSixPaper(1).questions.filter(question => question.options.length > 1)[1];
const concurrentWrong = concurrentQuestion.options.find(option => option.id !== concurrentQuestion.answer).id;
const concurrent = await Promise.all([
  service.englishLockedSubmit("concurrent-student", "six", "subject-a", concurrentQuestion.id, concurrentWrong),
  service.englishLockedSubmit("concurrent-student", "six", "subject-b", concurrentQuestion.id, concurrentQuestion.answer),
]);
assert.deepEqual(concurrent[0], concurrent[1]); checks++;
verify(concurrent[0].feedback.correct === false, "both concurrent callers receive the first answer");
await assert.rejects(() => service.englishLockedSubmit("invalid-student", "six", "subject-a", "u1-q999999", "A")); checks++;
verify(Object.keys(await service.englishLockedRecords("invalid-student", "six", "subject-a")).length === 0, "invalid answers do not create submissions");

const sixBank = load("src/server/english-six-bank.ts");
const bankEntry = sixBank.englishSixBankIndex().papers.find(p => p.sourceId === "981bb9fd35b0" && p.title.includes("单项选择"));
const bankQuestion = sixBank.englishSixBankPrivatePaper(bankEntry.id).questions[0];
const bankWrong = bankQuestion.options.find(o => o.id !== bankQuestion.answer).id;
const bankFirst = await service.englishLockedSubmit("isolation-bank-student", "six", "subject-a", bankQuestion.id, bankWrong);
verify(bankFirst.feedback.correct === false, "new original-question bank dispatches through the six lock namespace");
verify(bankFirst.feedback.explanation === bankQuestion.explanation, "source explanations returned after submitting");
assert.deepEqual(await service.englishLockedSubmit("isolation-bank-student", "six", "subject-b", bankQuestion.id, bankQuestion.answer), bankFirst); checks++;
verify((await service.englishLockedRecords("isolation-bank-student", "six", "subject-c"))[bankQuestion.id].feedback.correct === false, "new bank first answer persists across devices/subject URLs");
await assert.rejects(() => service.englishLockedSubmit("invalid-bank-student", "six", "subject-a", bankQuestion.id, "Z")); checks++;
verify(Object.keys(await service.englishLockedRecords("invalid-bank-student", "six", "subject-a")).length === 0, "invalid bank options do not create submissions");

const review = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/quality-review.private.json"), "utf8"));
for (const [suffix, response, expected] of [["4fcedbdeb803", "B", true], ["u4-q9", "A", null]]) {
  const change = review.changes.find(change => change.id === suffix || change.id.endsWith(`-${suffix}`));
  const key = storeKey("historic-quality", service.englishLockedScope("six"), change.id);
  saved.set(key, { answer: response, feedback: { correct: false, answer: "obsolete key", explanation: "obsolete explanation" }, submittedAt: "2026-10-01T00:00:00Z" });
  const before = JSON.stringify(saved.get(key)), count = saved.size;
  const read = (await service.englishLockedRecords("historic-quality", "six", "alias-one"))[change.id];
  verify(read.feedback.correct === expected, "historic corrected key/ambiguous stem is projected fairly");
  verify(read.feedback.contentRevision === review.revision, "current content revision is exposed only with submitted feedback");
  verify(read.response === response && read.submittedAt === "2026-10-01T00:00:00Z", "first response and timestamp remain immutable");
  assert.deepEqual(await service.englishLockedSubmit("historic-quality", "six", "alias-two", change.id, "D"), read); checks++;
  verify(JSON.stringify(saved.get(key)) === before && saved.size === count, "read and repeated submit do not mutate historic records");
}
const currentAmbiguous = await service.englishLockedSubmit("current-quality", "six", "one", "u4-q9", "A");
verify(currentAmbiguous.feedback.correct === null, "new valid alternative is never marked incorrect");
assert.deepEqual(await service.englishLockedSubmit("current-quality", "six", "two", "u4-q9", "B"), currentAmbiguous); checks++;

for (const [module, bank] of [["grammar-original", original.ORIGINAL_GRAMMAR_QUESTIONS], ["grammar-tense", tense.TENSE_GRAMMAR_QUESTIONS]]) {
  for (const question of bank) {
    verify(service.gradeEnglishLocked(module, String(question.id), question.answer).correct === true, "grammar official answer accepted");
    verify(service.gradeEnglishLocked(module, String(question.id), question.answer === "A" ? "B" : "A").correct === false, "grammar wrong answer rejected");
  }
}
for (const [module, prefix, bank] of [["grammar-guide", "gg", guide.GRAMMAR_QUIZ], ["sentence-structure", "ss", structure.QUICK_CHALLENGES]]) {
  for (const [index, question] of bank.entries()) {
    verify(service.gradeEnglishLocked(module, `${prefix}-${index + 1}`, String(question.answer)).correct === true, "quick challenge official answer accepted");
    verify(service.gradeEnglishLocked(module, `${prefix}-${index + 1}`, String((question.answer + 1) % question.choices.length)).correct === false, "quick challenge wrong answer rejected");
  }
}
for (const section of national.NATIONAL_DAY_SECTIONS) {
  for (const question of [...section.questions, ...(section.oralQuestions ?? [])]) {
    const response = question.mode === "auto" ? question.accepted.map(answers => answers[0]) : ["My first independent response."];
    const feedback = service.gradeEnglishLocked("national-day", question.id, response);
    verify(feedback.correct === (question.mode === "auto" ? true : null), "open responses are not self-awarded correct marks");
  }
}
for (const exercise of listening.exercises) {
  const response = Object.fromEntries(exercise.sections.flatMap(section => section.items).map(item => [item.id, item.type === "multi_choice" ? [...new Set(item.answer.toUpperCase().match(/[A-G]/g) ?? [])] : item.answer.split(/\s*(?:\||；|;|或)\s*/)[0]]));
  const feedback = service.gradeEnglishLocked("listening", String(exercise.number).padStart(3, "0"), response);
  verify(feedback.score === feedback.total, "all listening official answers match server evaluation");
}
verify(service.gradeEnglishLocked("grammar-course", "lesson:1:task:0", "My own answer").correct === null, "grammar open tasks stay pending review");
verify(service.gradeEnglishLocked("grammar-stage", "stage:1:question:0", "My own answer").correct === null, "stage open tasks stay pending review");
for (const [module, id] of [["grammar-course", "lesson:1:task:00"], ["grammar-course", "lesson:1:deep:00"], ["grammar-course", "lesson:1:quiz:00"], ["grammar-stage", "stage:1:question:00"]]) {
  assert.throws(() => service.gradeEnglishLocked(module, id, "My own answer")); checks++;
  await assert.rejects(() => service.englishLockedSubmit("alias-student", module, "subject-a", id, "My own answer")); checks++;
}
verify(Object.keys(await service.englishLockedRecords("alias-student", "grammar-course", "subject-a")).length === 0, "non-canonical IDs cannot create alternate locked records");

// Existing cloud history is looked up independently of caller-controlled subject.
const oldQuestion = national.NATIONAL_DAY_SECTIONS.flatMap(section => section.questions).find(question => question.mode === "auto");
const oldValues = oldQuestion.accepted.map(answers => answers[0]);
legacyRows = [{ payload: { attempts: { [oldQuestion.id]: { checked: true, values: oldValues, correct: false, at: "2026-10-01T00:00:00Z" } } }, updated_at: "2026-10-01T00:00:00Z" }];
const old = await service.englishLockedSubmit("legacy-student", "national-day", "new-alias", oldQuestion.id, oldValues);
verify(capturedPattern === "english:national-day:%:v1", "legacy lookups cannot be bypassed with another subject");
verify(old.feedback.correct === false && old.submittedAt === "2026-10-01T00:00:00Z", "historical stored outcome and time are preserved");
legacyRows = [];

// The deterministic listening builder preserves IDs across filters and visits.
const builder = load("src/lib/english-listening-bank.ts");
const units = [1, 2, 3].map(number => ({ id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`, name: `Sentence 0${number}`, sort_order: number, group_name: "新东方小学1200词", materials: [{ file_type: "audio", file_path: "/example.mp3" }], words: [{ id: `word-${number}`, word: `word${number}`, meaning: `含义${number}`, sort_order: 0 }], sentenceText: { english: `This is sentence ${number}.`, chinese: `句子${number}` } }));
const generated = builder.buildListeningQuestionsForBand(builder.LISTENING_BANDS[0], units);
verify(generated.length === 500 && new Set(generated.map(question => question.id)).size === 500, "generated question IDs are unique");
assert.deepEqual(builder.buildListeningQuestionsForBand(builder.LISTENING_BANDS[0], units), generated); checks++;
verify(generated.every(question => question.options.includes(question.answer)), "every generated question has a valid keyed option");

const sentences = load("src/lib/sentences.ts");
listeningFixture = units.map(unit => ({ ...unit, sentenceText: sentences.getSentenceText(unit.name, unit.group_name) }));
const serverGenerated = builder.buildListeningQuestionsForBand(builder.LISTENING_BANDS[0], listeningFixture);
for (const index of [0, 164, 165, 334, 335, 499]) {
  const question = serverGenerated[index];
  const feedback = await service.gradeEnglishLockedAsync("listening-panel", question.id, question.answer, db.pool);
  verify(feedback.correct === true, "dynamic listening grade reconstructs the same canonical question");
  verify((await service.gradeEnglishLockedAsync("listening-panel", question.id, question.options.find(option => option !== question.answer), db.pool)).correct === false, "dynamic listening wrong choice is not accepted");
}
await assert.rejects(() => service.gradeEnglishLockedAsync("listening-panel", serverGenerated[0].id.replace("-main-", "-detail-"), serverGenerated[0].answer, db.pool)); checks++;
await assert.rejects(() => service.gradeEnglishLockedAsync("listening-panel", serverGenerated[0].id, "forged option", db.pool)); checks++;

function request(body, exerciseModule = "six", subject = "subject-a") {
  const nextUrl = new URL(`https://example.invalid/api/english/locked?module=${exerciseModule}&subject=${subject}`);
  const req = new Request(nextUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  Object.assign(req, { nextUrl, cookies: { get: () => undefined } });
  return req;
}
const route = load("src/app/api/english/locked/route.ts");
const httpFirst = await route.POST(request({ id: firstQuestion.id, response: wrong }));
verify(httpFirst.status === 200, "central API accepts the initial answer");
const httpFirstBody = await httpFirst.json();
const httpRetry = await route.POST(request({ id: firstQuestion.id, response: firstQuestion.answer }, "six", "another-subject"));
assert.deepEqual(await httpRetry.json(), httpFirstBody); checks++;
verify((await route.POST(request({ id: "u1-q999999", response: "A", correct: true }))).status === 400, "client supplied correct marks are rejected");
verify((await route.POST(request({ id: "u1-q999999", response: "A" }, "unknown"))).status === 400, "unsupported API modules are rejected");
const oldSixRoute = load("src/app/api/english/six/practice/[unit]/route.ts");
const oldFirst = await oldSixRoute.POST(request({ id: concurrentQuestion.id, response: concurrentWrong }), { params: Promise.resolve({ unit: "1" }) });
const oldRetry = await oldSixRoute.POST(request({ id: concurrentQuestion.id, response: concurrentQuestion.answer, subject_id: "another-subject" }), { params: Promise.resolve({ unit: "1" }) });
verify(oldFirst.status === 200 && oldRetry.status === 200, "legacy six endpoint remains functional");
assert.deepEqual(await oldRetry.json(), await oldFirst.json()); checks++;

// Existing private keys, if configured, stay in memory. No answer text is logged.
if (process.env.HOLIDAY_MATH_700_KEY) {
  const privateBank = load("src/server/national-day-english-practice/private-bank.ts");
  const bankRoute = load("src/app/api/english/holiday-2400/check/route.ts");
  const keyed = privateBank.englishPracticePrivateAnswer("CH01-Q001");
  const other = keyed.correctOption === "A" ? "B" : "A";
  const oldBody = letter => ({ block_id: "CH01-B001", question_id: "CH01-Q001", answers: { "CH01-Q001": letter } });
  const originalResponse = await bankRoute.POST(request(oldBody(other)));
  verify(originalResponse.status === 200, "legacy 2400 checker saves first answer");
  const correctionResponse = await bankRoute.POST(request({ ...oldBody(keyed.correctOption), subject_id: "new-alias" }));
  const before = await originalResponse.json(), after = await correctionResponse.json();
  assert.deepEqual(after, before); checks++;
  verify(after.score === 0, "legacy checker cannot improve first wrong score");
}

console.log(JSON.stringify({ checks, modules: 13, outcome: "pass", database: "in-memory only" }));
