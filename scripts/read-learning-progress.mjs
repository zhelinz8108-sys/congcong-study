// Runs only inside the existing production app. No raw records leave this process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes, createCipheriv, publicEncrypt, constants } from 'node:crypto';

const app = '/www/study-plan';
const recipientPublicKey = "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAt+kQG2Y0UrA38CWq8/Hr\nWGHQbaQ1chcb/6NYU8Le/MJ/oLvC/K3v0CZvbWkOv9UF2i0BYLT28mLPuf8LGZch\nl0i/fhpLZiBdlKQhZp2IP95DsJFn4W1gSvKwNrGTbt1TXupicRo5/FNjxQH3YCED\novX+RvTfBnxLow53rkcGVU80F+QpJuZbvsa1wZ+jkVDyzJXIA19Sn9LzuNyX/T3E\np62gwG5MorAj6qLciZHMXmZLADyRvgM/ouYtWeBtAi4vz/GFUkw1NPHY2g0Pb830\nV2gKQxXnrWvBir9MYajEF8uhE4A6jprYaPEBOvkJdmHBxgos1MNwoRGvz2WQkmO/\nE7cIeqZ3irgIGYGsLfKWbuR3HtJx8lLjX4fsfr/0cBkNa9t3QJ663M9PiXRzy27G\nS/yml9P322zw9U/wd024TEnctCpsIr0OOGhxrVa3ci5RP5xuWtRdjnOQNmz3NLE+\n9hS3sWhTvpffqGE9gpzbe7JnNYQVKwh+kzTWoKWz8AcpAgMBAAE=\n-----END PUBLIC KEY-----\n";
const require = createRequire(path.join(app, 'package.json'));
let stage = 'runtime-env', pool;
function emitEncrypted(report) {
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('learning-progress-20261103'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
  const wrapped = publicEncrypt({ key: recipientPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256' }, key);
  const chunks = bytes => bytes.toString('base64').match(/.{1,240}/g) || [];
  console.log(JSON.stringify({ status: 'encrypted-readonly-learning-progress', version: 1,
    algorithm: 'RSA-OAEP-SHA256+A256GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    wrappedKey: chunks(wrapped), ciphertext: chunks(ciphertext) }));
}
const latest = values => values.filter(Boolean).map(value => new Date(value).toISOString()).sort().at(-1) || null;
const locked = response => !!response && (response.submitted === true || response.submissions > 0);
const stats = (ids, records) => {
  const all = [...new Set(ids)];
  const done = all.flatMap(id => records.has(id) ? [records.get(id)] : []);
  const correct = done.filter(row => row.correct === true).length;
  const incorrect = done.filter(row => row.correct === false).length;
  return { total: all.length, answered: done.length, remaining: all.length - done.length,
    completionPercent: all.length ? Math.round(done.length / all.length * 10000) / 100 : null,
    correct, incorrect, review: done.length - correct - incorrect,
    accuracyPercent: correct + incorrect ? Math.round(correct / (correct + incorrect) * 100) : null,
    lastSubmittedAt: latest(done.map(row => row.at)) };
};

async function run() {
  assert.equal(process.cwd(), app);
  process.env.NODE_ENV = 'production';
  process.env.PGOPTIONS = `${process.env.PGOPTIONS || ''} -c default_transaction_read_only=on -c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000`;
  // Load the existing service environment through the app's normal env SDK.
  // Credentials stay in this remote process and are never logged or exported.
  const envLoader = require('@next/env'), silent = { info() {}, error() {} };
  const envFile = fs.openSync('/etc/study-plan.env', fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(envFile);
    assert.ok(info.isFile() && info.uid === 0 && !(info.mode & 0o077) && info.size <= 131072);
    const [, serviceEnv] = envLoader.processEnv([{ path: '/etc/study-plan.env',
      contents: fs.readFileSync(envFile, 'utf8'), env: {} }], app, silent, true);
    envLoader.updateInitialEnv(serviceEnv || {});
  } finally { fs.closeSync(envFile); }
  envLoader.loadEnvConfig(app, false, silent);
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'study_plan', user: process.env.PGUSER || 'study_plan',
    password: process.env.PGPASSWORD, max: 1, connectionTimeoutMillis: 10000,
    options: process.env.PGOPTIONS });
  stage = 'database-connect';
  const client = await pool.connect();
  let mathRows, mathFirst, englishFirst, capturedAt;
  try {
    stage = 'database-snapshot';
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const guard = await client.query("SELECT current_setting('transaction_read_only') AS readonly, transaction_timestamp() AS captured_at");
    assert.equal(guard.rows[0].readonly, 'on');
    capturedAt = new Date(guard.rows[0].captured_at).toISOString();
    // Excluding plain drafts does not change bankStats' completion or legacy fallback.
    mathRows = (await client.query(`SELECT question_id, answers, submitted, outcome, score, max_score,
      submissions, updated_at, revision FROM grade6_bank_responses
      WHERE student_id=$1 AND (submitted=TRUE OR submissions>0)
      ORDER BY (submitted OR submissions>0) ASC, updated_at DESC LIMIT 10001`, ['congcong'])).rows;
    mathFirst = (await client.query(`SELECT question_id, feedback->'response' AS response
      FROM student_first_submissions WHERE student_id=$1 AND scope=$2
      ORDER BY submitted_at, question_id LIMIT 10001`, ['congcong', 'math:grade6-bank:v1'])).rows;
    englishFirst = (await client.query(`SELECT question_id, answer, feedback, submitted_at
      FROM student_first_submissions WHERE student_id=$1 AND scope=$2
      ORDER BY submitted_at, question_id LIMIT 20001`, ['congcong', 'english:locked:six:v1'])).rows;
    assert.ok(mathRows.length <= 10000 && mathFirst.length <= 10000 && englishFirst.length <= 20000);
    await client.query('ROLLBACK');
  } finally { client.release(); await pool.end(); }

  // Existing source loader strips server-only markers; these modules only read
  // existing material files and compute feedback. Never import progress/schema writers.
  stage = 'math-materials';
  const { loadHolidayTestModule } = await import(pathToFileURL(path.join(app, 'scripts/holiday-math-test-utils.mjs')));
  const { getBankManifest } = await loadHolidayTestModule('src/server/grade6-bank/bank.ts');
  const { projectBankProgress } = await loadHolidayTestModule('src/server/grade6-bank/result-grading.ts');
  const { bankStats } = await loadHolidayTestModule('src/lib/grade6-bank-types.ts');
  const manifest = await getBankManifest();
  const responses = {};
  for (const row of mathRows) responses[row.question_id] = { answers: row.answers, submitted: row.submitted,
    outcome: row.outcome, score: row.score, maxScore: row.max_score, submissions: row.submissions,
    updatedAt: new Date(row.updated_at).toISOString(), revision: row.revision };
  for (const row of mathFirst) { assert.ok(row.response && typeof row.response === 'object'); responses[row.question_id] = row.response; }
  stage = 'math-projection';
  const view = await projectBankProgress({ responses, lastQuestionId: '', updatedAt: '' });
  const mathRecords = new Map();
  for (const [id, response] of Object.entries(view.responses)) {
    const shown = locked(response) ? response : response.previousSubmission?.submitted ? response.previousSubmission : null;
    if (shown) mathRecords.set(id, { correct: shown.outcome === 'correct' ? true : shown.outcome === 'incorrect' ? false : null, at: shown.updatedAt });
  }
  const mathIds = manifest.collections.flatMap(collection => collection.questions.map(question => question.id));
  assert.equal(new Set(mathIds).size, manifest.total);
  const mathSummary = stats(mathIds, mathRecords);
  assert.equal(mathSummary.answered, bankStats(mathIds, view.responses).answered);
  assert.equal(mathSummary.correct, bankStats(mathIds, view.responses).correct);
  const math = { ...mathSummary,
    archivedSubmissions: [...mathRecords.keys()].filter(id => !mathIds.includes(id)).length,
    collections: manifest.collections.map(collection => ({ title: collection.title, mode: collection.mode,
      chapter: collection.chapter, ...stats(collection.questions.map(question => question.id), mathRecords) })) };

  stage = 'english-materials';
  const six = await loadHolidayTestModule('src/server/english-six.ts');
  const bank = await loadHolidayTestModule('src/server/english-six-bank.ts');
  const reader = await loadHolidayTestModule('src/server/english-six-reader-practice.ts');
  const { englishSixResourceScope } = await loadHolidayTestModule('src/lib/english-six.ts');
  const { readerLayout } = await loadHolidayTestModule('src/lib/english-six-document.ts');
  const { englishSixReviewedFeedback } = await loadHolidayTestModule('src/server/english-six-quality.ts');
  const index = six.englishSixIndex();
  const units = Array.from({ length: 8 }, (_, i) => six.englishSixPaper(i + 1));
  assert.ok(units.every(paper => paper?.questions?.length));
  const unitIds = units.flatMap(paper => paper.questions.map(question => question.id));
  const papers = bank.englishSixBankIndex().papers.map(paper => bank.englishSixBankPrivatePaper(paper.id));
  assert.ok(papers.every(paper => paper?.questions));
  const bankIds = papers.flatMap(paper => paper.questions.map(question => question.id));
  const readerByUnit = new Map(Array.from({ length: 8 }, (_, i) => [i + 1, new Set()]));
  const readerIds = new Set();
  for (const meta of index.resources.filter(resource => readerLayout(resource.id))) {
    const resource = six.englishSixResource(meta.id);
    assert.ok(resource?.pages);
    for (let page = 1; page <= resource.pages.length; page++) for (const question of reader.englishSixReaderExercises(meta.id, page)) {
      readerIds.add(question.id);
      for (const unit of englishSixResourceScope(meta).units) readerByUnit.get(unit)?.add(question.id);
    }
  }
  const allEnglishIds = new Set([...unitIds, ...bankIds, ...readerIds]);
  stage = 'english-projection';
  const englishRecords = new Map();
  for (const row of englishFirst) {
    if (!allEnglishIds.has(row.question_id)) continue;
    const feedback = englishSixReviewedFeedback(row.question_id, row.feedback, () => {
      const match = /^u([1-8])-q[1-9]\d*$/.exec(row.question_id);
      const value = match ? six.englishSixGrade(Number(match[1]), row.question_id, row.answer)
        : row.question_id.startsWith('sr-') ? reader.englishSixReaderGrade(row.question_id, row.answer)
        : bank.englishSixBankGrade(row.question_id, row.answer);
      assert.ok(value);
      return value;
    });
    englishRecords.set(row.question_id, { correct: feedback.correct, at: row.submitted_at });
  }
  const english = { ...stats(allEnglishIds, englishRecords),
    unitAssessments: stats(unitIds, englishRecords), originalBank: stats(bankIds, englishRecords),
    readerExercises: stats(readerIds, englishRecords),
    archivedSubmissions: englishFirst.filter(row => !allEnglishIds.has(row.question_id)).length,
    units: units.map((paper, index) => ({ unit: index + 1,
      assessment: stats(paper.questions.map(question => question.id), englishRecords),
      originalBank: stats(papers.filter(paper => paper.unit === index + 1).flatMap(paper => paper.questions.map(question => question.id)), englishRecords),
      readerExercises: stats(readerByUnit.get(index + 1), englishRecords) })) };
  // Output only aggregate counts, public curriculum titles and timestamps.
  const report = { status: 'verified-readonly-learning-progress', capturedAt,
    readOnlyTransaction: true, studentRecordWrites: 0, math, english };
  // Keep learner statistics private in CI logs; only the local task owns the recipient key.
  emitEncrypted(report);
}

try { await run(); }
catch (error) {
  if (pool) await pool.end().catch(() => {});
  const allowedCodes = new Set(['28P01', '28000', 'ECONNREFUSED', 'ENOTFOUND', '42P01',
    '42703', '57014', 'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_RESOLVE_REQUEST', 'ERR_ASSERTION']);
  emitEncrypted({ status: 'readonly-learning-progress-failed', stage,
    code: allowedCodes.has(error?.code) ? error.code : 'unclassified' });
}
