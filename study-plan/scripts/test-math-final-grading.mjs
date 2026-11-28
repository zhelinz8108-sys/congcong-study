import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { brotliDecompressSync } from "node:zlib";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { gradeExam, cleanExamValues, fieldCorrect, ExamInputError } = await loadHolidayTestModule("src/server/math-final-grading.ts");
const { decryptEnglishSixKnowledge } = await loadHolidayTestModule("src/server/english-six-knowledge-envelope.ts");
const metadata = JSON.parse(await readFile(path.join(appRoot,"src/data/math-final-assessment.json"),"utf8"));
const envelope = JSON.parse(await readFile(path.resolve("content/grade-six-reviews",metadata.id+".encrypted.json"),"utf8"));
const bytes = Buffer.from(decryptEnglishSixKnowledge(envelope,process.env.HOLIDAY_MATH_700_KEY),"base64");
assert.equal(createHash("sha256").update(bytes).digest("hex"),metadata.sha256);
const papers = JSON.parse(brotliDecompressSync(bytes).toString());
assert.equal(papers.length,10);
for (const [n,paper] of papers.entries()) {
  assert.equal(paper.questions.length,50);
  assert.equal(paper.keys.length,50);
  const perfect = {};
  for (const [i,q] of paper.questions.entries()) {
    const key = paper.keys[i];
    assert.ok(key.answer && key.explanation && q.fields.length);
    assert.equal(q.fields.length,key.values.length);
    assert.ok(!q.answer && !q.keys && !q.explanation);
    q.fields.forEach((f,j) => { assert.equal(f.id,`${i+1}.${j+1}`); perfect[f.id]=key.values[j]; });
  }
  const result=gradeExam(paper,cleanExamValues(paper.questions,perfect,true));
  assert.equal(result.score,100,`paper ${n+1} missed ${result.correct.flatMap((ok,i)=>ok?[]:[i+1])}`);
  // Changing any single required field loses exactly two points. An empty field cannot be submitted.
  for (const q of paper.questions) {
    for (const f of q.fields) {
      const alt = {...perfect,[f.id]:"incorrect"};
      assert.equal(gradeExam(paper,alt).score,98,`paper ${n+1}, field ${f.id}`);
      assert.throws(()=>cleanExamValues(paper.questions,{...perfect,[f.id]:"  "},true),ExamInputError);
    }
  }
  assert.equal(gradeExam(paper,Object.fromEntries(Object.keys(perfect).map(k=>[k,"?"]))).score,0);
  if (n===4) assert.equal(gradeExam(paper,{...perfect,"40.1":perfect["40.2"],"40.2":perfect["40.1"]}).score,100);
  if (n===5) {
    assert.equal(gradeExam(paper,{...perfect,"40.1":"1,1;1,4;7,4;7,2"}).score,100);
    assert.equal(gradeExam(paper,{...perfect,"40.1":"1,1;7,1;7,2"}).score,98);
  }
  if (n===6) for(const x of [0,8]) assert.equal(gradeExam(paper,{...perfect,"40.1":x+",6"}).score,100);
}
for (const [kind,a,b,ok] of [
  ["number","０．５０","1/2",true],["number","2 又 1/4","9/4",true],["number","1/0","0",false],
  ["simplestFraction","2/4","1/2",false],["ratio","4：8","1:2",true],["simplestRatio","4：8","1:2",false],
  ["pi","(49/3)π","49π/3",true],["pi","49/3","49π/3",false],["binary","10.0","10",false],
]) assert.equal(fieldCorrect({kind,label:"结果"},a,b),ok);
console.log("Verified 500 full-credit answers, every required field, alternate geometry, invalid answers and exact two-point scoring.");

// Validate protected downloads without HTTP access to a real student's answer sheets.
const guides = JSON.parse(await readFile(path.join(appRoot,"src/data/grade-six-reviews.json"),"utf8"));
for (const guide of guides.filter(g => g.id.startsWith("math-final-"))) {
  const parts = [];
  for (let i=0;i<(guide.parts ?? 1);i++) {
    const id = guide.id + (i ? "-"+(i+1) : "");
    const file = JSON.parse(await readFile(path.resolve("content/grade-six-reviews",id+".encrypted.json"),"utf8"));
    parts.push(Buffer.from(decryptEnglishSixKnowledge(file,process.env.HOLIDAY_MATH_700_KEY),"base64"));
  }
  const file = Buffer.concat(parts);
  assert.equal(createHash("sha256").update(file).digest("hex"),guide.sha256);
  if (guide.type === "application/pdf") assert.equal(file.subarray(0,5).toString(),"%PDF-");
  else {
    const zip = new AdmZip(file);
    assert.equal(zip.getEntries().length,20);
    for (let n=1;n<=10;n++) for (const label of ["学生卷","答案解析"]) {
      assert.equal(zip.readFile(label+"/第"+String(n).padStart(2,"0")+"卷-"+label+".pdf").subarray(0,5).toString(),"%PDF-");
    }
  }
}
