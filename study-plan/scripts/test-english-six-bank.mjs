import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

export async function verifySixBank() {
  process.chdir(appRoot);
  const service = await loadHolidayTestModule("src/server/english-six-bank.ts");
  const lib = await loadHolidayTestModule("src/lib/english-six-bank.ts");
  const index = service.englishSixBankIndex();
  assert.equal(index.complete, false, "Incomplete source conversion must not claim completion");
  assert.ok(index.papers.length > 200);
  const ids = new Set(), kinds = new Set();
  let count = 0, graded = 0, reference = 0;
  for (const entry of index.papers) {
    const paper = service.englishSixBankPrivatePaper(entry.id);
    const pub = service.englishSixBankPublicPaper(entry.id);
    assert.equal(pub.questions.length, entry.questionCount);
    assert.equal(paper.questions.length, entry.questionCount);
    const wire = JSON.stringify(pub);
    for (const name of ["answer", "accepted", "explanation", "keySource", "sharedExplanation", "referenceOnly", "acceptedOverride"])
      assert.ok(!wire.includes(`"${name}":`), `${entry.id} leaked ${name}`);
    assert.equal(paper.unit, entry.unit);
    const source = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources", `${entry.sourceId}.json`), "utf8"));
    for (const [i, q] of paper.questions.entries()) {
      assert.ok(!ids.has(q.id), q.id); ids.add(q.id); kinds.add(q.kind);
      assert.match(q.id, /^sx-[a-f0-9]{12}-[a-f0-9]{12}$/);
      assert.ok(q.prompt.trim() && q.answer.trim() && q.explanation.trim(), q.id);
      assert.ok(source.pages[q.sourcePage - 1]?.blocks[q.sourceBlock], `${q.id}: original source location`);
      assert.ok(q.keySource.resourceId && q.keySource.page > 0);
      const key = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources", `${q.keySource.resourceId}.json`), "utf8"));
      assert.ok(key.pages[q.keySource.page - 1]?.blocks[q.keySource.block], `${q.id}: key source location`);
      assert.equal(service.englishSixBankGrade(q.id, " "), undefined);
      assert.equal(service.englishSixBankGrade(q.id, "x".repeat(10001)), undefined);
      if (q.options.length) {
        assert.equal(new Set(q.options.map(o => o.id)).size, q.options.length);
        assert.ok(q.options.every(o => o.text.trim()));
        assert.equal(service.englishSixBankGrade(q.id, q.answer).correct, q.grading === "reference" ? null : true, q.id);
        const wrong = q.options.find(o => o.id !== q.answer).id;
        assert.equal(service.englishSixBankGrade(q.id, wrong).correct, q.grading === "reference" ? null : false, q.id);
        assert.equal(service.englishSixBankGrade(q.id, "Z"), undefined);
        if (q.grading === "reference") reference++; else graded++;
      } else if (q.grading === "exact") {
        assert.equal(q.accepted.length, pub.questions[i].inputCount);
        const values = q.accepted.map(a => a[0]);
        const right = lib.sixBankResponse(pub.questions[i], values);
        assert.equal(service.englishSixBankGrade(q.id, right).correct, true, q.id);
        for (const [slot, variants] of q.accepted.entries()) for (const variant of variants)
          assert.equal(service.englishSixBankGrade(q.id, lib.sixBankResponse(pub.questions[i], values.map((v, n) => n === slot ? variant : v))).correct, true, `${q.id}: accepted variant`);
        assert.equal(service.englishSixBankGrade(q.id, lib.sixBankResponse(pub.questions[i], values.map(() => "incorrect"))).correct, false, q.id);
        if (values.length > 1) {
          assert.equal(service.englishSixBankGrade(q.id, JSON.stringify(values.slice(1))), undefined);
          assert.equal(service.englishSixBankGrade(q.id, JSON.stringify(values.map((v, n) => n ? v : ""))), undefined);
        }
        graded++;
      } else {
        const response = lib.sixBankResponse(pub.questions[i], Array(pub.questions[i].inputCount).fill("open expression"));
        assert.equal(service.englishSixBankGrade(q.id, response).correct, null);
        if (pub.questions[i].inputCount > 1) assert.equal(service.englishSixBankGrade(q.id, "only one blank"), undefined);
        reference++;
      }
      if (/对话第|短文第/.test(q.prompt)) assert.ok(q.context.length > 50, `${q.id}: passage retained`);
      count++;
    }
  }
  assert.equal(count, index.questionCount);
  assert.equal(ids.size, count);
  assert.deepEqual([...kinds].sort(), ["choice", "fill", "judgment", "sentence", "writing"]);
  assert.equal(service.englishSixBankPublicPaper("../../index"), undefined);
  assert.equal(service.englishSixBankGrade("sx-000000000000-000000000000", "A"), undefined);
  assert.equal(lib.normalizeSixBankAnswer("  DIDN’T   play. "), "didn't play");
  const privateLookup = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/bank/lookup.private.json"), "utf8"));
  assert.equal(Object.keys(privateLookup).length, count);
  for (const id of ["981bb9fd35b0", "d3c1da19ba51", "f5988f72cb92", "584b2e8411ff", "a8ae68b3c494", "ba8444397e34", "eeeb5340deb5", "cfc873ad019f"])
    assert.equal(index.papers.filter(p => p.sourceId === id).reduce((n, p) => n + p.questionCount, 0), 118, `${id}: all course exercises matched`);
  const phraseQuestions = index.papers.filter(p => p.sourceId === "0467910b917e")
    .flatMap(p => service.englishSixBankPrivatePaper(p.id).questions);
  const exclamation = phraseQuestions.find(q => q.prompt === "______ a wonderful journey!");
  assert.equal(exclamation.answer, "A", "Do not retain the source's double-a wrong answer");
  assert.equal(service.englishSixBankGrade(exclamation.id, "A").correct, true);
  assert.equal(phraseQuestions.find(q => q.prompt === '______ about "Help the Earth, Help Us"?').grading, "reference", "What/How are both valid");
  const sourceQuestions = (sourceId, unit) => index.papers.filter(p => p.sourceId === sourceId && (unit === undefined || p.unit === unit))
    .flatMap(p => service.englishSixBankPrivatePaper(p.id).questions);
  for (const [source, expected] of [["8d95a291a5eb", 1040], ["0467910b917e", 535], ["8092f44e7f99", 638], ["e647931251a3", 16], ["6e02f8e40713", 144], ["195b26ca27ec", 104]])
    assert.equal(sourceQuestions(source).length, expected, `${source}: reviewed source coverage`);
  for (const [source, expected] of [["769c6dafd99c", 30], ["051924f1bf79", 25], ["4f918e032ba7", 18], ["72c5154d7bc2", 17], ["0621369cf446", 20], ["f03a63369d84", 17], ["7d9939cacb8a", 14], ["df0149b2b0f8", 14]])
    assert.equal(sourceQuestions(source).length, expected, `${source}: lecture exercises`);
  const actor = sourceQuestions("769c6dafd99c").find(q => q.prompt.includes("They") && q.prompt.includes("(act)") && q.prompt.includes("now"));
  assert.equal(actor.answer, "are acting", "now requires present continuous, not act");
  const basics = sourceQuestions("8092f44e7f99");
  const feel = basics.find(q => q.prompt.includes("didn't") && q.prompt.includes("good after"));
  assert.equal(feel.answer, "A", "didn't feel, not didn't felt");
  const books = basics.find(q => q.prompt.includes("The books") && q.topic.includes("was / were"));
  assert.equal(books.answer, "were", "plural books use were");
  const practise = basics.find(q => q.prompt.includes("Su Yang") && q.prompt.includes("(practise)"));
  assert.ok(practise.answer.endsWith("to practise"), "ask somebody to practise, not practised");
  const eBook = sourceQuestions("8092f44e7f99", 8).find(q => q.prompt.startsWith("We read e-"));
  assert.equal(eBook.answer, "books", "printed e- prefix must not be duplicated");
  const cloze = sourceQuestions("8092f44e7f99", 8).find(q => q.prompt.startsWith("Fifty years ago"));
  assert.deepEqual(cloze.accepted.map(a => a[0]), ["wrote", "travelled", "paid", "were", "writes", "has", "takes", "pays"]);
  assert.ok(!cloze.explanation.includes("has e-mails and have online"));
  const tool = basics.find(q => q.prompt.includes("Billy made a hat") && q.topic.includes("句型"));
  assert.equal(tool.answer, "How did Billy make a hat?", "do not change the hat into a tool");
  for (const q of sourceQuestions("e647931251a3")) {
    assert.equal(q.kind, "writing"); assert.equal(q.grading, "reference");
    assert.ok(q.explanation.includes("中文参考") && q.explanation.includes("词"));
  }
  const dialogue = index.papers.find(p => p.sourceId === "760b08816efb" && p.unit === 2 && p.title.includes("补全对话"));
  assert.equal(dialogue.questionCount, 5, "shared option objects must not quarantine a corrected dialogue");
  for (const q of service.englishSixBankPrivatePaper(dialogue.id).questions)
    assert.equal(q.options.find(o => o.id === "C").text, "What is the book about?");
  const doubleA = sourceQuestions("195b26ca27ec", 7).find(q => q.prompt === "________ a big fish!");
  assert.equal(doubleA.answer, "B", "source What a a error corrected");
  const twoSides = sourceQuestions("195b26ca27ec", 6).find(q => q.prompt.includes("两面"));
  assert.equal(twoSides.answer, "both sides; paper", "both sides must not omit sides");
  const audit = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/bank/audit.private.json"), "utf8"));
  assert.ok(audit.problems.some(p => p.sourceId === "df0149b2b0f8" && p.reason === "key-without-source-question"));
  const legacySources = ["3f35c6b5da2b", "8955f12c65d2", "e2e3e3fcdc4f", "09ce5f89090a", "d3479e9e9b33", "e90808a8dd22", "b48de03c5d6c", "a930d1f25ab7"];
  for (const [i, expected] of [36, 20, 37, 25, 30, 31, 29, 23].entries()) {
    assert.equal(sourceQuestions(legacySources[i]).length, expected);
    for (const paper of index.papers.filter(p => p.sourceId === legacySources[i]))
      assert.equal(paper.edition, "legacy", "old checklist must not be mixed into the 2026 edition");
  }
  const oldUnit1 = sourceQuestions(legacySources[0]);
  assert.equal(oldUnit1.find(q => q.prompt.includes("rice in the bowl")).answer, "Was");
  assert.equal(oldUnit1.find(q => q.prompt.includes("students in the playground now")).answer, "aren't");
  assert.equal(oldUnit1.find(q => q.prompt.includes("Mr. Smith")).answer, "C");
  assert.equal(oldUnit1.find(q => q.prompt.includes("go swimming, but")).answer, "A");
  const oldUnit2 = sourceQuestions(legacySources[1]);
  assert.equal(oldUnit2.find(q => q.prompt.includes("there is a girl")).answer, "singing");
  assert.equal(oldUnit2.find(q => q.prompt.includes("thirsty")).grading, "reference");
  assert.equal(oldUnit2.find(q => q.prompt.includes("It rained all day")).options.length, 4, "multi-line C/D options must stay in the options, not the prompt");
  const oldUnit6 = sourceQuestions(legacySources[5]);
  const pickUp = oldUnit6.find(q => q.prompt.includes("Please ______. It"));
  assert.equal(pickUp.options[0].text, "pick it up; is good", "original repeated for and negative environmental claim corrected");
  const oldUnit7 = sourceQuestions(legacySources[6]);
  assert.equal(oldUnit7.find(q => q.prompt.includes("not much oil")).answer, "is");
  assert.equal(oldUnit7.find(q => q.prompt.includes("most of our energy")).answer, "我们的大部分能源");
  for (const id of legacySources) for (const q of sourceQuestions(id)) {
    assert.ok(q.options.every(o => !o.text.includes("____")), "alignment spaces are not blanks in options");
    assert.ok(!q.prompt.includes("______  ______"), "a single OOXML blank must not split into multiple fields");
    if (q.grading === "exact" && !q.options.length)
      assert.equal((q.prompt.match(/[_＿]{2,}/g) || []).length, q.accepted.length, `${q.id}: visible blanks match answer slots`);
  }
  for (const [id, expected, figures] of [["cd846e3d3d6f", 15, 7], ["370dbef9fd22", 13, 3]]) {
    const qs = sourceQuestions(id);
    assert.equal(qs.length, expected, "Every dictation sentence with a blank is interactive");
    const source = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources", `${id}.json`), "utf8"));
    const catalog = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/index.json"), "utf8"));
    assert.deepEqual(source.meta.units, [1]);
    assert.deepEqual(catalog.resources.find(r => r.id === id), source.meta);
    assert.equal(source.pages.flatMap(p => p.blocks).filter(b => b.kind === "image").length, figures);
    for (const block of source.pages.flatMap(p => p.blocks).filter(b => b.kind === "text"))
      assert.ok(!/ {2,}|themorning|theafternoon|Itwas|Firsthe/.test(block.text), "Dictation text has no PDF positioning spaces or merged words");
    for (const q of qs) {
      assert.equal(q.grading, "exact");
      assert.equal(q.keySource.resourceId, "4142293e2e55");
      assert.equal((q.prompt.match(/[_＿]{2,}/g) || []).length, q.accepted.length);
      const suffixes = q.accepted.map(a => a[1]);
      const pub = service.englishSixBankPublicPaper(privateLookup[q.id]).questions.find(p => p.id === q.id);
      assert.equal(service.englishSixBankGrade(q.id, lib.sixBankResponse(pub, suffixes)).correct, true, "Initial-letter suffix accepted");
    }
  }
  const cartoon = sourceQuestions("cd846e3d3d6f");
  const cartoonResource = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources/cd846e3d3d6f.json"), "utf8"));
  assert.deepEqual(cartoonResource.pages[1].blocks.filter(b => b.kind === "image").map(b => b.asset),
    ["3b59f3a9cd48f240081fe3bd9a753fef", "501f690381ba431fa2c9d46873bfaaa0", "ace39333cf83e8712a68d34e80bca97d", "b6bb041d598a056e1528d241bf32c4e1"],
    "Comic pictures follow the original scene order, not PDF object order");
  assert.equal(cartoon.find(q => q.prompt === "Bobby is s______ again!").answer, "singing", "Do not infer sleeping from the illustration");
  assert.equal(cartoon.find(q => q.prompt.includes("w______ d______")).answer, "why; don't; take; part");
  assert.ok(cartoon.find(q => q.prompt.includes("p______ s______ in the morning")).accepted[0].includes("practiced"));
  for (const [id, unit, expected, figures] of [
    ["330c16070797", 2, 14, 9], ["13e01fe16f01", 2, 13, 4],
    ["e8877e808c6b", 3, 14, 7], ["3ea65d6362c6", 3, 18, 2],
    ["8b1aeaaae914", 4, 15, 6], ["b2dd515ff21d", 4, 19, 4],
  ]) {
    const qs = sourceQuestions(id, unit);
    assert.equal(qs.length, expected);
    const resource = JSON.parse(readFileSync(path.join(appRoot, "content/english-six/resources", `${id}.json`), "utf8"));
    assert.deepEqual(resource.meta.units, [unit]);
    assert.equal(resource.pages.flatMap(p => p.blocks).filter(b => b.kind === "image").length, figures);
    for (const q of qs) {
      assert.equal(q.keySource.resourceId, "bd6cc1bc4a5d");
      assert.equal(q.grading, "exact");
      const gaps = [...q.prompt.matchAll(/(?:\b([A-Za-z]))?______/g)];
      assert.equal(gaps.length, q.accepted.length);
      const values = q.accepted.map((a, i) => gaps[i][1] ? a[1] : a[0]);
      const pub = service.englishSixBankPublicPaper(privateLookup[q.id]).questions.find(p => p.id === q.id);
      assert.equal(service.englishSixBankGrade(q.id, lib.sixBankResponse(pub, values)).correct, true);
      assert.ok(q.explanation.includes("课文原句："));
      if (q.accepted.length > 1)
        assert.equal(service.englishSixBankGrade(q.id, lib.sixBankResponse(pub, values.slice(1))), undefined);
    }
  }
  const story4 = sourceQuestions("b2dd515ff21d");
  assert.equal(story4.find(q => q.prompt.includes("g______ house")).answer, "went; grandparents'");
  assert.deepEqual(story4.find(q => q.prompt.startsWith("I can")).accepted, [["take"], ["care"], ["of"]]);
  const cartoon4 = sourceQuestions("8b1aeaaae914");
  assert.equal(cartoon4.find(q => q.prompt.startsWith("H______")).accepted.length, 4);
  assert.equal(cartoon4.find(q => q.prompt.startsWith("My b______")).answer, "birthday; next; can't; wait");
  const cartoon2 = sourceQuestions("330c16070797").filter(q => q.prompt === "No, I d______.");
  assert.equal(cartoon2.length, 2);
  assert.notEqual(cartoon2[0].sourceBlock, cartoon2[1].sourceBlock, "Repeated dialogue has distinct source anchors");
  assert.ok(sourceQuestions("e8877e808c6b").some(q => q.prompt === "H______ was school today?"));
  assert.equal(sourceQuestions("3ea65d6362c6").find(q => q.prompt.startsWith("People c______")).answer, "call; father");
  return { service, index, lib, count, graded, reference };
}
if (process.argv[1]?.endsWith("test-english-six-bank.mjs")) {
  const r = await verifySixBank();
  console.log(JSON.stringify({ questions: r.count, automaticallyGraded: r.graded, reference: r.reference, papers: r.index.papers.length, complete: false, checks: "pass" }));
}
