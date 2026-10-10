import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";

// Pure-memory regression tests: the real hook/component source is transpiled
// into isolated VM contexts. fetch, localStorage, browser events and React are
// replaced locally. No network, database, credentials or production writes.
const hookPath = new URL("../src/lib/grade6-bank-progress.ts", import.meta.url);
const componentPath = new URL("../src/components/grade6-bank.tsx", import.meta.url);

async function testProgressHook() {
  const text=fs.readFileSync(hookPath,"utf8");
  const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const storage=new Map(); const response=(answers={},revision=0,submitted=false)=>({answers,revision,submitted,outcome:submitted?"correct":null,score:submitted?1:null,maxScore:submitted?1:0,submissions:submitted?1:0,updatedAt:revision?"2026-10-11T01:00:00.000Z":""});
  let canonicalize=false;let remote={},failDraft=false,holdDraft=null,holdResolve=null,forcePostConflict=false; const calls=[];
  const fetchMock=async(url,options={})=>{
   const body=options.body?JSON.parse(options.body):null; calls.push({url,method:options.method??"GET",body});
   if(!options.method)return {ok:true,status:200,json:async()=>structuredClone({responses:remote,lastQuestionId:"q",updatedAt:""})};
   if(options.method==="PUT"&&failDraft)throw new Error("offline");
   if(options.method==="PUT"&&holdDraft){const gate=holdDraft;holdDraft=null;await gate;}
   if(options.method==="POST"&&forcePostConflict){forcePostConflict=false;remote.q=response({a:"new-cloud"},remote.q.revision+1,true);}
   const old=remote[body.question_id]??response();
   if(body.base_revision!==old.revision)return {ok:false,status:409,json:async()=>({error:"conflict",response:structuredClone(old)})};
   const canonical=canonicalize?Object.fromEntries([...new Set([...Object.keys(body.answers),"b"])].map(id=>[id,(body.answers[id]??"").trim()])):body.answers;const saved=response(canonical,old.revision+1,options.method==="POST");remote[body.question_id]=saved;
   return {ok:true,status:200,json:async()=>options.method==="POST"?{response:structuredClone(saved),feedback:{questionId:body.question_id,outcome:"correct",score:1,maxScore:1,fields:[],message:"ok",answerText:"private",answerImages:[]}}:structuredClone(saved)};
  };
  const settle=async()=>{for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));};
  function mount(){
   const states=[],refs=[],effects=[],events=new Map();let si=0,ri=0;
   const react={useState:(init)=>{const i=si++;states[i]=typeof init==="function"?init():init;return [states[i],v=>{states[i]=typeof v==="function"?v(states[i]):v;}];},useRef:v=>{const i=ri++;refs[i]={current:v};return refs[i];},useCallback:f=>f,useEffect:f=>effects.push(f)};
   const surface={addEventListener:(n,f)=>events.set(n,f),removeEventListener:(n)=>events.delete(n)};
   const context={module:{exports:{}},exports:{},require:n=>{if(n==="react")return react;throw new Error(n);},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},fetch:fetchMock,AbortSignal,setTimeout,clearTimeout,document:{...surface,visibilityState:"visible"},window:surface,console};
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
  const before=calls.filter(c=>c.method==="PUT").length;h.events.get("online")();await settle();assert.equal(h.states[2],"conflict");assert.equal(remote.q.answers.a,"E-cloud");assert.equal(h.states[0].responses.q.answers.a,"D");assert.equal(calls.filter(c=>c.method==="PUT").length,before,"conflicted drafts must not retry automatically");
  await assert.rejects(h.hook.submit("q",{a:"D"}),/没有覆盖/);assert.equal(remote.q.revision,4);assert.equal(JSON.parse(storage.get(key)).responses.q.baseRevision,4);
  await h.hook.submit("q",{a:"D"});assert.equal(remote.q.revision,5);assert.equal(remote.q.answers.a,"D");assert.equal(h.states[2],"saved");
  h.hook.draft("q",{a:"F"});await h.hook.flush();forcePostConflict=true;
  await assert.rejects(h.hook.submit("q",{a:"F"}),/没有覆盖/);assert.equal(remote.q.answers.a,"new-cloud");assert.equal(h.states[0].responses.q.answers.a,"F");assert.equal(h.states[2],"conflict");
  await h.hook.submit("q",{a:"F"});assert.equal(remote.q.answers.a,"F");assert.equal(h.states[2],"saved");h.cleanup();
  storage.set(key,JSON.stringify({responses:{q:{...response({a:"future-clock-stale"},2),baseRevision:2,updatedAt:"9999-01-01T00:00:00Z"}},lastQuestionId:"q",updatedAt:"",dirtyQuestionIds:["q"]}));
  h=mount();await settle();assert.equal(h.states[2],"conflict");assert.equal(h.states[0].responses.q.answers.a,"future-clock-stale");assert.equal(h.states[0].responses.q.submitted,false);assert.equal(remote.q.answers.a,"F");h.cleanup();
  storage.set(key,JSON.stringify({responses:remote,lastQuestionId:"q",updatedAt:"",dirtyQuestionIds:[]}));
  h=mount();await settle();const displayed=remote.q.answers.a;remote.q=response({a:"other-device-latest"},remote.q.revision+1,true);
  h.events.get("online")();await settle();const oldUiWrites=calls.filter(c=>c.method!=="GET").length;
  await assert.rejects(h.hook.submit("q",{a:displayed}),/没有覆盖/);assert.equal(remote.q.answers.a,"other-device-latest");assert.equal(calls.filter(c=>c.method!=="GET").length,oldUiWrites);
  await h.hook.submit("q",{a:displayed});assert.equal(remote.q.answers.a,displayed);h.cleanup();
  storage.clear();remote={};canonicalize=true;h=mount();await settle();h.hook.draft("q",{a:"3/4 "});await h.hook.flush();assert.equal(h.states[2],"saved");assert.deepEqual(JSON.parse(storage.get(key)).dirtyQuestionIds,[]);assert.equal(h.states[0].responses.q.answers.a,"3/4");assert.equal(h.states[0].responses.q.answers.b,"");await h.hook.submit("q",{a:"3/4 "});assert.equal(h.states[2],"saved");assert.equal(remote.q.submitted,true);await h.hook.submit("q",{a:"3/4"+String.fromCharCode(10)});assert.equal(h.states[2],"saved");h.cleanup();canonicalize=false;

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

  console.log(JSON.stringify({passed:true,scenarios:["no local grade promotion","failed dirty/base persistence","online retry","preserve later edits with server revision","GET stale conflict blocks auto retry","first manual conflict no overwrite","second explicit submit","POST conflict then explicit retry","future client clock cannot override","server trim / empty field equivalence","pagehide save before accept then reload","equal other-device submission keeps server grade"],writes:calls.filter(c=>c.method!=="GET").length}));

}

