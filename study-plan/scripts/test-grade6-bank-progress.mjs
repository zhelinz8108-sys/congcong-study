import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";

// Pure-memory regression tests: the real hook/component source is transpiled
// into isolated VM contexts. fetch, localStorage, browser events and React are
// replaced locally. No network, database, credentials or production writes.
const hookPath = new URL("../src/lib/grade6-bank-progress.ts", import.meta.url);
const componentPath = new URL("../src/components/grade6-bank.tsx", import.meta.url);
const validationSource=fs.readFileSync(new URL("../src/lib/grade6-bank-native-validation.ts",import.meta.url),"utf8");
const validationCode=ts.transpileModule(validationSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const validationContext={module:{exports:{}},exports:{}};validationContext.exports=validationContext.module.exports;
vm.runInNewContext(validationCode,validationContext);
const schemaSource=fs.readFileSync(new URL("../src/lib/grade6-bank-input-schema.ts",import.meta.url),"utf8");
const schemaCode=ts.transpileModule(schemaSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const schemaContext={module:{exports:{}},exports:{},require:name=>{if(name.endsWith("grade6-bank-native-validation"))return validationContext.module.exports;throw new Error(name);}};schemaContext.exports=schemaContext.module.exports;
vm.runInNewContext(schemaCode,schemaContext);

async function testProgressHook() {
  const text=fs.readFileSync(hookPath,"utf8");
  const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const storage=new Map(); const response=(answers={},revision=0,submitted=false)=>({answers,revision,submitted,outcome:submitted?"correct":null,score:submitted?1:null,maxScore:submitted?1:0,submissions:submitted?1:0,updatedAt:revision?"2026-10-11T01:00:00.000Z":""});
  let canonicalize=false;let remote={},failDraft=false,holdDraft=null,holdResolve=null,forcePostConflict=false; const calls=[],questionSchemas=new Map();
  const retiredQuestions=new Set(),retiredDrafts=new Set(),retiredSubmits=new Set();
  const fetchMock=async(url,options={})=>{
   const body=options.body?JSON.parse(options.body):null; calls.push({url,method:options.method??"GET",body});
   if(!options.method&&url.startsWith("/api/math/grade6-bank/questions/")){const id=decodeURIComponent(url.split("/").at(-1));if(retiredQuestions.has(id))return {ok:false,status:410,json:async()=>({error:"重复题已移出题库"})};return {ok:true,status:200,json:async()=>structuredClone(questionSchemas.get(id)??{id,inputs:[{id:"a",label:"答案",kind:"text"},{id:"b",label:"第二空",kind:"text"}]})};}
   if(!options.method)return {ok:true,status:200,json:async()=>structuredClone({responses:remote,lastQuestionId:"q",updatedAt:""})};
   if(options.method==="PUT"&&retiredDrafts.has(body.question_id)||options.method==="POST"&&retiredSubmits.has(body.question_id))return {ok:false,status:410,json:async()=>({error:"重复题已移出题库"})};
   const schema=questionSchemas.get(body.question_id);
   if(schema?.native)assert.equal(body.input_schema,schemaContext.module.exports.bankNativeInputSchema(schema),"every native PUT/POST carries the exact public schema token");
   if(options.method==="PUT"&&failDraft)throw new Error("offline");
   if(options.method==="PUT"&&holdDraft){const gate=holdDraft;holdDraft=null;await gate;}
   if(options.method==="POST"&&forcePostConflict){forcePostConflict=false;remote.q=response({a:"new-cloud"},remote.q.revision+1,true);}
   const old=remote[body.question_id]??response();
   if(old.submitted||old.submissions>0||body.base_revision!==old.revision)return {ok:false,status:409,json:async()=>({error:"conflict",response:structuredClone(old)})};
   const canonicalFields=questionSchemas.get(body.question_id)?.inputs.map(field=>field.id)??["b"];
   const canonical=canonicalize?Object.fromEntries([...new Set([...Object.keys(body.answers),...canonicalFields])].map(id=>[id,(body.answers[id]??"").trim()])):body.answers;const saved=response(canonical,old.revision+1,options.method==="POST");remote[body.question_id]=saved;
   return {ok:true,status:200,json:async()=>options.method==="POST"?{response:structuredClone(saved),feedback:{questionId:body.question_id,outcome:"correct",score:1,maxScore:1,fields:[],message:"ok",answerText:"private",answerImages:[]}}:structuredClone(saved)};
  };
  const settle=async()=>{for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));};
  function mount(){
   const states=[],refs=[],effects=[],events=new Map();let si=0,ri=0;
   const react={useState:(init)=>{const i=si++;states[i]=typeof init==="function"?init():init;return [states[i],v=>{states[i]=typeof v==="function"?v(states[i]):v;}];},useRef:v=>{const i=ri++;refs[i]={current:v};return refs[i];},useCallback:f=>f,useEffect:f=>effects.push(f)};
   const surface={addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n)=>events.delete(n)};
   const context={module:{exports:{}},exports:{},require:n=>{if(n==="react")return react;if(n.endsWith("grade6-bank-native-validation"))return validationContext.module.exports;if(n.endsWith("grade6-bank-input-schema"))return schemaContext.module.exports;throw new Error(n);},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},fetch:fetchMock,AbortSignal,setTimeout,clearTimeout,document:{...surface,visibilityState:"visible"},window:surface,console};
   context.exports=context.module.exports;vm.runInNewContext(compiled,context);
   const hook=context.module.exports.useGrade6BankProgress("subject");
   const cleanup=effects.map(f=>f());return {hook,states,events,cleanup:()=>cleanup.forEach(f=>f?.())};
  }
  const key="study-plan-grade6-bank-v1:subject";
  storage.set(key,JSON.stringify({responses:{forged:response({a:"fake"},99,true)},lastQuestionId:"forged",updatedAt:"",dirtyQuestionIds:[]}));
  let h=mount();await settle();assert.deepEqual(Object.keys(h.states[0].responses),[],"local grades cannot promote to remote");
  h.hook.draft("q",{a:"A"});failDraft=true;await h.hook.flush();assert.equal(h.states[2],"offline");
  assert.equal(JSON.parse(storage.get(key)).responses.q.baseRevision,0);assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,["q"]);
  failDraft=false;h.events.get("online")();await settle();assert.equal(remote.q.answers.a,"A");assert.equal(h.states[2],"saved");
  let started=false;holdDraft=new Promise(resolve=>{holdResolve=resolve;});
  h.hook.draft("q",{a:"B"});const pending=h.hook.flush();await settle();started=true;assert(started);h.hook.draft("q",{a:"C"});holdResolve();await pending;
  assert.equal(h.states[0].responses.q.answers.a,"C","in-flight response must not replace later input");assert.equal(h.states[0].responses.q.baseRevision,2);
  await h.hook.flush();assert.equal(remote.q.answers.a,"C");assert.equal(h.states[0].responses.q.revision,3);
  h.hook.draft("q",{a:"D"});failDraft=true;await h.hook.flush();failDraft=false;remote.q=response({a:"E-cloud"},4,true);
  const before=calls.filter(c=>c.method==="PUT").length;h.events.get("online")();await settle();assert.equal(h.states[2],"saved");assert.equal(remote.q.answers.a,"E-cloud");assert.equal(h.states[0].responses.q.answers.a,"E-cloud");assert.equal(calls.filter(c=>c.method==="PUT").length,before,"submitted cloud records discard conflicting local drafts without writes");
  await assert.rejects(h.hook.submit("q",{a:"D"}),/已提交.*锁定/);assert.equal(remote.q.revision,4);h.hook.draft("q",{a:"F"});await h.hook.flush();assert.equal(remote.q.answers.a,"E-cloud");h.cleanup();
  storage.clear();remote={q:response({a:"F"},0)};h=mount();await settle();forcePostConflict=true;
  await assert.rejects(h.hook.submit("q",{a:"F"}),/已提交.*锁定/);assert.equal(remote.q.answers.a,"new-cloud");assert.equal(h.states[0].responses.q.answers.a,"new-cloud");assert.equal(h.states[2],"saved");
  await assert.rejects(h.hook.submit("q",{a:"F"}),/已提交.*锁定/);assert.equal(remote.q.answers.a,"new-cloud");h.cleanup();
  storage.set(key,JSON.stringify({responses:{q:{...response({a:"future-clock-stale"},2),baseRevision:2,updatedAt:"9999-01-01T00:00:00Z"}},lastQuestionId:"q",updatedAt:"",dirtyQuestionIds:["q"]}));
  h=mount();await settle();assert.equal(h.states[2],"saved");assert.equal(h.states[0].responses.q.answers.a,"new-cloud");assert.equal(h.states[0].responses.q.submitted,true);assert.equal(remote.q.answers.a,"new-cloud");h.cleanup();
  storage.set(key,JSON.stringify({responses:remote,lastQuestionId:"q",updatedAt:"",dirtyQuestionIds:[]}));
  h=mount();await settle();const displayed=remote.q.answers.a;remote.q=response({a:"other-device-latest"},remote.q.revision+1,true);
  h.events.get("online")();await settle();const oldUiWrites=calls.filter(c=>c.method!=="GET").length;
  await assert.rejects(h.hook.submit("q",{a:displayed}),/已提交.*锁定/);assert.equal(remote.q.answers.a,"other-device-latest");assert.equal(calls.filter(c=>c.method!=="GET").length,oldUiWrites);
  await assert.rejects(h.hook.submit("q",{a:displayed}),/已提交.*锁定/);assert.equal(remote.q.answers.a,"other-device-latest");h.cleanup();
  storage.clear();remote={};canonicalize=true;h=mount();await settle();h.hook.draft("q",{a:"3/4 "});await h.hook.flush();assert.equal(h.states[2],"saved");assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,[]);assert.equal(h.states[0].responses.q.answers.a,"3/4");assert.equal(h.states[0].responses.q.answers.b,"");await h.hook.submit("q",{a:"3/4 "});assert.equal(h.states[2],"saved");assert.equal(remote.q.submitted,true);await assert.rejects(h.hook.submit("q",{a:"3/4"+String.fromCharCode(10)}),/已提交.*锁定/);assert.equal(h.states[2],"saved");h.cleanup();canonicalize=false;

  storage.clear();remote={};h=mount();await settle();
  holdDraft=new Promise(resolve=>{holdResolve=resolve;});
  h.hook.draft("q",{a:"7.65"});h.events.get("pagehide")();await settle();h.cleanup();
  holdResolve();await settle();
  assert.equal(remote.q.answers.a,"7.65");assert.equal(remote.q.revision,1);
  assert.equal(JSON.parse(storage.get(key)).responses.q.baseRevision,0);
  assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,["q"],"unmounted scope cannot accept save");
  const reloadWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();
  assert.equal(h.states[2],"saved");assert.equal(h.states[0].responses.q.revision,1);
  assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,[]);
  assert.equal(calls.filter(c=>c.method!=="GET").length,reloadWrites,"confirmed identical save must not PUT again");h.cleanup();
  remote={q:response({a:"already-graded",b:""},5,true)};
  storage.set(key,JSON.stringify({responses:{q:{...response({a:"already-graded "},2),baseRevision:2}},lastQuestionId:"q",updatedAt:"",dirtyQuestionIds:["q"],conflicts:{q:{revision:4,acknowledged:false}}}));
  const equalAnswerWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();
  assert.equal(h.states[2],"saved");assert.equal(h.states[0].responses.q.revision,5);
  assert.equal(h.states[0].responses.q.submitted,true);assert.equal(h.states[0].responses.q.outcome,"correct");
  assert.equal(h.states[0].responses.q.score,1);assert.equal(h.states[0].responses.q.baseRevision,undefined);
  assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,[]);assert.deepEqual(JSON.parse(storage.get(key)).conflicts,{});
  assert.equal(calls.filter(c=>c.method!=="GET").length,equalAnswerWrites,"matching submitted record must not be downgraded by PUT");h.cleanup();

  // A new closed assessment has its own draft; previous work is display-only
  // metadata and must survive a PUT response that contains only the new draft.
  const closedQuestion={id:"q",resultAssessment:"closed-v1",resultInputIds:["result-choice"],inputs:[{id:"result-choice",label:"选择",kind:"choice",choices:["A","B","C","D"]}],native:{version:1,blocks:[{type:"response",fieldId:"result-choice"}]}};
  const previousSubmission={answers:{"old-result":"原作答：1/2，含完整过程"},submitted:true,outcome:"review",score:null,maxScore:0,updatedAt:"2026-10-01T00:00:00.000Z"};
  const previousJson=JSON.stringify(previousSubmission);
  questionSchemas.set("q",closedQuestion);storage.clear();remote={q:{...response({},0),previousSubmission}};
  h=mount();await settle();h.hook.observeQuestion(closedQuestion);
  assert.equal(JSON.stringify(h.hook.getResponse("q").previousSubmission),previousJson);
  h.hook.draft("q",{"result-choice":"B"});
  assert.equal(JSON.stringify(h.hook.getResponse("q").previousSubmission),previousJson,"explicit choice editing must preserve read-only original work");
  await h.hook.flush();
  assert.equal(h.hook.getResponse("q").revision,1);
  assert.equal(JSON.stringify(h.hook.getResponse("q").previousSubmission),previousJson,"successful PUT must preserve history absent from its draft-only response");
  assert.equal(JSON.stringify(JSON.parse(storage.get(key)).responses.q.previousSubmission),previousJson,"saved cache retains old work");
  assert.deepEqual(JSON.parse(JSON.stringify(remote.q.answers)),{"result-choice":"B"},"old work is never copied into current submitted fields");
  const closedWrites=calls.filter(c=>c.method!=="GET"&&c.body?.question_id==="q");
  assert.deepEqual(closedWrites.at(-1).body.answers,{"result-choice":"B"});
  assert.equal(closedWrites.at(-1).body.base_revision,0);
  h.cleanup();
  // The real progress projection decorates the saved new draft with the old
  // immutable submission again on GET; this read must not create a write.
  remote.q={...remote.q,previousSubmission};
  const closedReloadWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();
  assert.equal(JSON.stringify(h.hook.getResponse("q").previousSubmission),previousJson);
  assert.equal(h.hook.getResponse("q").answers["result-choice"],"B");
  assert.equal(calls.filter(c=>c.method!=="GET").length,closedReloadWrites,"reading original work after remount does not autosave it");
  assert.equal(JSON.stringify(previousSubmission),previousJson);h.cleanup();questionSchemas.delete("q");

  const nativeQuestion={id:"q",inputs:[{id:"blank-1",label:"第1空",kind:"text"},{id:"blank-2",label:"第2空",kind:"text"}],native:{version:1,blocks:[{type:"paragraph",content:[{type:"blank",fieldId:"blank-1"},{type:"blank",fieldId:"blank-2"}]}]}};
  questionSchemas.set("q",nativeQuestion);
  storage.clear();remote={q:response({"old-aggregate":"3/4，1/2"},5,true)};
  const cleanLegacyWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();h.hook.observeQuestion(nativeQuestion);
  assert.equal(calls.filter(c=>c.method!=="GET").length,cleanLegacyWrites,"clean late GET legacy answers must remain read-only");
  assert.equal(h.hook.getResponse("q").answers["old-aggregate"],"3/4，1/2");h.cleanup();

  remote={q:response({},5)};
  storage.set(key,JSON.stringify({responses:{q:response({"old-aggregate":"older-v1-draft"},5)},lastQuestionId:"q"}));
  const oldVersionWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();
  assert.equal(calls.filter(c=>c.method!=="GET").length,oldVersionWrites,"old v1 cache without dirtyQuestionIds must pause before PUT");assert.equal(h.states[2],"legacy");h.cleanup();

  // Old local dirty caches can load before their question component. The hook
  // must inspect public fields BEFORE any PUT, pause only that legacy record,
  // and retain it across reload. No comma-based guessing or empty rewrite.
  remote={q:response({},5),other:response({},0)};
  storage.set(key,JSON.stringify({responses:{q:{...response({"old-aggregate":"3/4，1/2"},5),baseRevision:5},other:response({a:"keep-other"},0)},lastQuestionId:"q",updatedAt:"",dirtyQuestionIds:["q","other"]}));
  const dirtyLegacyCalls=calls.length;h=mount();await settle();
  assert.equal(calls.slice(dirtyLegacyCalls).filter(c=>c.method!=="GET"&&c.body.question_id==="q").length,0,"legacy cache must not send a write on read");
  assert.equal(remote.other.answers.a,"keep-other","other native/legacy-compatible questions still save normally");
  assert.equal(h.states[2],"legacy");assert.equal(h.hook.getResponse("q").answers["old-aggregate"],"3/4，1/2");
  assert.deepEqual(JSON.parse(storage.get(key)).pausedLegacyQuestionIds,["q"]);
  assert.equal(h.hook.getLegacyAnswers("q")["old-aggregate"],"3/4，1/2");h.cleanup();
  const pausedReloadWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();h.hook.observeQuestion(nativeQuestion);await h.hook.flush();
  assert.equal(calls.filter(c=>c.method!=="GET").length,pausedReloadWrites,"paused legacy cache must not retry after reload");
  h.hook.draft("q",{"blank-1":"3/4","blank-2":""});await h.hook.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(remote.q.answers)),{"blank-1":"3/4","blank-2":""});
  assert.equal(h.states[2],"saved");assert.deepEqual(JSON.parse(storage.get(key)).pausedLegacyQuestionIds,[]);
  assert.equal(JSON.parse(storage.get(key)).legacyHistory.q["old-aggregate"],"3/4，1/2");h.cleanup();
  h=mount();await settle();assert.equal(h.hook.getLegacyAnswers("q")["old-aggregate"],"3/4，1/2","explicit new input must not delete old history");h.cleanup();

  storage.clear();remote={q:response({},8)};storage.set(key,JSON.stringify({responses:{q:{...response({"blank-1":"2/3","blank-2":"4"},8),baseRevision:8}},dirtyQuestionIds:["q"]}));
  const nativeDirtyWrites=calls.length;h=mount();await settle();assert.equal(calls.slice(nativeDirtyWrites).filter(c=>c.method==="PUT").length,1,"already-native dirty fields should resume sync");assert.equal(remote.q.answers["blank-1"],"2/3");assert.equal(h.states[2],"saved");h.cleanup();

  // A cloud revision change while old text is paused must retain the normal
  // conflict barrier. An explicit native edit alone is not permission to
  // overwrite the other device's submitted answer.
  remote={q:response({"blank-1":"cloud","blank-2":"latest"},11,true)};storage.set(key,JSON.stringify({responses:{q:{...response({"old-aggregate":"old-local"},10),baseRevision:10}},dirtyQuestionIds:["q"],pausedLegacyQuestionIds:["q"],legacyHistory:{q:{"old-aggregate":"old-local"}}}));
  const revisionWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();h.hook.observeQuestion(nativeQuestion);h.hook.draft("q",{"blank-1":"student","blank-2":"new"});await h.hook.flush();
  assert.equal(calls.filter(c=>c.method!=="GET").length,revisionWrites);assert.equal(remote.q.answers["blank-1"],"cloud");
  await assert.rejects(h.hook.submit("q",{"blank-1":"student","blank-2":"new"}),/已提交.*锁定/);assert.equal(remote.q.revision,11);h.cleanup();

  // Reused text IDs are the dangerous case: old answer-1 contained the whole
  // response, while the native question reuses it for only the first blank.
  const reused={id:"q",inputs:[{id:"answer-1",label:"第1空",kind:"text"},{id:"blank-2",label:"第2空",kind:"text"}],native:{version:1,blocks:[{type:"paragraph",content:[{type:"blank",fieldId:"answer-1"},{type:"blank",fieldId:"blank-2"}]}]}};
  questionSchemas.set("q",reused);storage.clear();remote={q:response({"answer-1":"完整的旧聚合作答"},15,true)};
  const reusedCleanWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();h.hook.observeQuestion(reused);
  assert.deepEqual(JSON.parse(JSON.stringify(schemaContext.module.exports.bankCurrentAnswers(reused,h.hook.getResponse("q").answers))),{});
  assert.equal(schemaContext.module.exports.bankLegacyAnswerEntries(reused,h.hook.getResponse("q").answers)[0][1],"完整的旧聚合作答");
  assert.equal(calls.filter(c=>c.method!=="GET").length,reusedCleanWrites,"clean same-name aggregate GET never writes");h.cleanup();

  remote={q:response({},15)};storage.set(key,JSON.stringify({responses:{q:{...response({"answer-1":"旧答案即使没有逗号也不猜"},15),baseRevision:15}},dirtyQuestionIds:["q"]}));
  const reusedDirtyWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();assert.equal(h.states[2],"legacy");
  assert.equal(calls.filter(c=>c.method!=="GET").length,reusedDirtyWrites);assert.equal(h.hook.getLegacyAnswers("q")["answer-1"],"旧答案即使没有逗号也不猜");h.cleanup();
  h=mount();await settle();await h.hook.flush();assert.equal(calls.filter(c=>c.method!=="GET").length,reusedDirtyWrites,"same-name aggregate stays paused after reload");
  h.hook.observeQuestion(reused);h.hook.draft("q",{"answer-1":"重新填写的第一空"});failDraft=true;await h.hook.flush();
  const nativeSchema=schemaContext.module.exports.bankNativeInputSchema(reused);
  assert.equal(JSON.parse(storage.get(key)).responses.q.nativeInputSchema,nativeSchema);h.cleanup();
  failDraft=false;canonicalize=true;const partialBefore=calls.length;h=mount();await settle();
  assert.equal(calls.slice(partialBefore).filter(c=>c.method==="PUT").length,1,"explicit partial native draft can resume with exact local schema marker");
  assert.deepEqual(JSON.parse(JSON.stringify(remote.q.answers)),{"answer-1":"重新填写的第一空","blank-2":""});
  assert.equal(h.hook.getLegacyAnswers("q")["answer-1"],"旧答案即使没有逗号也不猜");h.cleanup();

  remote={q:response({},17)};storage.set(key,JSON.stringify({responses:{q:{...response({"answer-1":"","blank-2":""},17),baseRevision:17}},dirtyQuestionIds:["q"]}));
  const emptyBefore=calls.length;h=mount();await settle();assert.equal(calls.slice(emptyBefore).filter(c=>c.method==="PUT").length,0,"equivalent empty draft need not rewrite the server");assert.equal(h.states[2],"saved","complete empty native fields are not legacy");assert.deepEqual(JSON.parse(JSON.stringify(h.hook.getLegacyAnswers("q"))),{});h.cleanup();

  remote={q:response({"answer-1":"cloud","blank-2":"latest"},19,true)};
  storage.set(key,JSON.stringify({responses:{q:{...response({"answer-1":"partial-native"},18),baseRevision:18,nativeInputSchema:nativeSchema}},dirtyQuestionIds:["q"],legacyHistory:{q:{"answer-1":"完整的旧聚合作答"}}}));
  const partialConflictWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();
  assert.equal(h.states[2],"saved");assert.equal(calls.filter(c=>c.method!=="GET").length,partialConflictWrites,"a native schema marker cannot grant submitted-record overwrite rights");
  assert.equal(h.hook.getLegacyAnswers("q")["answer-1"],"完整的旧聚合作答");h.cleanup();canonicalize=false;

  const choiceQuestion={id:"q",inputs:[{id:"answer-1",label:"选择",kind:"choice",choices:["A","B","C","D"]}],native:{version:1,blocks:[{type:"paragraph",content:[{type:"blank",fieldId:"answer-1"}]}]}};
  questionSchemas.set("q",choiceQuestion);storage.clear();remote={q:response({"answer-1":"旧聚合作答：两个答案"},12,true)};
  const cleanChoiceWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();h.hook.observeQuestion(choiceQuestion);await h.hook.flush();
  assert.equal(calls.filter(c=>c.method!=="GET").length,cleanChoiceWrites,"late GET invalid choice remains read-only");assert.equal(h.hook.getResponse("q").answers["answer-1"],"旧聚合作答：两个答案");h.cleanup();
  remote={q:response({},12)};storage.set(key,JSON.stringify({responses:{q:{...response({"answer-1":"3/4，1/2"},12),baseRevision:12}},dirtyQuestionIds:["q"]}));
  const dirtyChoiceWrites=calls.filter(c=>c.method!=="GET").length;h=mount();await settle();await h.hook.flush();
  assert.equal(calls.filter(c=>c.method!=="GET").length,dirtyChoiceWrites,"same-name invalid legacy choice must pause before PUT");assert.equal(h.states[2],"legacy");assert.equal(h.hook.getLegacyAnswers("q")["answer-1"],"3/4，1/2");h.cleanup();
  h=mount();await settle();await h.hook.flush();assert.equal(calls.filter(c=>c.method!=="GET").length,dirtyChoiceWrites,"invalid choice stays paused after reload");
  h.hook.draft("q",{"answer-1":"B"});await h.hook.flush();assert.equal(remote.q.answers["answer-1"],"B");assert.equal(h.states[2],"saved");assert.equal(h.hook.getLegacyAnswers("q")["answer-1"],"3/4，1/2");h.cleanup();
  storage.clear();remote={q:response({},13)};storage.set(key,JSON.stringify({responses:{q:{...response({"answer-1":"C"},13),baseRevision:13}},dirtyQuestionIds:["q"]}));
  const validChoiceWrites=calls.length;h=mount();await settle();assert.equal(calls.slice(validChoiceWrites).filter(c=>c.method==="PUT").length,1,"valid native choice still saves normally");assert.equal(remote.q.answers["answer-1"],"C");h.cleanup();

  // Removed duplicates are not network failures. A cached unsaved answer must
  // stay readable, but may never be replayed or copied into a retained question.
  questionSchemas.clear();storage.clear();remote={other:response({},0)};retiredQuestions.add("retired");
  const retiredOriginal={...response({a:"local-retired-answer",b:"second-blank"},8),baseRevision:8};
  storage.set(key,JSON.stringify({responses:{retired:retiredOriginal,other:response({a:"active-answer"},0)},lastQuestionId:"retired",updatedAt:"",dirtyQuestionIds:["retired","other"]}));
  const retiredStart=calls.length;h=mount();await settle();
  assert.equal(calls.slice(retiredStart).filter(c=>c.method!=="GET"&&c.body.question_id==="retired").length,0,"GET 410 prevents every retired draft write");
  assert.equal(remote.other.answers.a,"active-answer","retiring one ID does not block active drafts");
  assert.equal(h.states[2],"saved","retired drafts do not cause perpetual saving/offline messages");
  const retiredPreserved={...retiredOriginal,revision:0};
  assert.deepEqual(JSON.parse(JSON.stringify(h.hook.getResponse("retired"))),retiredPreserved,"retirement retains the original local answer/base revision; refresh only reads the current cloud revision");
  assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,["retired"]);
  assert.deepEqual(JSON.parse(storage.get(key)).pausedRetiredQuestionIds,["retired"]);
  const retiredReadCount=calls.filter(c=>c.url.endsWith("/questions/retired")).length;
  const retiredWriteCount=calls.filter(c=>c.method!=="GET"&&c.body.question_id==="retired").length;
  await h.hook.flush();h.events.get("online")();await settle();h.cleanup();h=mount();await settle();await h.hook.flush();
  assert.equal(calls.filter(c=>c.url.endsWith("/questions/retired")).length,retiredReadCount,"retired schema GET is not retried on online or reload");
  assert.deepEqual(JSON.parse(JSON.stringify(h.hook.getResponse("retired"))),retiredPreserved,"retired local draft survives cloud refresh and reload");
  h.hook.draft("retired",{a:"forbidden-new-input"});await assert.rejects(h.hook.submit("retired",{a:"forbidden-new-input"}),/重复题.*移出.*不能再提交/);await h.hook.flush();
  assert.equal(calls.filter(c=>c.method!=="GET"&&c.body.question_id==="retired").length,retiredWriteCount);
  assert.equal(h.hook.getResponse("retired").answers.a,"local-retired-answer");
  remote.retired=response({a:"first-cloud-answer",b:"cloud-second"},9,true);h.events.get("online")();await settle();
  assert.equal(h.hook.getResponse("retired").score,1);assert.equal(h.hook.getResponse("retired").revision,9,"real submitted history remains authoritative");
  assert.equal(h.hook.getLegacyAnswers("retired").a,"local-retired-answer","archived unsaved answer is not erased by late submitted history");
  assert.equal(remote.retired.answers.a,"first-cloud-answer");h.cleanup();

  storage.clear();remote={legacyRetired:response({},6)};retiredQuestions.add("legacyRetired");
  storage.set(key,JSON.stringify({responses:{legacyRetired:{...response({"old-aggregate":"old-retired-aggregate"},5),baseRevision:5}},dirtyQuestionIds:["legacyRetired"],pausedLegacyQuestionIds:["legacyRetired"],conflicts:{legacyRetired:{revision:6,acknowledged:false}},legacyHistory:{legacyRetired:{"old-aggregate":"even-older-aggregate"}}}));
  const blockedRetiredStart=calls.length;h=mount();await settle();
  assert.equal(calls.slice(blockedRetiredStart).filter(c=>c.url.endsWith("/questions/legacyRetired")).length,1,"blocked legacy/conflict caches still receive one read-only retirement probe");
  assert.equal(calls.slice(blockedRetiredStart).filter(c=>c.method!=="GET").length,0);
  assert.equal(h.states[2],"saved");assert.deepEqual(JSON.parse(storage.get(key)).conflicts,{});assert.deepEqual(JSON.parse(storage.get(key)).pausedLegacyQuestionIds,[]);
  assert.deepEqual(JSON.parse(storage.get(key)).pausedRetiredQuestionIds,["legacyRetired"]);assert.equal(h.hook.getResponse("legacyRetired").answers["old-aggregate"],"old-retired-aggregate");
  assert.equal(h.hook.getLegacyAnswers("legacyRetired")["old-aggregate"],"even-older-aggregate");assert.equal(h.hook.getLegacyAnswers("legacyRetired")["retired-draft:old-aggregate"],"old-retired-aggregate","retirement does not overwrite an older reused-ID history entry");h.cleanup();

  // A component mounted before release can already hold its public schema.
  // Its first PUT may receive 410, after which no automatic or manual retry is
  // permitted. No successful server save or grade is invented locally.
  storage.clear();remote={q:response({},2)};retiredDrafts.add("q");h=mount();await settle();
  h.hook.observeQuestion({id:"q",inputs:[{id:"a",label:"答案",kind:"text"}]});h.hook.draft("q",{a:"retired-put-answer"});await h.hook.flush();
  assert.deepEqual(JSON.parse(storage.get(key)).pausedRetiredQuestionIds,["q"]);assert.equal(h.states[2],"saved");
  const retiredPutWrites=calls.filter(c=>c.method!=="GET"&&c.body.question_id==="q").length;
  h.events.get("pagehide")();h.events.get("online")();await settle();await h.hook.flush();
  assert.equal(calls.filter(c=>c.method!=="GET"&&c.body.question_id==="q").length,retiredPutWrites);
  assert.equal(h.hook.getResponse("q").answers.a,"retired-put-answer");assert.equal(remote.q.revision,2);
  h.cleanup();h=mount();await settle();await h.hook.flush();assert.equal(calls.filter(c=>c.method!=="GET"&&c.body.question_id==="q").length,retiredPutWrites);h.cleanup();retiredDrafts.clear();

  // A release between draft acknowledgement and explicit submit can produce
  // POST 410. Preserve that acknowledged draft and do not mark it submitted.
  storage.clear();remote={q:response({a:"retired-post-answer"},4)};retiredSubmits.add("q");h=mount();await settle();
  h.hook.observeQuestion({id:"q",inputs:[{id:"a",label:"答案",kind:"text"}]});
  await assert.rejects(h.hook.submit("q",{a:"retired-post-answer"}),/重复题.*移出.*不能再提交/);
  assert.equal(h.states[2],"saved");assert.equal(h.hook.getResponse("q").submitted,false);assert.equal(h.hook.getResponse("q").revision,4);assert.equal(h.hook.getResponse("q").answers.a,"retired-post-answer");
  assert.deepEqual(JSON.parse(storage.get(key)).pausedRetiredQuestionIds,["q"]);assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,["q"]);
  const retiredPostWrites=calls.filter(c=>c.method!=="GET"&&c.body.question_id==="q").length;
  await assert.rejects(h.hook.submit("q",{a:"retired-post-answer"}),/重复题.*移出.*不能再提交/);h.events.get("online")();await settle();await h.hook.flush();h.cleanup();
  h=mount();await settle();await h.hook.flush();assert.equal(calls.filter(c=>c.method!=="GET"&&c.body.question_id==="q").length,retiredPostWrites);assert.equal(h.hook.getResponse("q").answers.a,"retired-post-answer");assert.equal(remote.q.submitted,false);h.cleanup();
  retiredQuestions.clear();retiredSubmits.clear();

  console.log(JSON.stringify({passed:true,scenarios:["no local grade promotion","failed dirty/base persistence","online retry","preserve later edits with server revision","submitted GET drops stale drafts","submitted records reject every manual retry","POST conflict locks authoritative record","future client clock cannot override","server trim / empty field equivalence","pagehide save before accept then reload","equal other-device submission keeps server grade","clean late GET legacy remains read-only","old v1 legacy cache pauses before PUT","dirty legacy pauses before PUT and survives reload","other questions continue saving","explicit native input resumes sync without deleting history","native dirty fields resume normally","legacy pause cannot override submitted cloud answer","same-name aggregate clean GET stays historic","same-name dirty aggregate pauses across reload","explicit partial native schema persists and resumes","complete empty native fields remain valid","native schema does not bypass submission lock","same-name invalid choice GET remains read-only","dirty invalid choice pauses and survives reload","explicit choice resumes and preserves historic text","valid native choice still saves","retired GET pauses before writes and retains draft","retired pause survives online and reload without retries","retired IDs reject local edits and manual submit","retired history accepts authoritative submitted record without writes","blocked legacy/conflict cache probes retirement without writes","PUT 410 pauses mounted question and preserves local draft","POST 410 preserves acknowledged draft without local grade promotion"],mockWrites:calls.filter(c=>c.method!=="GET").length,studentWrites:0}));

}

