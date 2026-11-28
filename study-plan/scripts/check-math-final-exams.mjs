import assert from "node:assert/strict";

export async function verifyMathFinalExams(base, headers) {
  const directory = "/subjects/4ea6b4fe-bfd3-440f-b780-6d71c2011609/math/final-exams";
  const files = "/api/grade-six-reviews/math-final-";
  const get = (path, init = {}) => fetch(base + path, { headers, signal: AbortSignal.timeout(20000), ...init });
  const home = await get(directory);
  assert.equal(home.status, 200);
  const listing = await home.text();
  assert.ok(listing.includes(`href="${files}student?download=1"`));
  let finished = 0;
  for (let number = 1; number <= 10; number++) {
    const path = directory + "/" + number;
    assert.ok(listing.includes(`href="${path}"`), path);
    const page = await get(path + "?view=answers");
    assert.equal(page.status, 200, path);
    const html = await page.text();
    const article = html.match(/<article class="exam-sheet"[^>]*>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(article, path);
    assert.deepEqual([...article.matchAll(/<li id="q(\d+)"/g)].map(m => Number(m[1])), Array.from({length:50},(_,i)=>i+1));
    assert.ok(article.includes("<mfrac>") && article.includes("<svg") && article.includes('class="draw-layer"'));
    assert.ok((article.match(/type="radio"/g) ?? []).length >= 60 && article.includes('name="field-50.'));
    const submitted = html.includes('aria-label="考试成绩"');
    if (submitted) finished++;
    assert.equal((article.match(/class="exam-feedback /g) ?? []).length, submitted ? 50 : 0);
    assert.equal(html.includes(`href="${files}answers-${number}?download=1"`), submitted);
    const key = await get(files + "answers-" + number, { method: "HEAD" });
    assert.equal(key.status, submitted ? 200 : 403);
    const pdf = await get(files + "student-" + number, {headers:{...headers,Range:"bytes=0-4"}});
    assert.equal(pdf.status, 206);
    assert.equal(await pdf.text(), "%PDF-");
  }
  for (const id of ["pack","answers"]) {
    assert.equal(listing.includes(`href="${files}${id}?download=1"`), finished === 10);
    assert.equal((await get(files + id, {method:"HEAD"})).status, finished === 10 ? 200 : 403);
  }
  const incomplete = await get("/api/math/final-exams/1", {method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({revision:0,values:{}})});
  assert.equal(incomplete.status,400);
  const error = await incomplete.json();
  assert.deepEqual(Object.keys(error),["error"]);
  for (const file of ["student-1","answers-10","pack"]) assert.equal((await get(files+file,{method:"HEAD",headers:{}})).status,401);
  const signedOut = await get(directory+"/1",{headers:{}});
  assert.doesNotMatch(await signedOut.text(),/class="exam-sheet"|id="q50"/);
  assert.equal((await get(files+"student-11")).status,404);
  console.log("Verified 10 interactive final exams, 500 online questions, answer gates, PDF access and incomplete-submission protection on "+new URL(base).host);
}
