import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const grader = await loadHolidayTestModule("src/lib/grade6-bank-grader.ts");
const { bankFinalResult, gradeBankFinalAnswers } = grader;
const key = (id = "q") => ({ id, answerText: "PRIVATE_TEACHER_ANALYSIS", answerImages: ["fixture.png"], answerStatus: "verified_native", reviewRequired: true, rules: [] });
const numeric = (id, expected, unit) => ({ id, expected: [expected], numeric: true, ...(unit ? { unit } : {}) });
const grade = (actual, expected = "0.5", unit) => gradeBankFinalAnswers(key(), { result: actual }, [numeric("result", expected, unit)]);

test("final numeric answers accept exact fraction/decimal equivalence in either direction", () => {
  for (const [actual, expected] of [["2/5", "0.4"], ["0.75", "3/4"], ["2/4", "0.5"], ["12.5%", "1/8"], ["2 1/2", "2.5"], ["½", "0.5"], ["-1/-2", "0.5"], ["-0又1/2", "-0.5"]]) {
    const result = grade(actual, expected);
    assert.equal(result.outcome, "correct", `${actual} equals ${expected}`);
    assert.equal(result.score, 1);
  }
  assert.equal(grade("1000000000000000000", "1000000000000000001").outcome, "incorrect", "a wrong final digit must not pass floating-point tolerance");
});

test("only the final result counts; wrong working cannot lose marks or earn marks", () => {
  assert.equal(grade("1+1=999\n最终答案：2/5", "0.4").outcome, "correct");
  assert.equal(grade("2÷5=0.4\n最终结果：0.5", "0.4").outcome, "incorrect");
  assert.equal(grade("过程写错了，答案：0.4", "0.4").outcome, "correct");
  assert.equal(grade("1+1=999=0.4", "0.4").outcome, "correct");
  assert.equal(grade("0.4只是中间值，最终答案：0.5", "0.4").outcome, "incorrect");
  assert.equal(bankFinalResult("最终答案：0.5\n验算：1=3"), "0.5", "later working cannot replace an explicitly marked final answer");
  assert.equal(grade("最终答案：0.5\n验算：1=3").outcome, "correct");
  assert.equal(bankFinalResult("答案：0.1\n最终答案：0.5\n答案：0.2"), "0.5", "the explicitly final answer has priority over ordinary answer labels");
  assert.equal(grade("最终答案：\n1/2").outcome, "correct", "a final-answer marker may precede a line break");
});

test("invalid fractions, uncertainty and wrong units are not accepted as correct results", () => {
  for (const actual of ["1/0", "0/0", "1/00", "1/-0", "1/2/3", "1/2abc", "约0.5", "≈0.5", "0.5±0.1", "0.5或0.6", "0.5;0.6"]) assert.equal(grade(actual).outcome, "incorrect", actual);
  assert.equal(grade("1/2米", "0.5", "米").outcome, "correct");
  assert.equal(grade("0.5厘米", "0.5", "米").outcome, "incorrect");
  assert.equal(grade("0.5千米", "0.5", "米").outcome, "incorrect");
  assert.equal(grade("0.5米", "0.5", "厘米").outcome, "incorrect");
  assert.equal(grade("0.5米").outcome, "incorrect", "an unexpected unit cannot be silently discarded");
});

test("multi-subquestion results are judged separately and work fields are ignored", () => {
  const rules = [numeric("a", "0.5"), numeric("b", "0.25")];
  const answers = { a: "错误过程\n答案：1/2", b: "1/4", work: "完全不同的过程" };
  const all = gradeBankFinalAnswers(key(), answers, rules);
  assert.equal(all.outcome, "correct"); assert.equal(all.score, 2); assert.equal(all.maxScore, 2);
  assert.deepEqual(all.fields, [{ id: "a", correct: true }, { id: "b", correct: true }]);
  const partial = gradeBankFinalAnswers(key(), { ...answers, b: "0.3" }, rules);
  assert.equal(partial.outcome, "incorrect"); assert.equal(partial.score, 1);
  assert.deepEqual(partial.fields, [{ id: "a", correct: true }, { id: "b", correct: false }]);
  assert.equal(gradeBankFinalAnswers(key(), { a: "0.5" }, rules).outcome, "incorrect", "an omitted result must not pass");
});

