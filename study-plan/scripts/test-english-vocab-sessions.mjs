import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Execute the actual route, server graders and INSERT-only ledger against an
// isolated transactional SQL adapter. No credentials, network or student data.
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { NextRequest, NextResponse } = require("next/server");
const rows = new Map(), lockTails = new Map(), cache = new Map(), queries = [];
const key = (student, scope, id) => JSON.stringify([student, scope, id]);
const roundCounts = new Map();
const words = new Map([
  ["word-school", { id: "word-school", word: "school", meaning: "学校" }],
  ["word-book", { id: "word-book", word: "book", meaning: "书" }],
  ["word-cat", { id: "word-cat", word: "cat", meaning: "猫" }],
]);
let inserts = 0, grades = 0;
function seed(student, scope, id, correct = false, answer = "old response") {
  rows.set(key(student, scope, id), { answer, feedback: { correct, answer: "historic answer", explanation: "historic feedback" }, submitted_at: "2020-01-01T00:00:00.000Z" });
}
async function query(raw, args = [], client) {
  const sql = raw.trim().replace(/\s+/g, " ");
  queries.push({ sql, args: structuredClone(args) });
  if (sql.startsWith("CREATE TABLE")) return { rows: [] };
  if (sql === "BEGIN") return { rows: [] };
  if (sql === "COMMIT" || sql === "ROLLBACK") {
    client?.unlock?.(); if (client) client.unlock = undefined;
    return { rows: [] };
  }
  if (sql.includes("pg_advisory_xact_lock")) {
    const previous = lockTails.get(args[0]) ?? Promise.resolve();
    let unlock;
    const held = new Promise(resolve => { unlock = resolve; });
    lockTails.set(args[0], previous.then(() => held));
    await previous; client.unlock = unlock;
    return { rows: [] };
  }
  if (sql === "SELECT id, word, meaning FROM study_sentence_words WHERE id=$1") {
    grades++;
    return { rows: words.has(args[0]) ? [structuredClone(words.get(args[0]))] : [] };
  }
  if (sql === "SELECT DISTINCT question_id FROM student_first_submissions WHERE student_id=$1 AND (scope=$2 OR scope ~ $3) AND feedback->'correct' = 'false'::jsonb ORDER BY question_id") {
    const scopePattern = new RegExp(args[2]);
    const matches = [...rows].filter(([identity, row]) => {
      const [student, scope] = JSON.parse(identity);
      return student === args[0] && (scope === args[1] || scopePattern.test(scope)) && row.feedback.correct === false;
    });
    return { rows: [...new Set(matches.map(([identity]) => JSON.parse(identity)[2]))].sort().map(question_id => ({ question_id })) };
  }
  if (sql.startsWith("SELECT") && sql.includes("FROM student_first_submissions WHERE student_id=$1 AND scope=$2")) {
    return { rows: [...rows].filter(([identity]) => {
      const [student, scope, id] = JSON.parse(identity);
      return student === args[0] && scope === args[1] && (args.length < 3 || id === args[2]);
    }).map(([identity, row]) => ({ ...structuredClone(row), question_id: JSON.parse(identity)[2] })) };
  }
  if (sql.startsWith("INSERT INTO practice_rounds")) {
    const round = JSON.stringify(args.slice(0, 3));
    roundCounts.set(round, (roundCounts.get(round) ?? 0) + args[3]);
    return { rows: [] };
  }
  if (sql.startsWith("INSERT INTO student_first_submissions")) {
    const identity = key(...args.slice(0, 3));
    assert.ok(!rows.has(identity), "Existing first submissions must not be overwritten");
    const row = { answer: JSON.parse(args[3]), feedback: JSON.parse(args[4]), submitted_at: args[5] };
    rows.set(identity, row); inserts++;
    return { rows: [structuredClone(row)] };
  }
  throw new Error(`Unexpected isolated SQL: ${sql.slice(0, 160)}`);
}
const pool = {
  query,
  connect: async () => {
    const client = { query: (sql, args) => query(sql, args, client), release: () => client.unlock?.() };
    return client;
  },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const loaded = { exports: {} }; cache.set(filename, loaded.exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const dependency = specifier => {
    if (specifier === "server-only") return {};
    if (specifier === "@/lib/db") return { pool };
    if (specifier === "@/server/holiday-math-700/http") return {
      holidayHeaders: { "Cache-Control": "private, no-store" },
      holidayAccess: request => request.headers.get("x-fixture-access") === "denied"
        ? NextResponse.json({ error: "fixture unauthorized" }, { status: 401 })
        : request.headers.get("x-fixture-access") === "cross-site"
          ? NextResponse.json({ error: "fixture cross-site" }, { status: 403 }) : null,
    };
    if (specifier === "@/lib/english-grammar-guide") return {
      GRAMMAR_QUIZ: [{ choices: ["first", "second"], answer: 1, explanation: "server grammar explanation" }],
    };
    if (specifier === "@/server/english-six") return {
      englishSixGrade: (_unit, _id, response) => ({ correct: response === "right", answer: "right", explanation: "fixture six server grader" }),
    };
    if (specifier === "@/server/english-six-quality") return {
      englishSixQualityRevision: () => undefined,
      englishSixReviewedFeedback: (_id, feedback) => feedback,
    };
    if (specifier === "@/data/listening/yiben-grade-6.json") return { exercises: [] };
    if (["@/lib/family-access", "@/lib/cloud-progress-schema", "@/server/first-submission", "@/server/dot/rounds", "@/server/english-vocab-lock", "@/server/english-locked"].includes(specifier)) {
      return load(`src/${specifier.slice(2)}.ts`);
    }
    if (specifier.startsWith("@/")) return {}; // Other exercise banks are outside these fixtures.
    return require(specifier);
  };
  new Function("require", "module", "exports", code)(dependency, loaded, loaded.exports);
  return loaded.exports;
}
const server = load("src/server/english-locked.ts");
const route = load("src/app/api/english/locked/route.ts");
const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";
const sessionC = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const base = server.englishLockedScope("vocab");
const scopeA = server.englishLockedScope("vocab", sessionA), scopeB = server.englishLockedScope("vocab", sessionB);
assert.equal(base, "english:locked:vocab:v1");
assert.equal(scopeA, `${base}:session:${sessionA}`);
assert.equal(scopeA.length, 68);
assert.match(scopeA, /^[a-z0-9][a-z0-9:_-]{0,127}$/i);
const checks = [];

seed("learner", base, "en-zh:word-school");
const oldBefore = structuredClone(rows.get(key("learner", base, "en-zh:word-school")));
assert.deepEqual(await server.englishLockedRecords("learner", "vocab", "subject", sessionA), {});
const fresh = await server.englishLockedSubmit("learner", "vocab", "subject", "en-zh:word-school", "学校", sessionA);
assert.equal(fresh.feedback.correct, true);
assert.equal(fresh.response, "学校");
assert.deepEqual(rows.get(key("learner", base, "en-zh:word-school")), oldBefore);
assert.equal((await server.englishLockedRecords("learner", "vocab", "subject"))["en-zh:word-school"].feedback.correct, false);
assert.deepEqual(await server.englishLockedRecords("learner", "vocab", "subject", sessionB), {});
checks.push("new-session-starts-empty-and-regrades-with-server-without-changing-global-history");

const gradeBefore = grades, insertBefore = inserts;
const race = await Promise.all([
  server.englishLockedSubmit("learner", "vocab", "subject", "en-zh:word-book", "wrong", sessionA),
  server.englishLockedSubmit("learner", "vocab", "alias", "en-zh:word-book", "书", sessionA),
]);
assert.equal(grades - gradeBefore, 1);
assert.equal(inserts - insertBefore, 1);
assert.deepEqual(race[0], race[1]);
assert.equal(race[0].feedback.correct, false);
assert.equal((await server.englishLockedSubmit("learner", "vocab", "alias", "en-zh:word-book", "书", sessionA)).response, "wrong");
assert.equal((await server.englishLockedSubmit("learner", "vocab", "subject", "en-zh:word-book", "书", sessionB)).feedback.correct, true);
assert.equal((await server.englishLockedSubmit("other-learner", "vocab", "subject", "en-zh:word-book", "书", sessionA)).feedback.correct, true);
assert.equal((await server.englishLockedSubmit("learner", "vocab", "subject", "zh-en:word-book", "BOOK", sessionA)).feedback.correct, true);
assert.deepEqual(rows.get(key("learner", base, "en-zh:word-school")), oldBefore);
checks.push("same-session-concurrent-retries-are-immutable-across-subject-aliases-while-sessions-students-and-directions-stay-independent");

await assert.rejects(server.englishLockedSubmit("learner", "vocab", "subject", "en-zh:missing-word", "answer", sessionA));
assert.ok(!rows.has(key("learner", scopeA, "en-zh:missing-word")));
for (const session of ["", sessionC.toUpperCase(), sessionA.replaceAll("-", ""), "00000000-0000-0000-0000-000000000000", `${sessionA}:other`, null]) {
  assert.throws(() => server.englishLockedScope("vocab", session));
}
assert.throws(() => server.englishLockedScope("grammar-guide", sessionA));
await assert.rejects(server.englishLockedRecords("learner", "grammar-guide", "subject", sessionA));
await assert.rejects(server.englishLockedSubmit("learner", "grammar-guide", "subject", "gg-1", "1", sessionA));
checks.push("invalid-session-identities-and-session-parameters-on-other-modules-fail-before-saving");

const apiStudent = "congcong";
seed(apiStudent, base, "en-zh:word-school");
seed(apiStudent, scopeA, "en-zh:word-book");
seed(apiStudent, scopeB, "zh-en:word-cat");
seed(apiStudent, scopeB, "en-zh:word-school");
for (const scope of [`${base}:other`, `${scopeA}:extra`, `prefix:${scopeA}`, `${base}:session:${sessionC.toUpperCase()}`, `${base}:session:not-a-uuid`, "english:locked:grammar-guide:v1"]) {
  seed(apiStudent, scope, "en-zh:excluded-word");
}
seed("another-student", scopeA, "en-zh:foreign-word");
seed(apiStudent, scopeB, "en-zh:correct-word", true);
seed(apiStudent, scopeB, "en-zh:ungraded-word", null);
seed(apiStudent, scopeB, "en-zh:string-false-word", "false");
seed(apiStudent, scopeB, "not-a-vocab-question");
assert.deepEqual(await server.englishVocabMistakeWordIds(apiStudent), ["word-book", "word-cat", "word-school"]);
await assert.rejects(server.englishVocabMistakeWordIds("invalid student"));
checks.push("historical-mistakes-combine-only-exact-global-and-valid-session-scopes-for-the-current-student-without-returning-scores");

const request = (params, body, headers = {}) => new NextRequest(`http://fixture.test/api/english/locked?${params}`, {
  method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const sessionParams = (session, module = "vocab") => new URLSearchParams({ module, subject: "subject", session }).toString();
const vocabParams = new URLSearchParams({ module: "vocab", subject: "subject" }).toString();
let response = await route.GET(request(sessionParams(sessionC)));
assert.equal(response.status, 200);
assert.equal(response.headers.get("Cache-Control"), "private, no-store");
assert.deepEqual(await response.json(), { records: {}, mistakeWordIds: ["word-book", "word-cat", "word-school"] });
response = await route.GET(request(vocabParams));
const legacyBody = await response.json();
assert.deepEqual(Object.keys(legacyBody.records), ["en-zh:word-school"]);
assert.deepEqual(legacyBody.mistakeWordIds, ["word-book", "word-cat", "word-school"]);
assert.equal(legacyBody.records["en-zh:word-school"].feedback.correct, false);
const historicalApiRow = structuredClone(rows.get(key(apiStudent, base, "en-zh:word-school")));
response = await route.POST(request(sessionParams(sessionC), { id: "en-zh:word-school", response: "学校" }));
assert.equal(response.status, 200);
const posted = (await response.json()).record;
assert.equal(posted.feedback.correct, true);
response = await route.POST(request(sessionParams(sessionC), { id: "en-zh:word-school", response: "wrong" }));
assert.deepEqual((await response.json()).record, posted);
assert.equal(roundCounts.get(JSON.stringify(["congcong", "英语单词", sessionC])), 1, "A replay cannot count twice in the round");
response = await route.GET(request(sessionParams(sessionC)));
assert.deepEqual(Object.keys((await response.json()).records), ["en-zh:word-school"]);
assert.deepEqual(rows.get(key(apiStudent, base, "en-zh:word-school")), historicalApiRow);
checks.push("actual-api-GET-separates-fresh-session-records-from-historical-mistakes-and-POST-remains-idempotent");

for (const params of [
  ...["", sessionC.toUpperCase(), sessionA.replaceAll("-", ""), `${sessionA}:extra`, "bad"].map(value => sessionParams(value)),
  `${sessionParams(sessionA)}&session=${sessionB}`,
  sessionParams(sessionA, "grammar-guide"),
  sessionParams(sessionA, "six"),
  sessionParams("", "grammar-guide"),
]) {
  const queryBefore = queries.length;
  assert.equal((await route.GET(request(params))).status, 400);
  assert.equal((await route.POST(request(params, { id: "en-zh:word-school", response: "学校" }))).status, 400);
  assert.equal(queries.length, queryBefore, "Invalid query parameters must not reach the database");
}
assert.equal((await route.POST(request(sessionParams(sessionC), { id: "en-zh:word-book", response: "书", correct: true }))).status, 400);
assert.equal((await route.GET(request(vocabParams, undefined, { "x-fixture-access": "denied" }))).status, 401);
assert.equal((await route.POST(request(vocabParams, { id: "en-zh:word-book", response: "书" }, { "x-fixture-access": "cross-site" }))).status, 403);
checks.push("actual-api-rejects-malformed-duplicate-and-nonvocab-session-parameters-preserving-body-and-access-guards");

const grammarScope = server.englishLockedScope("grammar-guide");
seed(apiStudent, grammarScope, "gg-1");
const grammarBefore = structuredClone(rows.get(key(apiStudent, grammarScope, "gg-1")));
const grammarParams = new URLSearchParams({ module: "grammar-guide", subject: "subject" }).toString();
response = await route.GET(request(grammarParams));
assert.equal(response.status, 200);
const grammarBody = await response.json();
assert.deepEqual(Object.keys(grammarBody), ["records"]);
assert.equal(grammarBody.records["gg-1"].feedback.correct, false);
response = await route.POST(request(grammarParams, { id: "gg-1", response: "1" }));
assert.equal(response.status, 200);
assert.equal((await response.json()).record.feedback.correct, false);
assert.deepEqual(rows.get(key(apiStudent, grammarScope, "gg-1")), grammarBefore);
assert.equal((await server.englishLockedSubmit("fresh-grammar-student", "grammar-guide", "subject", "gg-1", "1")).feedback.correct, true);
const sixScope = server.englishLockedScope("six");
seed(apiStudent, sixScope, "u1-q1");
const sixBefore = structuredClone(rows.get(key(apiStudent, sixScope, "u1-q1")));
const sixParams = new URLSearchParams({ module: "six", subject: "subject" }).toString();
response = await route.GET(request(sixParams));
assert.equal(response.status, 200);
const sixBody = await response.json();
assert.deepEqual(Object.keys(sixBody), ["records"]);
assert.deepEqual(Object.keys(sixBody.records), ["u1-q1"]);
response = await route.POST(request(sixParams, { id: "u1-q1", response: "right" }));
assert.equal(response.status, 200);
assert.equal((await response.json()).record.feedback.correct, false);
assert.deepEqual(rows.get(key(apiStudent, sixScope, "u1-q1")), sixBefore);
assert.equal((await server.englishLockedSubmit("fresh-six-student", "six", "subject", "u1-q1", "right")).feedback.correct, true);
assert.deepEqual(rows.get(key("learner", base, "en-zh:word-school")), oldBefore);
checks.push("nonvocab-requests-retain-their-original-global-locking-and-server-grading-contract");

console.log(JSON.stringify({ passed: true, checks, fixtureInserts: inserts, studentWrites: 0, networkCalls: 0 }));
