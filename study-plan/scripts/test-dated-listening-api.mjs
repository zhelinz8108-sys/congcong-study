import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as uuid from 'uuid';
import {loadHolidayTestModule} from './holiday-math-test-utils.mjs';

const names=['NODE_ENV','FAMILY_ACCESS_PASSWORD','FAMILY_ACCESS_SECRET'];
const previous=Object.fromEntries(names.map(key=>[key,process.env[key]]));
process.env.NODE_ENV='production';
process.env.FAMILY_ACCESS_PASSWORD=randomBytes(24).toString('hex');
process.env.FAMILY_ACCESS_SECRET=randomBytes(32).toString('hex');
const json=(data,{status=200,headers={}}={})=>({status,data,headers});
async function moduleFrom(file,deps) {
  const source=await readFile(file,'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(output,{module,exports:module.exports,process,Buffer,URL,require:name=>{
    if(name==='server-only')return {};
    if(name==='next/server')return {NextResponse:{json}};
    if(Object.hasOwn(deps,name))return deps[name];
    throw new Error('Unexpected dependency '+name);
  }},{filename:file});
  return module.exports;
}

try {
  const family=await loadHolidayTestModule('src/lib/family-access.ts');
  const access=await moduleFrom('src/server/holiday-math-700/http.ts',{'@/lib/family-access':family});
  const englishId='8bd6f79b-99f5-4e68-a961-872d60d260b1';
  const otherId='faee9565-9b43-49fc-8823-a6835efc6f9d';
  const unitId=uuid.v5('english-listening:2026-11-09',englishId);
  const queries=[], units=new Map(), materials=[];
  let fail=false;
  const pool={query:async(sql,args)=>{
    queries.push({sql,args});
    if(fail)throw new Error('private SQL error and credentials must never be returned');
    if(sql.startsWith('SELECT id FROM study_subjects'))return {rows:args[0]===englishId&&args[1]==='英语'?[{id:englishId}]:[]};
    if(sql.includes('FROM study_materials m JOIN study_units'))return {rows:units.get(args[0])?.subject_id===args[1]?materials.filter(m=>m.unit_id===args[0]):[]};
    if(sql.includes('INSERT INTO study_units')){
      assert.ok(sql.includes('ON CONFLICT (id) DO NOTHING'));
      assert.ok(!sql.includes('DO UPDATE'));
      if(units.has(args[0]))return {rows:[]};
      units.set(args[0],{id:args[0],subject_id:args[1],name:args[2],group_name:args[3],sort_order:7});
      return {rows:[{id:args[0]}]};
    }
    if(sql.startsWith('SELECT id FROM study_units'))return {rows:units.get(args[0])?.subject_id===args[1]?[{id:args[0]}]:[]};
    throw new Error('Unexpected query');
  }};
  const api=await moduleFrom('src/app/api/subjects/[id]/listening/2026-11-09/route.ts',{'uuid':uuid,'@/lib/db':{pool},'@/server/holiday-math-700/http':access});
  function request({authenticated=true,origin='https://congcong-study.cn',site='same-origin'}={}) {
    return {url:'https://congcong-study.cn/api/subjects/'+englishId+'/listening/2026-11-09',headers:new Headers({origin,'sec-fetch-site':site}),cookies:{get:()=>authenticated?{value:family.createFamilyAccessToken()}:undefined}};
  }
  const context=id=>({params:Promise.resolve({id})});
  const checks=[];
  for(const method of ['GET','POST']) {
    const before=queries.length;
    assert.equal((await api[method](request({authenticated:false}),context(englishId))).status,401);
    assert.equal(queries.length,before);
  }
  checks.push('unauthenticated-reads-and-writes-rejected-before-database');
  for(const options of [{origin:'https://other.example'},{site:'cross-site'}]) {
    const before=queries.length;
    assert.equal((await api.POST(request(options),context(englishId))).status,403);
    assert.equal(queries.length,before);
  }
  checks.push('cross-origin-and-cross-site-writes-rejected');
  let response=await api.GET(request(),context(englishId));
  assert.equal(response.status,200);assert.equal(response.data.unitId,unitId);
  assert.equal(response.data.materials.length,0);assert.equal(units.size,0);
  assert.ok(queries.every(q=>q.sql.trim().startsWith('SELECT')));
  assert.match(response.headers['Cache-Control'],/no-store/);
  checks.push('empty-date-read-is-read-only-and-uncached');
  for(const id of [otherId,'../../private'])for(const method of ['GET','POST'])assert.equal((await api[method](request(),context(id))).status,404);
  assert.equal(units.size,0);checks.push('only-existing-english-subject-is-accepted');
  const responses=await Promise.all(Array.from({length:5},()=>api.POST(request(),context(englishId))));
  assert.equal(units.size,1);assert.equal(responses.filter(r=>r.status===201).length,1);
  assert.ok(responses.every(r=>r.data.unitId===unitId&&[200,201].includes(r.status)));
  checks.push('concurrent-date-initialization-uses-one-stable-unit');
  units.get(unitId).name='Family renamed this existing collection';
  const preserved=JSON.stringify(units.get(unitId));
  materials.push({id:'synthetic-audio',unit_id:unitId,name:'synthetic',file_type:'audio',file_path:'/api/files/study-uploads/fixture.mp3',file_size:10});
  assert.equal((await api.POST(request(),context(englishId))).status,200);
  response=await api.GET(request(),context(englishId));
  assert.equal(response.data.materials[0].id,'synthetic-audio');
  assert.equal(JSON.stringify(units.get(unitId)),preserved);
  checks.push('repeat-initialization-preserves-existing-name-and-materials');
  fail=true;
  for(const method of ['GET','POST']) {
    response=await api[method](request(),context(englishId));
    assert.equal(response.status,503);assert.ok(!JSON.stringify(response.data).includes('private SQL'));
    assert.match(response.headers['Cache-Control'],/no-store/);
  }
  checks.push('database-errors-are-sanitized-and-uncached');
  console.log(JSON.stringify({passed:true,checks,realDatabaseWrites:0,learnerWrites:0}));
} finally {
  for(const name of names)if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];
}
