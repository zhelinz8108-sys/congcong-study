import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
import {loadHolidayTestModule} from './holiday-math-test-utils.mjs';
const crypto=await loadHolidayTestModule('src/server/english-six-knowledge-envelope.ts');
const bank=await loadHolidayTestModule('src/server/extension-practice/bank.ts');
const secret=process.env.HOLIDAY_MATH_700_KEY?.trim();
assert.ok(secret,'Existing answer service configuration is required');
const port=process.argv[2];assert.ok(!port||['3001','3002'].includes(port),'Only the existing local release ports are allowed');
let headers;
if(port) {
 const secret=(process.env.FAMILY_ACCESS_SECRET||process.env.FAMILY_ACCESS_PASSWORD||'').trim();assert.ok(secret);
 const payload=`v1.${Date.now()+600000}`;headers={Cookie:`congcong_family_access=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`};
}
let total=0,acceptedChecked=0,publicReads=0;
for(const subject of ['math','english']) {
 const root=`content/${subject}-extension/`,raw=await readFile(root+'questions.public.json','utf8'),data=JSON.parse(raw);
 const encrypted=JSON.parse(await readFile(root+'answers.encrypted.json','utf8'));
 const privateData=crypto.decryptEnglishSixKnowledge(encrypted,secret);
 assert.equal(privateData.subject,subject);assert.equal(privateData.publicDigest,createHash('sha256').update(raw).digest('hex'));
 const rows=new Map(privateData.answers.map(row=>[row.id,row]));assert.equal(rows.size,privateData.answers.length);
 if(subject==='math') {
  assert.equal(data.manifest.version,'math-extension-astra-v2','Publish the complete Astra math release');
  const audit=JSON.parse(await readFile(root+'audit.public.json','utf8'));
  assert.equal(audit.publicDigest,privateData.publicDigest);
  assert.equal(audit.authoringModel,'gpt-6-astra');assert.equal(audit.total,800);
 }
 const count=subject==='math'?100:150;assert.equal(data.questions.length,8*count);assert.equal(rows.size,data.questions.length);
 const ids=new Set(),prompts=new Set();
 for(const q of data.questions) {
  assert.ok(!ids.has(q.id));ids.add(q.id);
  const normalized=q.prompt.normalize('NFKC').replace(/\s+/g,' ').trim();assert.ok(!prompts.has(normalized),`${q.id} repeated prompt`);prompts.add(normalized);
  assert.ok(!Object.keys(q).some(key=>['accepted','answer','answerText','explanation','rules'].includes(key)));
  assert.equal(q.inputs.length,1);assert.equal(q.inputs[0].id,'answer');assert.deepEqual(q.resultInputIds,['answer']);
  const row=rows.get(q.id);assert.ok(row?.explanation.trim().length>=25);assert.ok(row.accepted.length>0);
  if(subject==='math') {
   assert.equal(q.id,`MX-${q.chapter}-${String(q.number+200).padStart(3,'0')}`);
   assert.equal(row.authoring?.model,'gpt-6-astra');
  }
  if(q.kind==='选择题') {assert.equal(q.inputs[0].choices.length,4);assert.equal(new Set(q.inputs[0].choices).size,4);assert.ok(row.accepted.every(v=>q.inputs[0].choices.includes(v)));}
  else assert.equal(q.kind,'填空题');
  for(const answer of row.accepted) {assert.equal((await bank.extensionFeedback(subject,q.id,{answer})).outcome,'correct',q.id+' canonical result');acceptedChecked++;}
  assert.equal((await bank.extensionFeedback(subject,q.id,{answer:'__not_an_answer__'})).outcome,'incorrect');
  total++;
 }
 const manifest=await bank.extensionManifest(subject);assert.equal(manifest.total,8*count);assert.equal(manifest.collections.length,8);
 for(const collection of manifest.collections) {
  assert.equal(collection.questionCount,count);assert.equal(collection.questions.length,count);
  const questions=data.questions.filter(q=>q.collectionId===collection.id);
  assert.equal(questions.length,count);assert.equal(questions.filter(q=>q.kind==='选择题').length,count/2);assert.equal(questions.filter(q=>q.kind==='填空题').length,count/2);
  assert.deepEqual(collection.questions.map(q=>q.id),questions.map(q=>q.id));
  if(port) for(const kind of ['选择题','填空题']) {
   const expected=await bank.extensionQuestion(subject,questions.find(q=>q.kind===kind).id);
   const response=await fetch(`http://127.0.0.1:${port}/api/extension-practice/${subject}/questions/${expected.id}`,{headers,signal:AbortSignal.timeout(20000)});
   assert.equal(response.status,200);assert.ok(response.headers.get('cache-control')?.includes('no-store'));assert.deepEqual(await response.json(),expected);publicReads++;
  }
 }
 if(port) {
  const first=data.questions[0].id;
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/extension-practice/${subject}/questions/${first}`,{signal:AbortSignal.timeout(10000)})).status,401);
  const route=subject==='math'?'math/extension-bank':'english/extension-practice';
  const response=await fetch(`http://127.0.0.1:${port}/subjects/8bd6f79b-99f5-4e68-a961-872d60d260b1/${route}`,{headers,signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200);await response.arrayBuffer();
 }
}
console.log(JSON.stringify({passed:true,questions:total,acceptedVariants:acceptedChecked,collections:16,compiledPublicReads:publicReads,answersEncrypted:true,learnerWrites:0}));
