import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

export async function verifyEnglishSix() {
  process.chdir(appRoot);
  const server = await loadHolidayTestModule("src/server/english-six.ts");
  const lib = await loadHolidayTestModule("src/lib/english-six.ts");
  const index = server.englishSixIndex();
  assert.deepEqual(index.units.map(u => u.number), [1,2,3,4,5,6,7,8]);
  assert.equal(index.summary.sourceFiles, 1846);
  assert.equal(index.summary.includedFiles, 1845);
  assert.equal(new Set(index.resources.map(r => r.id)).size, index.resources.length);
  assert.equal(index.resources.reduce((n, r) => n + r.paths.length, 0), 1845);
  assert.ok(index.resources.every(r => r.extension !== ".zip"));
  for (const resource of index.resources) {
    for (const [unit, start] of Object.entries(resource.unitStarts ?? {})) {
      assert.ok(Number(unit) >= 1 && Number(unit) <= 8, resource.id);
      assert.ok(Number.isInteger(start) && start > 0 && start <= resource.pageCount, resource.id);
    }
  }
  let questions = 0, choices = 0;
  for (let unit = 1; unit <= 8; unit++) {
    const privatePaper = server.englishSixPaper(unit);
    const paper = server.englishSixPublicPaper(unit);
    assert.equal(paper.questions.length, 66);
    assert.ok(!JSON.stringify(paper).includes('"answer":'));
    assert.ok(!JSON.stringify(paper).includes('"explanation":'));
    assert.ok(paper.questions.every(q => q.prompt.trim()));
    assert.equal(new Set(paper.questions.map(q => q.id)).size, 66);
    for (const q of privatePaper.questions) {
      assert.ok(q.answer.trim(), q.id);
      assert.ok(q.explanation.trim(), q.id);
      assert.equal(server.englishSixGrade(unit, q.id, " "), undefined);
      if (q.options.length) {
        choices++;
        assert.equal(new Set(q.options.map(o => o.id)).size, q.options.length);
        assert.ok(q.options.every(o => o.text.trim()));
        assert.equal(server.englishSixGrade(unit, q.id, q.answer).correct, q.grading === "reference" ? null : true);
        const wrong = q.options.find(o => o.id !== q.answer);
        assert.equal(server.englishSixGrade(unit, q.id, wrong.id).correct, q.grading === "reference" ? null : false);
        assert.equal(server.englishSixGrade(unit, q.id, "Z"), undefined);
      } else {
        const count = paper.questions.find(item => item.id === q.id).inputCount;
        const response = count > 1 ? JSON.stringify(Array(count).fill("practice")) : "practice";
        assert.equal(server.englishSixGrade(unit, q.id, response).correct, null);
        if (count > 1) assert.equal(server.englishSixGrade(unit, q.id, "only one blank"), undefined);
      }
    }
    assert.ok(!JSON.stringify(server.englishSixResourcePage(paper.sourceId, 1)).includes("答案："));
    questions += paper.questions.length;
  }
  assert.equal(questions, 528);
  const sourcePapers = index.resources.filter(r => r.paths.some(p => p.includes("单元测试\\")));
  assert.equal(sourcePapers.length, 16);
  for (const r of sourcePapers) {
    const source = server.englishSixResource(r.id);
    const marker = b => b.kind === "text" && b.text.replace(/\s+/g, "").includes("参考答案及详细解析");
    const boundary = source.pages.findIndex(p => p.blocks.some(marker));
    assert.ok(boundary >= 0, `${r.id}: answer boundary found`);
    for (let p = boundary; p < source.pages.length; p++) {
      const expected = p === boundary ? source.pages[p].blocks.findIndex(marker) : 0;
      assert.equal(server.englishSixResourcePage(r.id, p + 1).content.blocks.length, expected, `${r.id}: no appended answers on page ${p + 1}`);
    }
  }
  assert.equal(server.englishSixPaper(0), undefined);
  assert.equal(server.englishSixPaper(9), undefined);
  assert.equal(server.englishSixPaper(1.5), undefined);
  assert.equal(server.englishSixAsset("../../index.json"), undefined);
  assert.equal(server.englishSixResource("../index"), undefined);
  assert.equal(server.englishSixPaper(1).questions[2].answer, "B");
  assert.equal(server.englishSixPaper(6).questions[9].options.find(o => o.id === "D").text, "from");
  assert.equal(server.englishSixPaper(7).questions[8].options.find(o => o.id === "D").text, "make");
  const assets = JSON.parse(readFileSync(path.join(server.englishSixRoot, "assets.private.json"), "utf8"));
  for (const [id, asset] of Object.entries(assets)) {
    assert.ok(existsSync(path.join(server.englishSixRoot, asset.file)), id);
    assert.ok(asset.size > 0, id);
    assert.equal(statSync(path.join(server.englishSixRoot, asset.file)).size, asset.size, id);
  }
  assert.deepEqual(lib.englishSixAccuracy({}), { answered: 0, graded: 0, correct: 0, accuracy: null });
  const result = { a: { correct: true }, b: { correct: false }, c: { correct: null } };
  assert.deepEqual(lib.englishSixAccuracy(result), { answered: 3, graded: 2, correct: 1, accuracy: 50 });
  const scopeOf = id => lib.englishSixResourceScope(index.resources.find(r => r.id === id));
  for (const edition of ["new", "legacy"]) {
    const groups = lib.englishSixCollections.flatMap(c => lib.englishSixResources(index, edition, null, "all", "", c.id));
    assert.equal(groups.length, index.resources.filter(r => r.edition === edition).length);
    assert.equal(new Set(groups.map(r => r.id)).size, groups.length, "every resource has one collection");
    const unitResources = [];
    for (let unit = 1; unit <= 8; unit++) {
      const rs = lib.englishSixResources(index, edition, unit, "all");
      assert.ok(rs.length > 0);
      assert.ok(rs.every(r => r.edition === edition && lib.englishSixResourceScope(r).collection === "units" &&
        lib.englishSixResourceScope(r).units.length === 1 && lib.englishSixResourceScope(r).units[0] === unit));
      unitResources.push(...rs);
    }
    assert.equal(new Set(unitResources.map(r => r.id)).size, unitResources.length, "unit lists never overlap");
  }
  for (const id of ["1f47774ac669", "17f452a1672e", "84b200596cb1", "72928f7b3220", "4e81e1690931"]) {
    assert.equal(scopeOf(id).collection, "books");
    assert.deepEqual(scopeOf(id).units, [1,2,3,4,5,6,7,8]);
    for (let u = 1; u <= 8; u++) assert.ok(!lib.englishSixResources(index, "new", u, "all").some(r => r.id === id));
  }
  assert.deepEqual(scopeOf("43e20992bb18").units, [1,2,3,4]);
  assert.equal(scopeOf("43e20992bb18").collection, "books");
  assert.deepEqual(scopeOf("c607b7d96297").units, [2], "filename overrides batch folder");
  assert.deepEqual(scopeOf("72229cc3e5d6").units, [3]);
  assert.deepEqual(scopeOf("8e4d426aaa2b").units, [3], "filename overrides noisy OCR chapters");
  assert.deepEqual(scopeOf("cd846e3d3d6f").units, [1], "6AU1 is recognized");
  assert.deepEqual(scopeOf("8825968c92e7").units, [5], "Unit_5 parent folder is recognized");
  assert.equal(scopeOf("6ddfba0915b2").period, "midterm");
  assert.equal(scopeOf("3f796b746584").period, "final");
  assert.ok(lib.englishSixResources(index, "new", null, "all", "", "exams", "midterm").every(r => scopeOf(r.id).period !== "final"));
  assert.ok(lib.englishSixResources(index, "new", 3, "practice").some(r => r.id === "72229cc3e5d6"));
  assert.equal(lib.englishSixResourceStage(index.resources.find(r => r.id === "c8933fe6a1b7")), "listen");
  return { server, lib, index, questions, choices, assets: Object.keys(assets).length };
}
if (process.argv[1]?.endsWith("test-english-six.mjs")) {
  const result = await verifyEnglishSix();
  console.log(JSON.stringify({ resources: result.index.resources.length, questions: result.questions, choices: result.choices, assets: result.assets, checks: "pass" }, null, 2));
}
