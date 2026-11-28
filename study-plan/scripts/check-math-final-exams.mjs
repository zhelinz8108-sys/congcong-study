import assert from "node:assert/strict";
import AdmZip from "adm-zip";

export async function verifyMathFinalExams(base, headers) {
  const directory = "/subjects/4ea6b4fe-bfd3-440f-b780-6d71c2011609/math/final-exams";
  const files = "/api/grade-six-reviews/math-final-";
  const get = (path, init = {}) => fetch(base + path, { headers, signal: AbortSignal.timeout(20000), ...init });
  const home = await get(directory);
  assert.equal(home.status, 200);
  const listing = await home.text();
  for (const id of ["student", "answers", "pack"]) {
    assert.ok(listing.includes(`href="${files}${id}?download=1"`));
  }
  const bundle = await get(files + "pack?download=1");
  assert.equal(bundle.headers.get("content-type"), "application/zip");
  const zip = new AdmZip(Buffer.from(await bundle.arrayBuffer()));
  assert.equal(zip.getEntries().length, 20);
  for (let number = 1; number <= 10; number++) {
    for (const [edition, label] of [["student", "学生卷"], ["answers", "答案解析"]]) {
      const reader = `${directory}/${number}${edition === "answers" ? "?view=answers" : ""}`;
      assert.ok(listing.includes(`href="${reader}"`), reader);
      const page = await get(reader);
      assert.equal(page.status, 200, reader);
      const html = await page.text();
      const article = html.match(/<article class="exam-sheet"[^>]*>([\s\S]*?)<\/article>/)?.[1];
      assert.ok(article, reader);
      const numbers = [...article.matchAll(/<li id="q(\d+)"/g)].map(match => Number(match[1]));
      assert.deepEqual(numbers, Array.from({ length: 50 }, (_, i) => i + 1));
      assert.equal((article.match(/class="exam-result"/g) ?? []).length, edition === "answers" ? 50 : 0);
      assert.equal((article.match(/class="exam-options"/g) ?? []).length, edition === "student" ? 12 : 0);
      assert.ok(article.includes("<mfrac>") && article.includes("<svg"));
      const pdfUrl = `${files}${edition}-${number}?download=1`;
      assert.ok(html.includes(`href="${pdfUrl}"`), reader);
      const pdf = await get(pdfUrl);
      assert.equal(pdf.status, 200);
      assert.equal(pdf.headers.get("content-type"), "application/pdf");
      assert.match(pdf.headers.get("content-disposition"), /^attachment;/);
      const expected = zip.readFile(`${label}/第${String(number).padStart(2, "0")}卷-${label}.pdf`);
      assert.ok(expected && expected.subarray(0, 5).toString() === "%PDF-");
      assert.ok(expected.equals(Buffer.from(await pdf.arrayBuffer())), pdfUrl);
    }
  }
  const part = await get(files + "student-1", { headers: { ...headers, Range: "bytes=0-4" } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), "%PDF-");
  for (const path of ["student-1", "answers-10", "pack"]) {
    assert.equal((await get(files + path, { headers: {}, method: "HEAD" })).status, 401);
  }
  for (const view of ["", "?view=answers"]) {
    const signedOut = await get(directory + "/1" + view, { headers: {} });
    assert.doesNotMatch(await signedOut.text(), /<article class="exam-sheet"|id="q50"/);
  }
  assert.equal((await get(files + "student-11")).status, 404);
  console.log("Math final exams verified: directory, all 500 student questions, 500 answers, 20 matching individual PDFs, print bundle and family access on " + new URL(base).host);
}