test("empty or invalid numeric rules can never produce a correct grade", () => {
  assert.throws(() => gradeBankFinalAnswers(key(), {}, []), /rules|规则|答案/i);
  for (const expected of [[], [""], [" "], ["1/0"], ["0/0"], ["invalid"]]) {
    let result;
    try { result = gradeBankFinalAnswers(key(), { result: expected[0] ?? "" }, [{ id: "result", expected, numeric: true }]); }
    catch { /* Invalid private rules may fail closed. */ }
    assert.notEqual(result?.outcome, "correct", JSON.stringify(expected));
  }
});

test("equality-sign choices remain literal choices rather than empty terminal equations", () => {
  const rules = [{ id: "relation", expected: ["="] }];
  assert.equal(bankFinalResult("="), "=");
  assert.equal(gradeBankFinalAnswers(key(), { relation: "＝" }, rules).outcome, "correct");
  for (const relation of ["答案：=", "最终答案：=", "最终结果：＝", "答案：\n="]) {
    assert.equal(bankFinalResult(relation), "=", relation);
    assert.equal(gradeBankFinalAnswers(key(), { relation }, rules).outcome, "correct", relation);
  }
  for (const relation of ["", "<", ">", "≠"]) assert.equal(gradeBankFinalAnswers(key(), { relation }, rules).outcome, "incorrect");
});

test("authored numeric values still accept equivalent fractions when numeric is false", () => {
  for (const [actual, expected] of [["3/4", "0.75"], ["0.75", "3/4"], ["6/8", "3/4"], ["25%", "0.25"]]) {
    assert.equal(gradeBankFinalAnswers(key(), { result: actual }, [{ id: "result", expected: [expected], numeric: false }]).outcome, "correct", `${actual} equals ${expected}`);
  }
  assert.equal(gradeBankFinalAnswers(key(), { result: "2/3" }, [{ id: "result", expected: ["0.75"], numeric: false }]).outcome, "incorrect");
});

test("only authored unit aliases accompany equivalent fractional values", () => {
  const rules = [{ id: "result", expected: ["0.75", "0.75米", "0.75m"], numeric: false }];
  for (const actual of ["3/4", "3/4米", "6/8m", "0.75（米）"]) {
    assert.equal(gradeBankFinalAnswers(key(), { result: actual }, rules).outcome, "correct", actual);
  }
  for (const actual of ["3/4厘米", "3/4千米", "3/4kg", "0.75米米"]) {
    assert.equal(gradeBankFinalAnswers(key(), { result: actual }, rules).outcome, "incorrect", actual);
  }
});

test("displayed numerator and denominator blanks are judged as one fraction", () => {
  const rules = [numeric("numerator", "1"), numeric("denominator", "4")];
  const pairs = [{ numeratorId: "numerator", denominatorId: "denominator" }];
  const score = (top, bottom) => gradeBankFinalAnswers(key(), { numerator: top, denominator: bottom }, rules, pairs);
  for (const [top, bottom] of [["1", "4"], ["2", "8"], ["-2", "-8"]]) {
    const result = score(top, bottom);
    assert.equal(result.outcome, "correct"); assert.equal(result.score, 2);
    assert.deepEqual(result.fields, [{ id: "numerator", correct: true }, { id: "denominator", correct: true }]);
  }
  for (const [top, bottom] of [["2", "0"], ["0", "0"], ["1", "0/1"], ["2", "4"], ["1/0", "4"]]) {
    const result = score(top, bottom);
    assert.equal(result.outcome, "incorrect", `${top}/${bottom}`); assert.equal(result.score, 0);
  }
});