async function testQuestionControls() {
  const source=fs.readFileSync(componentPath,"utf8")+"\nexport { QuestionSession as __QuestionSession };";
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const states=[];let index=0,lastDraft=null;
  const jsx=(type,props)=>({type,props});const react={useState:init=>{const i=index++;if(!(i in states))states[i]=typeof init==="function"?init():init;return[states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},useRef:v=>({current:v}),useEffect:()=>{},useMemo:f=>f()};
  const context={module:{exports:{}},exports:{},require:name=>{if(name==="react")return react;if(name==="react/jsx-runtime")return{jsx,jsxs:jsx,Fragment:"fragment"};if(name==="next/link")return{default:"link"};if(name==="./grade6-bank.module.css")return{default:new Proxy({},{get:(_,key)=>String(key)})};if(name==="./grade6-bank-native")return{Grade6BankNative:()=>null};if(name==="./grade6-bank-solution")return{Grade6BankSolution:()=>null};if(name.endsWith("grade6-bank-progress"))return{};if(name.endsWith("grade6-bank-input-schema"))return schemaContext.module.exports;if(name.endsWith("grade6-bank-types"))return{BANK_DIFFICULTIES:[{value:1,label:"基础"}],bankStats:()=>({})};throw new Error(name);},console};
  context.exports=context.module.exports;vm.runInNewContext(code,context);
  const record=(a,b,revision,submitted=false)=>({answers:{a,b},revision,submitted,outcome:submitted?"correct":null,score:submitted?2:null,maxScore:2,submissions:0,updatedAt:""});
  const progress={ready:true,progress:{responses:{q:record("old-a","old-b",1)}},getResponse:id=>progress.progress.responses[id],draft:(id,answers)=>{lastDraft=structuredClone(answers);progress.progress.responses[id]={...progress.progress.responses[id],answers,baseRevision:progress.progress.responses[id].revision,submitted:false};},submit:async(id,answers)=>{progress.progress.responses[id]={...progress.progress.responses[id],answers,revision:progress.progress.responses[id].revision+1,submitted:true};return{questionId:id,outcome:"correct",score:2,maxScore:2,fields:[],message:"ok",answerText:"private-analysis",answerImages:[]};}};
  const props={question:{id:"q",number:1,difficulty:1,kind:"multi_blank",prompt:"problem",sourceName:"source",sourcePage:1,originalNumber:"1",questionImages:[],inputs:[{id:"a",label:"空1",kind:"text"},{id:"b",label:"空2",kind:"text"}]},collection:{palette:1,questionCount:2},position:0,count:2,progress,go:()=>{}};
  const render=()=>{index=0;return context.module.exports.__QuestionSession(props);};
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):!node||typeof node!=="object"?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(nodes)];
  let tree=render();assert.deepEqual(nodes(tree).filter(n=>n.type==="textarea").map(n=>n.props.value),["old-a","old-b"]);
  progress.progress.responses.q=record("new-cloud-a","new-cloud-b",2);tree=render();
  const fields=nodes(tree).filter(n=>n.type==="textarea");assert.deepEqual(fields.map(n=>n.props.value),["new-cloud-a","new-cloud-b"],"clean GET must update all controls");
  fields[0].props.onChange({target:{value:"edited-a"}});assert.deepEqual(lastDraft,{a:"edited-a",b:"new-cloud-b"},"one edited blank cannot restore another old blank");
  tree=render();const submit=nodes(tree).find(n=>n.type==="button"&&n.props.children==="提交答案");assert(submit);submit.props.onClick();for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
  tree=render();assert(nodes(tree).some(n=>n.type==="section"&&n.props["data-outcome"]==="correct"));
  progress.progress.responses.q=record("external-a","external-b",4,true);tree=render();assert(!nodes(tree).some(n=>n.type==="section"&&n.props["data-outcome"]),"new server revision must hide old feedback");
  // A migrated multi-blank question never guesses how to split an old aggregate.
  // Old submitted records remain readable and are not rewritten on render.
  states.length=0;lastDraft=null;
  progress.progress.responses.q={...record("","",5,true),answers:{"old-aggregate":"3/4, 1/2"}};
  tree=render();assert.equal(lastDraft,null);assert(nodes(tree).some(n=>n.type==="details"));
  assert.deepEqual(nodes(tree).filter(n=>n.type==="textarea").map(n=>n.props.value),["",""]);
  nodes(tree).find(n=>n.type==="textarea").props.onChange({target:{value:"3/4"}});
  assert.equal(lastDraft,null,"submitted historic records cannot be edited or regraded after native migration");
  assert(nodes(tree).filter(n=>n.type==="textarea").every(n=>n.props.disabled));
  assert(nodes(render()).some(n=>n.type==="details"),"historic aggregate remains visible while locked");
  console.log(JSON.stringify({passed:true,componentScenarios:["clean multi-input refresh","partial edit preserves other latest blanks","external revision invalidates feedback","legacy answers read without writes","never comma-split old fields","submitted legacy controls disabled and edit guarded"]}));

}

await testProgressHook();
await testQuestionControls();