async function testQuestionControls() {
  const source=fs.readFileSync(componentPath,"utf8")+"\nexport { QuestionSession as __QuestionSession };";
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const states=[];let index=0,lastDraft=null;
  const jsx=(type,props)=>({type,props});const react={useState:init=>{const i=index++;if(!(i in states))states[i]=typeof init==="function"?init():init;return[states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},useRef:v=>({current:v}),useEffect:()=>{},useMemo:f=>f()};
  const context={module:{exports:{}},exports:{},require:name=>{if(name==="react")return react;if(name==="react/jsx-runtime")return{jsx,jsxs:jsx,Fragment:"fragment"};if(name==="next/link")return{default:"link"};if(name==="./grade6-bank.module.css")return{default:new Proxy({},{get:(_,key)=>String(key)})};if(name.endsWith("grade6-bank-progress"))return{};if(name.endsWith("grade6-bank-types"))return{BANK_DIFFICULTIES:[{value:1,label:"基础"}],bankStats:()=>({})};throw new Error(name);},console};
  context.exports=context.module.exports;vm.runInNewContext(code,context);
  const record=(a,b,revision,submitted=false)=>({answers:{a,b},revision,submitted,outcome:submitted?"correct":null,score:submitted?2:null,maxScore:2,submissions:0,updatedAt:""});
  const progress={progress:{responses:{q:record("old-a","old-b",1)}},getResponse:id=>progress.progress.responses[id],draft:(id,answers)=>{lastDraft=structuredClone(answers);progress.progress.responses[id]={...progress.progress.responses[id],answers,baseRevision:progress.progress.responses[id].revision,submitted:false};},submit:async(id,answers)=>{progress.progress.responses[id]={...progress.progress.responses[id],answers,revision:progress.progress.responses[id].revision+1,submitted:true};return{questionId:id,outcome:"correct",score:2,maxScore:2,fields:[],message:"ok",answerText:"private-analysis",answerImages:[]};}};
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
  console.log(JSON.stringify({passed:true,componentScenarios:["clean multi-input refresh","partial edit preserves other latest blanks","external revision invalidates feedback"]}));

}

await testProgressHook();
await testQuestionControls();
