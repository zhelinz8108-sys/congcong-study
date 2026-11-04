import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadHolidayTestModule} from './holiday-math-test-utils.mjs';
const {encryptEnglishSixKnowledge}=await loadHolidayTestModule('src/server/english-six-knowledge-envelope.ts');
const subject=process.argv[2],recipientFile=process.argv[3];
assert.ok(['math','english'].includes(subject)&&recipientFile,'Usage: node scripts/package-extension-practice.mjs math|english recipient-public.pem');
const recipient=await readFile(recipientFile,'utf8');
const mathTitles=['学习准备 · 分数除法','01 · 小数乘法和除法（二）','02 · 混合运算与数量关系（三）','03 · 数与运算的再认识','04 · 比和比例','05 · 圆','06 · 放大与缩小','07 · 确定位置'];
const englishTitles=JSON.parse(await readFile('content/english-six-knowledge/manifest.public.json','utf8')).units.map(u=>`Unit ${u.number} · ${u.title}`);
const titles=subject==='math'?mathTitles:englishTitles,perChapter=subject==='math'?100:150;
const root=path.join('content',subject+'-extension');
const outputRoot=process.argv[4]??root;
const questions=[],answers=[],collections=[],audits=[];
const prompts=new Set();
for(let chapter=0;chapter<8;chapter++) {
 const rows=JSON.parse(await readFile(path.join(root,'research',`${subject==='math'?'chapter':'unit'}-${subject==='math'?chapter:chapter+1}.json`),'utf8'));
 assert.equal(rows.length,perChapter,`Chapter ${chapter} question count`);
 assert.equal(rows.filter(r=>r.kind==='choice').length,perChapter/2);
 assert.equal(rows.filter(r=>r.kind==='fill').length,perChapter/2);
 assert.equal(new Set(rows.map(r=>r.pattern)).size,perChapter,`Chapter ${chapter} repeated pattern`);
 let knowledgePointCount;
 if(subject==='english') {
  const coverage=JSON.parse(await readFile(path.join(root,'research',`unit-${chapter+1}.coverage.json`),'utf8'));
  const mapping=coverage.coverage??coverage.points;
  const points=coverage.sourcePoints??coverage.requiredPoints??Object.keys(mapping);
  const required=Array.isArray(points)?points:Object.keys(points);
  assert.ok(!coverage.missing?.length,`Unit ${chapter+1} uncovered source points`);
  for(const point of required) {
   const numbers=Array.isArray(points)?mapping[point]:points[point];
   assert.ok(Array.isArray(numbers)&&numbers.length&&numbers.every(number=>Number.isInteger(number)&&number>=1&&number<=perChapter),`Unit ${chapter+1} missing ${point}`);
  }
  for(const [point,numbers] of Object.entries(mapping)) {
   assert.ok(Array.isArray(numbers)&&numbers.length,`Unit ${chapter+1} empty point mapping`);
   for(const number of numbers) assert.ok(Number.isInteger(number)&&number>=1&&number<=perChapter&&rows[number-1].coverage?.includes(point),`Unit ${chapter+1} stale point mapping: ${point} #${number}`);
  }
  knowledgePointCount=required.length;
 }
 const collectionId=subject==='math'?`chapter-${chapter}`:`unit-${chapter+1}`,refs=[];
 for(const [index,row] of rows.entries()) {
  assert.equal(row.number,index+1);assert.ok(row.prompt?.trim());assert.ok(row.explanation?.trim().length>=25);assert.ok(row.answer?.trim());
  assert.ok(!prompts.has(row.prompt.replace(/\s+/g,'')),`Duplicate prompt ${chapter}/${row.number}`);prompts.add(row.prompt.replace(/\s+/g,''));
  const id=`${subject==='math'?'MX':'EX'}-${chapter}-${String(row.number).padStart(3,'0')}`;
  const choice=row.kind==='choice';
  if(choice) {assert.equal(row.options?.length,4);assert.equal(new Set(row.options).size,4);assert.match(row.answer,/^[A-D]$/);}
  else assert.equal(row.kind,'fill');
  const choices=choice?row.options.map((text,i)=>`${'ABCD'[i]}. ${text}`):undefined;
  const correct=choice?choices['ABCD'.indexOf(row.answer)]:row.answer;
  const question={id,collectionId,number:row.number,chapter,originalNumber:String(row.number),sourceName:'课内考试拓展原创练习',sourcePage:0,topic:subject==='english'?(choice?'语境综合选择':'语境综合填空'):row.topic,difficulty:row.number<=perChapter/2?3:4,kind:choice?'选择题':'填空题',prompt:row.prompt,questionImages:[],inputs:[{id:'answer',label:choice?'请选择正确答案':`第 1 空${row.unit?`（${row.unit}）`:''}`,kind:choice?'choice':'text',...(choices?{choices}:{})}],resultInputIds:['answer']};
  questions.push(question);refs.push({id,number:row.number,difficulty:question.difficulty,topic:row.topic,kind:question.kind});
  answers.push({id,accepted:choice?[correct]:[...new Set([row.answer,...(row.accepted??[])])],numeric:!choice&&row.numeric===true,...(!choice&&row.unit?{unit:row.unit}:{}),topic:row.topic,authoring:{pattern:row.pattern,...(row.coverage?{coverage:row.coverage}:{}),...(row.check?{check:row.check}:{})},explanation:row.explanation,answerText:choice?`正确选项：${row.answer}。${row.options['ABCD'.indexOf(row.answer)]}`:`正确答案：${row.answer}${row.unit??''}`});
 }
 audits.push({collectionId,questions:rows.length,choice:perChapter/2,fill:perChapter/2,distinctPatternLabels:new Set(rows.map(row=>row.pattern)).size,...(knowledgePointCount?{sourceKnowledgePoints:knowledgePointCount}:{})});
 const topics=[...new Set(rows.map(r=>r.topic))];
 collections.push({id:collectionId,title:titles[chapter],subtitle:`${perChapter/2} 道选择 · ${perChapter/2} 道填空 · ${topics.slice(0,6).join(' / ')+(topics.length>6?' 等'+topics.length+'项':'')}`,mode:'chapter',chapter,palette:chapter,questionCount:perChapter,difficultyCounts:{3:perChapter/2,4:perChapter/2},questions:refs});
}
const manifest={version:`${subject}-extension-v1`,total:questions.length,sourceFiles:0,collections};
const raw=JSON.stringify({version:1,subject,manifest,questions},null,2)+'\n';
const privateData={version:1,subject,publicDigest:createHash('sha256').update(raw).digest('hex'),answers};
await mkdir(outputRoot,{recursive:true});
await writeFile(path.join(outputRoot,'questions.public.json'),raw);
await writeFile(path.join(outputRoot,'answers.encrypted.json'),JSON.stringify(encryptEnglishSixKnowledge(privateData,recipient))+'\n');
await writeFile(path.join(outputRoot,'audit.public.json'),JSON.stringify({version:1,subject,total:questions.length,publicDigest:privateData.publicDigest,collections:audits},null,2)+'\n');
console.log(JSON.stringify({subject,total:questions.length,collections:collections.length,privateAnswersEncrypted:true}));
