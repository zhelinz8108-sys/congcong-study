import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {loadHolidayTestModule} from './holiday-math-test-utils.mjs';
const app=process.cwd(),secret=randomBytes(32).toString('hex');
const crypto=await loadHolidayTestModule('src/server/english-six-knowledge-envelope.ts');
const temp=await mkdtemp(path.join(tmpdir(),'extension-practice-test-'));
for(const subject of ['math','english']) {
 const count=subject==='math'?100:150,questions=[],collections=[],privateRows=[];
 for(let chapter=0;chapter<8;chapter++) {
  const refs=[];
  for(let n=1;n<=count;n++) {
   const id=`${subject==='math'?'MX':'EX'}-${chapter}-${String(n).padStart(3,'0')}`;
   const q={id,collectionId:`chapter-${chapter}`,number:n,chapter,originalNumber:String(n),sourceName:'Synthetic',sourcePage:0,topic:'Synthetic',difficulty:3,kind:'填空题',prompt:'Synthetic public prompt',questionImages:[],inputs:[{id:'answer',label:'第1空',kind:'text'}],resultInputIds:['answer']};
   questions.push(q);refs.push({id,number:n,difficulty:3,topic:q.topic,kind:q.kind});
   privateRows.push({id,accepted:subject==='math'?(n===2?['北偏西30度']:n===3?['3:4']:['1/2']):(n===2?['Yes, she did']:['went']),numeric:subject==='math'&&n!==2&&n!==3,...(subject==='math'&&n!==2&&n!==3?{unit:'米'}:{}),explanation:'Synthetic private explanation: exercise exact equivalence and English normalization.',answerText:'Synthetic private answer'});
  }
  collections.push({id:`chapter-${chapter}`,title:'Synthetic',subtitle:'Synthetic',mode:'chapter',chapter,palette:chapter,questionCount:count,difficultyCounts:{3:count},questions:refs});
 }
 const raw=JSON.stringify({version:1,subject,manifest:{version:'test',total:questions.length,collections,sourceFiles:0},questions});
 const root=path.join(temp,'content',subject+'-extension');await mkdir(root,{recursive:true});
 await writeFile(path.join(root,'questions.public.json'),raw);
 await writeFile(path.join(root,'answers.encrypted.json'),JSON.stringify(crypto.encryptEnglishSixKnowledge({version:1,subject,publicDigest:createHash('sha256').update(raw).digest('hex'),answers:privateRows},crypto.englishSixKnowledgePublicKey(secret))));
 assert.ok(!raw.includes('Synthetic private'));
}
process.env.HOLIDAY_MATH_700_KEY=secret;
process.chdir(temp);
try {
 const bank=await loadHolidayTestModule(path.join(app,'src/server/extension-practice/bank.ts'));
 for(const subject of ['math','english']) {
  const manifest=await bank.extensionManifest(subject);
  assert.equal(manifest.collections.length,8);assert.equal(manifest.total,subject==='math'?800:1200);
  const id=`${subject==='math'?'MX':'EX'}-0-001`;
  const question=await bank.extensionQuestion(subject,id);
  assert.ok(!JSON.stringify(question).includes('accepted'));assert.ok(!JSON.stringify(question).includes('Synthetic private'));
  assert.equal(await bank.extensionQuestion(subject,'../../secret'),undefined);
  assert.equal(await bank.extensionQuestion(subject,subject==='math'?'EX-0-001':'MX-0-001'),undefined);
  const correct=subject==='math'?['0.5','2/4','50%','0.5米','０.５']:['WENT',' went ','went.'];
  for(const value of correct) assert.equal((await bank.extensionFeedback(subject,id,{answer:value})).outcome,'correct',`${subject}: ${value}`);
  for(const value of subject==='math'?['0.50000000001','0.6','0.5千米']:['go','gone','went yesterday']) assert.equal((await bank.extensionFeedback(subject,id,{answer:value})).outcome,'incorrect');
  if(subject==='math') {
   assert.equal((await bank.extensionFeedback(subject,'MX-0-002',{answer:'北偏西30°'})).outcome,'correct');
   assert.equal((await bank.extensionFeedback(subject,'MX-0-003',{answer:'3∶4'})).outcome,'correct');
  } else assert.equal((await bank.extensionFeedback(subject,'EX-0-002',{answer:'yes,she did.'})).outcome,'correct');
 }
 console.log(JSON.stringify({passed:true,syntheticMathQuestions:800,syntheticEnglishQuestions:1200,exactMathEquivalence:true,englishNormalization:true,publicProjectionAnswerFree:true,learnerWrites:0}));
} finally {process.chdir(app);delete process.env.HOLIDAY_MATH_700_KEY;await rm(temp,{recursive:true,force:true});}