test("numeric ratios accept proportional values and reject a zero ratio", () => {
  const rules = [{ id: "ratio", expected: ["1:3"] }];
  for (const ratio of ["2:6", "2∶6", "0.5:1.5", "1/2:3/2", "2比6"]) assert.equal(gradeBankFinalAnswers(key(), { ratio }, rules).outcome, "correct", ratio);
  for (const ratio of ["0:0", "0:3", "2:0", "2:7", "2:6:9", "1/0:3"]) assert.equal(gradeBankFinalAnswers(key(), { ratio }, rules).outcome, "incorrect", ratio);
});

test("compound final results require every ordered part and preserve per-part units", () => {
  const rules = [{ id: "results", expected: ["0.5；0.25"], resultParts: [{ expected: "0.5", unit: "米" }, { expected: "0.25", unit: "千克" }] }];
  const score = results => gradeBankFinalAnswers(key(), { results }, rules);
  for (const actual of ["1/2;1/4", "0.5；0.25", "1/2米;1/4千克", "过程：1+1=999\n最终结果：1/2米；1/4千克\n验算：错误过程", "最终结果：1/2;1/4\n过程：1+1=999", "最终答案：1/2米;1/4千克\n计算过程：1+1=999", "最终结果：1/2;1/4\n这段说明不参与判分", "最终结果：\n1/2\n1/4\n解题过程：1+1=999"]) {
    assert.equal(score(actual).outcome, "correct", actual);
  }
  for (const actual of ["1/2", "1/2;1/4;1/8", "1/4;1/2", "1/2厘米;1/4千克", "1/2;1/0", "1/2;0.3"]) assert.equal(score(actual).outcome, "incorrect", actual);
});

