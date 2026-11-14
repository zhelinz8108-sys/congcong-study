import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { loadHolidayTestModule } from './holiday-math-test-utils.mjs';

const app = process.cwd(), root = 'content/english-extension/';
const raw = await readFile(root + 'questions.public.json', 'utf8');
const source = JSON.parse(raw);
const editionRaw = await readFile(root + 'short-choices.public.json', 'utf8');
const edition = JSON.parse(editionRaw);
const audit = JSON.parse(await readFile(root + 'short-choices.audit.json', 'utf8'));
const short = await loadHolidayTestModule('src/server/extension-practice/short-choices.ts');
short.validateShortChoices(edition, raw, source.questions);
assert.equal(audit.shortChoicesDigest, createHash('sha256').update(editionRaw).digest('hex'));
assert.equal(audit.totalChoices, 600);
for (const change of [
  e => { delete e.questions['EX-0-001']; },
  e => { e.questions['EX-0-001'].choices[1] = e.questions['EX-0-001'].choices[0]; },
  e => { e.questions['EX-0-001'].choices[0] = 'one two three four five six'; },
  e => { e.sourcePublicDigest = 'stale'; },
]) {
  const invalid = structuredClone(edition); change(invalid);
  assert.throws(() => short.validateShortChoices(invalid, raw, source.questions));
}
const secret = randomBytes(32).toString('hex');
const envelope = await loadHolidayTestModule('src/server/english-six-knowledge-envelope.ts');
const temp = await mkdtemp(path.join(tmpdir(), 'english-short-choices-'));
const previousSecret = process.env.HOLIDAY_MATH_700_KEY;
try {
  await mkdir(path.join(temp, root), { recursive: true });
  await writeFile(path.join(temp, root, 'questions.public.json'), raw);
  await writeFile(path.join(temp, root, 'short-choices.public.json'), editionRaw);
  // Rotate a synthetic key through A–D. This tests mapping, never assumes the
  // production answer from public content, and never accesses learner records.
  const answers = source.questions.map(q => ({ id: q.id,
    accepted: [q.kind === '选择题' ? q.inputs[0].choices[(q.number + q.chapter) % 4] : 'synthetic fill'],
    numeric: false, answerText: 'PRIVATE SYNTHETIC ANSWER', explanation: 'PRIVATE SYNTHETIC EXPLANATION',
  }));
  await writeFile(path.join(temp, root, 'answers.encrypted.json'), JSON.stringify(envelope.encryptEnglishSixKnowledge({
    version: 1, subject: 'english', publicDigest: createHash('sha256').update(raw).digest('hex'), answers,
  }, envelope.englishSixKnowledgePublicKey(secret))));
  process.env.HOLIDAY_MATH_700_KEY = secret;
  process.chdir(temp);
  const bank = await loadHolidayTestModule(path.join(app, 'src/server/extension-practice/bank.ts'));
  const manifest = await bank.extensionManifest('english');
  assert.equal(manifest.version, 'english-extension-short-v2');
  assert.equal(manifest.total, 1200);
  assert.equal(new Set(manifest.collections.flatMap(c => c.questions.map(q => q.id))).size, 1200);
  const first = await bank.extensionQuestion('english', 'EX-0-201');
  assert.equal(first.prompt, 'I ___ afraid yesterday, but I ___ happy now.');
  assert.deepEqual(first.inputs[0].choices, ['A. did; am', 'B. am; was', 'C. was; am', 'D. were; am']);
  let checked = 0;
  for (const original of source.questions) {
    const choice = original.kind === '选择题';
    const id = choice ? short.shortChoiceId(original.id) : original.id;
    const q = await bank.extensionQuestion('english', id);
    assert.ok(q);
    assert.ok(!JSON.stringify(q).includes('PRIVATE SYNTHETIC'));
    assert.ok(!Object.keys(q).some(key => ['accepted', 'explanation', 'answerText'].includes(key)));
    if (!choice) {
      assert.equal(id, original.id);
      assert.equal(await bank.isRetiredExtensionQuestion('english', id), false);
      assert.equal(q.prompt, original.prompt);
      assert.deepEqual(q.inputs, original.inputs);
      assert.equal((await bank.extensionFeedback('english', id, { answer: 'synthetic fill' })).outcome, 'correct');
      continue;
    }
    assert.equal(await bank.extensionQuestion('english', original.id), undefined);
    assert.equal(await bank.isRetiredExtensionQuestion('english', original.id), true);
    assert.equal(await bank.isRetiredExtensionQuestion('english', id), false);
    const correctIndex = (q.number + q.chapter) % 4;
    for (const [index, answer] of q.inputs[0].choices.entries()) {
      const feedback = await bank.extensionFeedback('english', id, { answer });
      assert.equal(feedback.outcome, index === correctIndex ? 'correct' : 'incorrect', id);
      assert.equal(feedback.questionId, id);
      assert.equal(feedback.answerText, `正确选项：${q.inputs[0].choices[correctIndex]}`);
      assert.ok(feedback.detailedSolution.steps[0].content.includes('PRIVATE SYNTHETIC EXPLANATION'));
      checked++;
    }
    if (original.inputs[0].choices[correctIndex].split(/\s+/).length > 6) {
      assert.equal((await bank.extensionFeedback('english', id, { answer: original.inputs[0].choices[correctIndex] })).outcome, 'incorrect');
    }
  }
  console.log(JSON.stringify({ passed: true, choiceQuestions: 600, optionMappings: checked, unchangedFillQuestions: 600,
    oldChoiceIdsIsolated: true, privateAnswersPreserved: true, maxOptionWords: 5, productionWrites: 0 }));
} finally {
  process.chdir(app);
  if (previousSecret === undefined) delete process.env.HOLIDAY_MATH_700_KEY;
  else process.env.HOLIDAY_MATH_700_KEY = previousSecret;
  await rm(temp, { recursive: true, force: true });
}
