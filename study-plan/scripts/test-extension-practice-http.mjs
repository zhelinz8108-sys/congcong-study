import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {loadHolidayTestModule} from './holiday-math-test-utils.mjs';
// A dedicated development process, synthetic keys and in-memory records only.
// Existing encrypted releases are restored, even when an assertion fails.
const port=3128,base=`http://localhost:${port}`,subjectId='00000000-0000-4000-8000-000000000128';
const secret=randomBytes(32).toString('hex'),family='extension-local-synthetic-only';
const crypto=await loadHolidayTestModule('src/server/english-six-knowledge-envelope.ts');
const originalTsconfig=await readFile('tsconfig.json');
const backup=await mkdtemp(path.join(tmpdir(),'extension-http-backup-')),originals=new Map();
let server,log='',browser,qaPage;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const payload=`v1.${Date.now()+3600000}`,token=payload+'.'+createHmac('sha256',family).update(payload).digest('base64url');
const cookie=`congcong_family_access=${token}`;
try {
 for(const subject of ['math','english']) {
  const root=path.join('content',subject+'-extension');await mkdir(root,{recursive:true});
  for(const name of ['questions.public.json','answers.encrypted.json']) {
   const file=path.join(root,name);let previous;
   try {previous=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
   originals.set(file,previous);if(previous)await writeFile(path.join(backup,subject+'-'+name),previous);
  }
  const count=subject==='math'?100:150,questions=[],collections=[],answers=[];
  for(let chapter=0;chapter<8;chapter++) {
   const refs=[];
   for(let n=1;n<=count;n++) {
    const id=`${subject==='math'?'MX':'EX'}-${chapter}-${String(n).padStart(3,'0')}`,choice=n<=count/2;
    const q={id,collectionId:`${subject==='math'?'chapter-'+chapter:'unit-'+(chapter+1)}`,number:n,chapter,originalNumber:String(n),sourceName:'Synthetic QA',sourcePage:0,topic:'Synthetic QA',difficulty:3,kind:choice?'选择题':'填空题',prompt:choice?'Choose the matching synthetic QA answer.':'Fill in the synthetic QA answer.',questionImages:[],inputs:[{id:'answer',label:choice?'请选择正确答案':'第1空',kind:choice?'choice':'text',...(choice?{choices:['A. half','B. whole','C. double','D. quarter']}:{})}],resultInputIds:['answer']};
    questions.push(q);refs.push({id,number:n,difficulty:3,topic:q.topic,kind:q.kind});
    answers.push({id,accepted:[choice?'A. half':subject==='math'?'1/2':'went'],numeric:!choice&&subject==='math',explanation:'Synthetic private explanation, released only after submission.',answerText:'Synthetic private result'});
   }
   collections.push({id:subject==='math'?'chapter-'+chapter:'unit-'+(chapter+1),title:`Synthetic ${subject} ${chapter+1}`,subtitle:'Synthetic QA',mode:'chapter',chapter,palette:chapter,questionCount:count,difficultyCounts:{3:count},questions:refs});
  }
  const raw=JSON.stringify({version:1,subject,manifest:{version:'qa',total:questions.length,sourceFiles:0,collections},questions});
  await writeFile(path.join(root,'questions.public.json'),raw);
  await writeFile(path.join(root,'answers.encrypted.json'),JSON.stringify(crypto.encryptEnglishSixKnowledge({version:1,subject,publicDigest:createHash('sha256').update(raw).digest('hex'),answers},crypto.englishSixKnowledgePublicKey(secret))));
 }
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port)],{env:{...process.env,HOLIDAY_MATH_700_KEY:secret,FAMILY_ACCESS_PASSWORD:family,FAMILY_ACCESS_SECRET:family,GRADE6_BANK_TEST_MEMORY:'1',STUDY_PLAN_BUILD_DIR:'.tmp-extension-qa-build'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{log=(log+chunk.toString()).slice(-24000);});
 for(let n=0;n<90;n++) {try {const r=await fetch(base+'/api/extension-practice/math/progress?subject_id='+subjectId,{headers:{cookie}});if(r.ok){assert.equal(r.headers.get('x-grade6-qa-memory'),'isolated');break;}}catch{} if(n===89)throw new Error('Isolated preview did not start: '+log);await pause(500);}
 async function call(subject,action,{method='GET',body,auth=cookie,origin=base}={}) {
  const headers={'x-grade6-qa':'isolated-memory-v1',...(auth?{cookie:auth}:{}),origin,...(body?{'content-type':'application/json'}:{})};
  const response=await fetch(`${base}/api/extension-practice/${subject}/${action}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();return {response,data};
 }
 for(const subject of ['math','english']) {
  const id=`${subject==='math'?'MX':'EX'}-0-001`;
  assert.equal((await call(subject,'questions/'+id,{auth:''})).response.status,401);
  const q=await call(subject,'questions/'+id);assert.equal(q.response.status,200);assert.equal(q.response.headers.get('cache-control'),'private, no-store');assert.ok(!JSON.stringify(q.data).includes('Synthetic private'));
  assert.equal((await call(subject,`feedback?subject_id=${subjectId}&question_id=${id}`)).response.status,403);
  const body={subject_id:subjectId,question_id:id,answers:{answer:'A. half'},base_revision:0};
  assert.equal((await call(subject,'submit',{method:'POST',body:{...body,answers:{} }})).response.status,400);
  assert.equal((await call(subject,'submit',{method:'POST',body:{...body,answers:{answer:'Z'}}})).response.status,400);
  assert.equal((await call(subject,'submit',{method:'POST',body,origin:'https://cross-site.invalid'})).response.status,403);
  const draft=await call(subject,'draft',{method:'PUT',body});assert.equal(draft.response.status,200);
  assert.equal((await call(subject,'submit',{method:'POST',body})).response.status,409,'stale revision');
  const submitted=await call(subject,'submit',{method:'POST',body:{...body,base_revision:draft.data.revision}});assert.equal(submitted.response.status,200);assert.equal(submitted.data.feedback.outcome,'correct');assert.ok(submitted.data.feedback.detailedSolution.steps[0].content.includes('Synthetic private'));
  assert.equal((await call(subject,'draft',{method:'PUT',body:{...body,base_revision:submitted.data.response.revision}})).response.status,409,'locked first attempt');
  assert.equal((await call(subject,'feedback?subject_id='+subjectId+'&question_id='+id)).response.status,200);
  const wrongId=id.replace(/001$/, '002');
  const wrong=await call(subject,'submit',{method:'POST',body:{...body,question_id:wrongId,answers:{answer:'B. whole'},base_revision:0}});
  assert.equal(wrong.response.status,200);assert.equal(wrong.data.feedback.outcome,'incorrect');assert.ok(wrong.data.feedback.answerText);
  const other=subject==='math'?'EX-0-001':'MX-0-001';assert.equal((await call(subject,'questions/'+other)).response.status,404);
  const progress=await call(subject,'progress?subject_id='+subjectId);assert.ok(Object.keys(progress.data.responses).every(id=>id.startsWith(subject==='math'?'MX-':'EX-')));
 }
 if(process.argv.includes('--browser')) {
  const {chromium}=await import('/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();await context.addCookies([{name:'congcong_family_access',value:token,url:base}]);
  const page=await context.newPage(),errors=[];qaPage=page;page.on('pageerror',e=>errors.push(e.message));
  for(const subject of ['math','english']) {
   const route=subject==='math'?'math/extension-bank':'english/extension-practice',collection=subject==='math'?'chapter-1':'unit-2';
   await page.goto(`${base}/subjects/${subjectId}/${route}/${collection}`);await page.getByRole('button',{name:'A. half',exact:true}).waitFor();
   await page.getByRole('button',{name:'A. half',exact:true}).click();await page.getByRole('button',{name:'提交答案',exact:true}).click();await page.getByRole('heading',{name:'回答正确',exact:true}).waitFor();
   await page.reload();await page.getByRole('heading',{name:'回答正确',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'已提交 · 已锁定',exact:true}).isDisabled());
   await page.getByLabel('题目类型',{exact:true}).selectOption('填空题');await page.getByRole('textbox',{name:'第1空',exact:true}).fill(subject==='math'?'0.5':'WENT');await page.getByRole('button',{name:'提交答案',exact:true}).click();await page.getByRole('heading',{name:'回答正确',exact:true}).waitFor();
   for(const width of [390,1280]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  }
  assert.deepEqual(errors,[]);await browser.close();browser=undefined;
 }
 console.log(JSON.stringify({passed:true,isolatedHttp:true,privacyBeforeSubmission:true,staleRevisionRejected:true,firstAttemptLocked:true,subjectProgressSeparated:true,browser:process.argv.includes('--browser'),productionWrites:0}));
} catch(error) {
 if(qaPage) console.error('QA visible page:',(await qaPage.locator('body').innerText()).slice(0,5000));
 console.error('QA server tail:',log.slice(-5000));
 throw error;
} finally {
 if(browser)await browser.close();
 if(server){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),pause(3000)]);}
 for(const [file,previous] of originals) {if(previous)await writeFile(file,previous);else await rm(file,{force:true});}
 await writeFile('tsconfig.json',originalTsconfig);
 await rm(backup,{recursive:true,force:true});
}