const compile = relative => ts.transpileModule(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function serverModule(relative, dependencies) {
  const record = { exports: {} };
  vm.runInNewContext(compile(relative), {
    module: record, exports: record.exports, Buffer,
    require: name => {
      if (name === "server-only") return {};
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected server dependency: ${name}`);
    },
  });
  return record.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const resultDescriptor = serverModule("src/server/grade6-bank/result-descriptor.ts", { "@/lib/grade6-bank-grader": grader });
const unmodifiedTeaching = { bankResultTeaching: async (_id, detailedSolution, answerText) => ({ detailedSolution, answerText }) };
const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
function harness() {
  const plans = new Map(), keys = new Map(), questions = new Map([["q", { id: "q" }]]), firstIds = [];
  const reads = { key: 0, first: 0, solution: 0, image: 0, progress: 0, response: 0 };
  const plan = { ready: true, resultInputIds: ["result"], optionalInputIds: ["work"], rules: [numeric("result", "0.5")] };
  plans.set("q", plan); keys.set("q", deepFreeze(key()));
  const original = deepFreeze({ answers: { result: "错误过程\n最终答案：1/2", work: "保留的原始过程" }, submitted: true, outcome: "review", score: null, maxScore: 0, submissions: 1, updatedAt: "2026-10-01T03:04:05.000Z", revision: 17 });
  const first = deepFreeze({ feedback: { feedback: { questionId: "q", outcome: "review", score: null, maxScore: 0, fields: [], message: "Original pending snapshot", answerText: "Original frozen teacher text", answerImages: [] }, response: original } });
  const solution = deepFreeze({ id: "q", thought: "完整思路", steps: [{ title: "第一步", content: "完整步骤一", fieldIds: ["result"] }, { title: "第二步", content: "完整步骤二", fieldIds: ["result"] }], answerSummary: "最终答案0.5", pitfalls: ["完整易错提示"] });
  const bank = {
    getBankResultPlan: async id => plans.get(id) ?? null,
    getPrivateBankAnswer: async id => { reads.key++; return keys.get(id) ?? null; },
    readBankImage: async () => { reads.image++; return { mime: "image/png", bytes: Buffer.from("isolated-image-fixture") }; },
    getArchivedBankQuestion: async id => questions.get(id),
  };
  const result = serverModule("src/server/grade6-bank/result-grading.ts", { "@/lib/grade6-bank-grader": grader, "./bank": bank, "./result-descriptor": resultDescriptor });
  const feedback = serverModule("src/server/grade6-bank/feedback.ts", {
    "./bank": bank, "@/lib/grade6-bank-grader": grader,
    "@/server/first-submission": { firstSubmission: async (_student, _exercise, id) => { reads.first++; firstIds.push(id); return first; } },
    "./progress": { bankIsIsolatedTestMemory: () => false },
    "./detailed-solution": { getBankDetailedSolution: async () => { reads.solution++; return solution; } },
    "./result-teaching": unmodifiedTeaching,
  });
  return { result, feedback, plans, keys, questions, firstIds, reads, original, first, solution, bank };
}

test("historic result projections update the displayed grade without rewriting original work or metadata", async () => {
  const h = harness(), before = JSON.stringify(h.original);
  const projected = await h.result.projectBankResult("q", h.original);
  assert.equal(projected.outcome, "correct"); assert.equal(projected.score, 1); assert.equal(projected.maxScore, 1);
  assert.equal(projected.answers, h.original.answers); assert.equal(projected.revision, 17); assert.equal(projected.updatedAt, h.original.updatedAt);
  assert.equal(JSON.stringify(h.original), before);
  const draft = deepFreeze({ ...plain(h.original), submitted: false, submissions: 0, outcome: null });
  assert.equal(await h.result.projectBankResult("q", draft), draft);
  const aggregate = deepFreeze({ ...plain(h.original), answers: { aggregate: "旧版聚合作答不可猜测拆分" } });
  assert.equal(await h.result.projectBankResult("q", aggregate), aggregate);
  assert.equal(await h.result.projectBankResult("no-plan", h.original), h.original);
  const progress = deepFreeze({ responses: { q: h.original, draft }, lastQuestionId: "q", updatedAt: "2026-10-01T03:04:05.000Z" });
  const view = await h.result.projectBankProgress(progress);
  assert.equal(view.responses.q.outcome, "correct"); assert.equal(view.responses.draft, draft);
  assert.equal(view.lastQuestionId, progress.lastQuestionId); assert.equal(view.updatedAt, progress.updatedAt);
  assert.equal(progress.responses.q.outcome, "review");
});

test("saved feedback overlays the original answer's current result and retains the complete solution", async () => {
  const h = harness(), before = JSON.stringify(h.first);
  const feedback = await h.feedback.savedBankFeedback("q", h.original, "fixture-learner");
  assert.equal(feedback.outcome, "correct"); assert.equal(feedback.score, 1);
  assert.equal(feedback.detailedSolution, h.solution); assert.equal(feedback.answerText, "PRIVATE_TEACHER_ANALYSIS");
  assert.equal(feedback.answerImages.length, 1); assert.ok(feedback.answerImages[0].startsWith("data:image/png;base64,"));
  assert.equal(JSON.stringify(h.first), before); assert.equal(h.original.outcome, "review");
  const pendingDraft = { ...plain(h.original), submitted: false, submissions: 0 };
  const privateReads = h.reads.key;
  await assert.rejects(h.feedback.savedBankFeedback("q", pendingDraft, "fixture-learner"), /尚未提交/);
  assert.equal(h.reads.key, privateReads, "drafts cannot read a private answer");
  h.plans.clear();
  const historic = await h.feedback.savedBankFeedback("q", h.original, "fixture-learner");
  assert.equal(historic.outcome, "review"); assert.equal(historic.score, null, "a record without a ready result plan retains its historic score");
});

test("a formerly missing grade that now has a verified result also gets the full current explanation", async () => {
  const h = harness();
  const missing = deepFreeze({ ...plain(h.original), outcome: "missing" });
  const feedback = await h.feedback.savedBankFeedback("q", missing, "fixture-learner");
  assert.equal(feedback.outcome, "correct"); assert.equal(feedback.detailedSolution, h.solution);
  assert.equal(feedback.answerText, "PRIVATE_TEACHER_ANALYSIS"); assert.equal(feedback.answerImages.length, 1);
  assert.equal(missing.outcome, "missing", "the stored outcome is never rewritten");
});

test("closed assessment teaching adds its conclusion while retaining every original solution step", async () => {
  const h = harness(), originalJson = JSON.stringify(h.solution);
  const teaching = serverModule("src/server/grade6-bank/result-teaching.ts", {
    "./bank": { getBankResultPlan: async () => ({ ready: true, assessment: "closed-v1", rules: [{ id: "result-choice", expected: ["B"] }] }) },
    "./result-descriptors": { getBankResultDescriptor: () => ({ closed: { options: ["一个备选结论", "本题客观结论", "另一个备选结论", "最后一个备选结论"] } }) },
  });
  const decorated = await teaching.bankResultTeaching("q", h.solution, "完整原题教师解析");
  assert.equal(decorated.detailedSolution.steps.length, h.solution.steps.length + 1);
  assert.deepEqual(plain(decorated.detailedSolution.steps.slice(1)), plain(h.solution.steps));
  assert.match(decorated.detailedSolution.steps[0].content, /正确选项：B。本题客观结论/);
  assert.match(decorated.detailedSolution.answerSummary, /原题参考结论：最终答案0.5/);
  assert.match(decorated.answerText, /^正确选项：B。本题客观结论\n\n完整原题教师解析$/);
  assert.equal(decorated.detailedSolution.thought, h.solution.thought);
  assert.deepEqual(decorated.detailedSolution.pitfalls, h.solution.pitfalls);
  assert.equal(JSON.stringify(h.solution), originalJson, "private authored teaching remains immutable");
});

test("progress and feedback GET endpoints agree on derived grades and never expose private keys through progress", async () => {
  const h = harness();
  const frozenProgress = deepFreeze({ responses: { q: h.original }, lastQuestionId: "q", updatedAt: h.original.updatedAt });
  let denied = false;
  const http = {
    bankAccess: () => denied ? { status: 401 } : null,
    bankHeaders: { "Cache-Control": "no-store" }, bankProfile: () => ({ id: "fixture-learner" }), bankSubject: value => value,
    bankFailure: error => { throw error; },
  };
  const progress = {
    bankIsIsolatedTestMemory: () => false,
    bankProgress: async () => { h.reads.progress++; return frozenProgress; },
    bankResponse: async () => { h.reads.response++; return h.original; },
  };
  const response = { NextResponse: { json: (body, options = {}) => ({ body, ...options, status: options.status ?? 200 }) } };
  const dependencies = {
    "next/server": response, "@/server/grade6-bank/http": http, "@/server/grade6-bank/progress": progress,
    "@/server/grade6-bank/result-grading": h.result, "@/server/grade6-bank/bank": h.bank, "@/server/grade6-bank/feedback": h.feedback,
  };
  const progressRoute = serverModule("src/app/api/math/grade6-bank/progress/route.ts", dependencies);
  const feedbackRoute = serverModule("src/app/api/math/grade6-bank/feedback/route.ts", dependencies);
  const request = { nextUrl: new URL("http://127.0.0.1/api?subject_id=fixture-subject&question_id=q") };
  const view = await progressRoute.GET(request), detail = await feedbackRoute.GET(request);
  assert.equal(view.status, 200); assert.equal(view.body.responses.q.outcome, "correct");
  assert.equal(detail.status, 200); assert.equal(detail.body.response.outcome, "correct"); assert.equal(detail.body.feedback.outcome, "correct");
  assert.equal(detail.body.feedback.detailedSolution, h.solution);
  assert.ok(!JSON.stringify(view.body).includes("PRIVATE_TEACHER_ANALYSIS"));
  assert.ok(!JSON.stringify(view.body).includes("rules"));
  assert.equal(h.original.outcome, "review"); assert.equal(h.original.revision, 17);
  denied = true;
  const reads = { ...h.reads };
  assert.equal((await progressRoute.GET(request)).status, 401); assert.equal((await feedbackRoute.GET(request)).status, 401);
  assert.deepEqual(h.reads, reads, "authorization runs before student/private lookups");
});

test("closed question progress retains original work and starts an independent version at revision zero", async () => {
  const h = harness();
  const question = { id: "q", resultAssessment: "closed-v1", inputs: [{ id: "result-choice", kind: "choice", choices: ["A", "B", "C", "D"] }] };
  h.questions.set("q", question);
  h.plans.set("q", { ready: true, assessment: "closed-v1", resultInputIds: ["result-choice"], optionalInputIds: [], rules: [{ id: "result-choice", expected: ["B"] }] });
  const originalJson = JSON.stringify(h.original);
  const source = deepFreeze({ responses: { q: h.original }, lastQuestionId: "q", updatedAt: h.original.updatedAt });
  const fresh = await h.result.projectBankProgress(source);
  const current = fresh.responses.q;
  assert.equal(current.revision, 0); assert.equal(current.submitted, false); assert.equal(current.submissions, 0);
  assert.deepEqual(plain(current.answers), {}); assert.equal(current.outcome, null); assert.equal(current.score, null);
  assert.equal(current.previousSubmission.answers, h.original.answers); assert.equal(current.previousSubmission.outcome, "review");
  assert.equal(current.previousSubmission.updatedAt, h.original.updatedAt); assert.equal(current.previousSubmission.submitted, true);
  assert.equal(JSON.stringify(h.original), originalJson); assert.equal(source.responses.q, h.original);
  assert.equal(h.result.bankResultStorageId(question), "q--result-v1");
  assert.equal(h.result.bankResultStorageId({ id: "q" }), "q");

  const draft = deepFreeze({ answers: { "result-choice": "A" }, submitted: false, outcome: null, score: null, maxScore: 0, submissions: 0, revision: 1, updatedAt: "2026-10-02T00:00:00.000Z" });
  const withDraft = deepFreeze({ ...plain(source), responses: { q: h.original, "q--result-v1": draft }, lastQuestionId: "q--result-v1" });
  const draftView = await h.result.projectBankProgress(withDraft);
  assert.deepEqual(plain(draftView.responses.q.answers), { "result-choice": "A" });
  assert.equal(draftView.responses.q.revision, 1); assert.equal(draftView.responses.q.submitted, false);
  assert.equal(draftView.responses.q.previousSubmission.answers, h.original.answers);
  assert.equal(draftView.lastQuestionId, "q");
  assert.deepEqual(Object.keys(draftView.responses), ["q"], "internal version keys never duplicate the visible exercise");

  const submitted = deepFreeze({ ...plain(draft), submitted: true, submissions: 1, answers: { "result-choice": "B" }, revision: 2, outcome: "review" });
  const submittedSource = deepFreeze({ ...plain(withDraft), responses: { q: h.original, "q--result-v1": submitted } });
  const submittedView = await h.result.projectBankProgress(submittedSource);
  assert.equal(submittedView.responses.q.outcome, "correct"); assert.equal(submittedView.responses.q.score, 1);
  assert.equal(submittedView.responses.q.answers, submitted.answers); assert.equal(submittedView.responses.q.revision, 2);
  assert.equal(submittedView.responses.q.previousSubmission.answers, h.original.answers);
  assert.equal(submittedSource.responses.q, h.original); assert.equal(submittedSource.responses["q--result-v1"].outcome, "review");
  await h.feedback.savedBankFeedback("q", submitted, "fixture-learner");
  assert.equal(h.firstIds.at(-1), "q--result-v1", "the original immutable first-submission snapshot must not grade the new assessment");
});

test("draft and submit endpoints save the closed version without overwriting an original submission", async () => {
  for (const operation of ["draft", "submit"]) {
    const h = harness(), originalJson = JSON.stringify(h.original);
    const question = { id: "q", resultAssessment: "closed-v1", inputs: [{ id: "result-choice", kind: "choice", choices: ["A", "B", "C", "D"] }] };
    h.questions.set("q", question);
    h.plans.set("q", { ready: true, assessment: "closed-v1", resultInputIds: ["result-choice"], optionalInputIds: [], rules: [{ id: "result-choice", expected: ["B"] }] });
    const records = new Map([["q", h.original]]), saves = [];
    class IsolatedConflict extends Error { constructor(response) { super("Revision conflict"); this.response = response; } }
    const storage = {
      bankBaseRevision: value => value, BankRevisionConflict: IsolatedConflict,
      bankResponse: async (_student, _subject, id) => records.get(id),
      saveBankResponse: async (student, subject, id, answers, revision, feedback) => {
        saves.push({ student, subject, id, revision, feedback });
        const old = records.get(id);
        if (revision !== (old?.revision ?? 0)) throw new IsolatedConflict(old);
        const response = deepFreeze({ answers: plain(answers), submitted: !!feedback, outcome: feedback?.outcome ?? null, score: feedback?.score ?? null, maxScore: feedback?.maxScore ?? 0, submissions: feedback ? 1 : 0, revision: revision + 1, updatedAt: "2026-10-02T00:00:00.000Z" });
        records.set(id, response); return response;
      },
    };
    const response = { NextResponse: { json: (body, options = {}) => ({ body, ...options, status: options.status ?? 200 }) } };
    const http = {
      bankAccess: () => null, bankBody: async () => ({ subject_id: "fixture-subject", question_id: "q", answers: { "result-choice": "B" }, base_revision: 0, input_schema: "closed-fixture" }),
      bankFailure: error => { throw error; }, bankHeaders: { "Cache-Control": "no-store" }, bankRetired: () => null,
      bankInputSchema: (_schema, q) => assert.equal(q.resultAssessment, "closed-v1"), bankProfile: () => ({ id: "fixture-learner" }), bankSubject: value => value,
      bankStudentAnswers: value => value,
    };
    const dependencies = {
      "next/server": response, "@/server/grade6-bank/http": http, "@/server/grade6-bank/progress": storage,
      "@/server/grade6-bank/result-grading": h.result,
      "@/server/grade6-bank/bank": { ...h.bank, getBankQuestion: async () => question },
      "@/server/grade6-bank/detailed-solution": { getBankDetailedSolution: async () => h.solution },
      "@/server/grade6-bank/result-teaching": unmodifiedTeaching,
    };
    const route = serverModule(`src/app/api/math/grade6-bank/${operation}/route.ts`, dependencies);
    const accepted = await route[operation === "draft" ? "PUT" : "POST"]({});
    assert.equal(accepted.status, 200); assert.equal(saves.length, 1);
    assert.equal(saves[0].id, "q--result-v1"); assert.equal(saves[0].revision, 0, "the original revision 17 must not affect the new assessment");
    assert.equal(records.get("q"), h.original); assert.equal(JSON.stringify(h.original), originalJson);
    assert.equal(records.get("q--result-v1").revision, 1);
    assert.deepEqual(plain(records.get("q--result-v1").answers), { "result-choice": "B" });
    if (operation === "submit") {
      assert.equal(accepted.body.response.previousSubmission.answers, h.original.answers);
      assert.equal(accepted.body.response.previousSubmission.outcome, "review");
      assert.equal(accepted.body.feedback.outcome, "correct"); assert.equal(accepted.body.feedback.detailedSolution, h.solution);
      assert.equal(saves[0].feedback.detailedSolution, undefined, "teaching content stays outside the immutable grade snapshot");
    } else {
      assert.equal(accepted.body.submitted, false); assert.equal(saves[0].feedback, undefined);
    }
  }
});
