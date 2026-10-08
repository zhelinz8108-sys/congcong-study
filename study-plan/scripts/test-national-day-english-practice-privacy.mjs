/** Read-only privacy audit. Optional HTTP checks are restricted to local servers. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { appRoot, loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const options = process.argv.slice(2);
const scanBuild = options.includes("--build");
const baseOption = options.find((argument) => argument.startsWith("--base="));
const sourceRoot = path.resolve(appRoot, "src");
function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const filename = path.join(directory, entry);
    return statSync(filename).isDirectory() ? filesUnder(filename) : [filename];
  });
}
function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
function dependencies(filename) {
  const text = readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const bindings = node.importClause?.namedBindings;
      const onlyTypeSpecifiers = !node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((item) => item.isTypeOnly);
      if (!onlyTypeSpecifiers && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const onlyTypeSpecifiers = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((item) => item.isTypeOnly);
      if (!onlyTypeSpecifiers) imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const client = ast.statements.some((node) => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === "use client");
  return { client, imports };
}
function resolveLocal(filename, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const target = specifier.startsWith("@/") ? path.resolve(sourceRoot, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
  return [target, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"].map((extension) => `${target}${extension}`), ...["index.ts", "index.tsx", "index.js"].map((entry) => path.join(target, entry))]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

async function run() {
  const sourcePath = path.resolve(appRoot, "../tmp/pdfs/grammar-choice-cloze/content-reviewed.json");
  const sourceAvailable = existsSync(sourcePath) && !options.includes("--without-source");
  let source = sourceAvailable ? JSON.parse(readFileSync(sourcePath, "utf8")) : null;
  const publicPath = path.resolve(sourceRoot, "server/national-day-english-practice/questions.public.json");
  const publicText = readFileSync(publicPath, "utf8");
  const bank = JSON.parse(publicText);
  const manifest = JSON.parse(readFileSync(path.resolve(sourceRoot, "server/national-day-english-practice/manifest.public.json"), "utf8"));
  assert.equal(createHash("sha256").update(publicText.replaceAll("\r\n", "\n"), "utf8").digest("hex"), manifest.publicSha256, "Frozen public bank checksum changed.");
  assert.equal(bank.length, manifest.chapters);
  assert.equal(manifest.items, 2400);
  const encrypted = JSON.parse(readFileSync(path.resolve(sourceRoot, "server/national-day-english-practice/answers.encrypted.json"), "utf8"));
  if (!source) {
    // Fresh clones use the frozen manifest plus encrypted records; no private PDF files are required.
    const { englishPracticePrivateAnswer } = await loadHolidayTestModule("src/server/national-day-english-practice/private-bank.ts");
    source = bank.map((row) => {
      const blocks = row.blocks.map((block) => {
        const questions = block.questions.map((question) => {
          const key = englishPracticePrivateAnswer(question.id);
          ensure(Boolean(key), "Encrypted answer record missing.");
          ensure(question.options["ABCD".indexOf(key.correctOption)] === key.correctText, "Encrypted answer and public option differ.");
          return { id: question.id, seq: question.number, serial: question.serial, options: question.options,
            letter: key.correctOption, explanation: key.explanation };
        });
        return block.kind === "choice" ? { kind: block.kind, q: questions[0] } : { kind: block.kind, items: questions };
      });
      return { title: row.chapter.title, blocks, questions: blocks.flatMap((block) => block.kind === "choice" ? [block.q] : block.items) };
    });
  }
  const forbiddenKeys = new Set(["correct", "letter", "explanation", "correctOption", "correctText", "levels", "skill"]);
  function inspectPublic(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      ensure(!forbiddenKeys.has(key), "Private field found in public bank.");
      inspectPublic(child);
    }
  }
  inspectPublic(bank);
  assert.equal(bank.length, 24, "Public chapter count changed.");
  let sourceItems = 0;
  for (const [index, row] of bank.entries()) {
    const chapter = source[index];
    assert.equal(row.chapter.title, chapter.title, "Public chapter title changed.");
    const published = row.blocks.flatMap((block) => block.questions);
    const expected = chapter.blocks.flatMap((block) => block.kind === "choice" ? [block.q] : block.items);
    assert.equal(published.length, 100, "Public chapter scoring count changed.");
    for (const [questionIndex, question] of published.entries()) {
      const original = expected[questionIndex];
      const chapterId = `CH${String(index + 1).padStart(2, "0")}`;
      const number = questionIndex + 1;
      assert.equal(row.chapter.id, chapterId, "Public chapter ID changed.");
      assert.equal(question.id, `${chapterId}-Q${String(number).padStart(3, "0")}`, "Public fixed item ID changed.");
      assert.equal(question.number, number, "Public fixed chapter order changed.");
      assert.equal(question.serial, index * 100 + number, "Public fixed global serial changed.");
      assert.equal(question.id, original.id, "Public item ID changed.");
      assert.equal(question.number, original.seq, "Public item chapter order changed.");
      assert.equal(question.serial, original.serial, "Public global serial changed.");
      assert.deepEqual(question.options, original.options, "Public item option order changed.");
      sourceItems++;
    }
  }

  const sourceFiles = filesUnder(sourceRoot).filter((file) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(file));
  const dependencyCache = new Map(sourceFiles.map((file) => [file, dependencies(file)]));
  const clientRoots = sourceFiles.filter((file) => dependencyCache.get(file).client);
  const visited = new Set();
  function visitClient(filename) {
    if (visited.has(filename)) return;
    visited.add(filename);
    const relative = path.relative(sourceRoot, filename).replaceAll("\\", "/");
    ensure(!relative.startsWith("server/"), `Client graph imports server module: ${relative}`);
    ensure(!/answers\.(?:encrypted|private)\.json$/.test(relative), "Client graph imports answer data.");
    if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(filename)) return;
    const info = dependencyCache.get(filename) ?? dependencies(filename);
    for (const specifier of info.imports) {
      ensure(specifier !== "server-only", `Server-only boundary reached from a client: ${relative}`);
      const resolved = resolveLocal(filename, specifier);
      if (resolved) visitClient(resolved);
    }
  }
  clientRoots.forEach(visitClient);

  let scannedBundles = 0;
  let privateCanaries = 0;
  if (scanBuild) {
    ensure(existsSync(path.resolve(appRoot, ".next/BUILD_ID")), "A completed production build is required for --build.");
    const bundles = filesUnder(path.resolve(appRoot, ".next/static")).filter((file) => /\.(?:js|map)$/.test(file));
    ensure(bundles.length > 0, "No production client bundles found.");
    const secretValues = ["HOLIDAY_MATH_700_KEY", "FAMILY_ACCESS_SECRET", "FAMILY_ACCESS_PASSWORD"]
      .map((name) => process.env[name]?.trim()).filter((value) => value && value.length >= 8);
    const explanations = [...new Set(source.flatMap((chapter) => chapter.questions.map((question) => question.explanation)))]
      .filter((value) => typeof value === "string" && value.length >= 24 && !publicText.includes(value));
    const needles = [
      ...secretValues,
      encrypted.ciphertext.slice(0, 96),
      ...explanations,
    ].flatMap((value) => [value, JSON.stringify(value).slice(1, -1), [...value].map((letter) => letter.charCodeAt(0) > 127 ? `\\u${letter.charCodeAt(0).toString(16).padStart(4, "0")}` : letter).join("")]);
    privateCanaries = explanations.length;
    for (const bundle of bundles) {
      const text = readFileSync(bundle, "utf8");
      ensure(!needles.some((needle) => needle && text.includes(needle)), `Private content found in client bundle: ${path.basename(bundle)}`);
      scannedBundles++;
    }
  }

  let localApiChecks = 0;
  if (baseOption) {
    const base = new URL(baseOption.slice("--base=".length));
    ensure(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) && !base.username && !base.password, "HTTP audit is restricted to local servers.");
    ensure(Boolean(process.env.FAMILY_ACCESS_PASSWORD?.trim()), "Configured family access is required for authenticated HTTP audit.");
    const { createFamilyAccessToken, FAMILY_ACCESS_COOKIE } = await loadHolidayTestModule("src/lib/family-access.ts");
    const cookie = `${FAMILY_ACCESS_COOKIE}=${createFamilyAccessToken()}`;
    async function get(relative, status, authorized = true) {
      const response = await fetch(new URL(relative, base), { headers: authorized ? { Cookie: cookie } : {}, cache: "no-store" });
      ensure(response.status === status, `Unexpected local GET status (${response.status}; expected ${status}).`);
      const result = await response.json();
      // Unauthorized calls are intercepted by the existing global family proxy.
      if (authorized) ensure(/no-store/.test(response.headers.get("cache-control") ?? ""), "Local GET response is cacheable.");
      if (status === 200) inspectPublic(result);
      else inspectError(result);
      localApiChecks++;
      return result;
    }
    function inspectError(result) {
      ensure(result && Object.keys(result).length === 1 && typeof result.error === "string", "Invalid API error shape exposes unexpected fields.");
      ensure(!source.some((chapter) => chapter.questions.some((question) => result.error.includes(question.explanation))), "Invalid API response reveals an explanation.");
    }
    async function post(body, status, { origin, raw, authorized = true } = {}) {
      const response = await fetch(new URL("/api/english/holiday-2400/check", base), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authorized ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
        body: raw ?? JSON.stringify(body),
      });
      ensure(response.status === status, `Unexpected local POST status (${response.status}; expected ${status}).`);
      const result = await response.json();
      if (authorized) ensure(/no-store/.test(response.headers.get("cache-control") ?? ""), "Local POST response is cacheable.");
      if (status !== 200) inspectError(result);
      localApiChecks++;
      return result;
    }
    await get("/api/english/holiday-2400/questions?chapter=CH01", 401, false);
    const first = await get("/api/english/holiday-2400/questions?chapter=CH01&page=1", 200);
    ensure(first.blocks[0].questions[0].id === "CH01-Q001", "Local API item order changed.");
    await get("/api/english/holiday-2400/questions?chapter=CH24&page=10", 200);
    await get("/api/english/holiday-2400/questions?chapter=CH25", 404);
    await get("/api/english/holiday-2400/questions?chapter=CH01&page=0", 400);
    await get("/api/english/holiday-2400/questions?chapter=CH01&answers=1", 400);
    await get("/api/english/holiday-2400/questions?chapter=CH01&chapter=CH02", 400);
    const choice = source[0].blocks[0].q;
    const choiceBody = { block_id: "CH01-B001", answers: { [choice.id]: choice.letter } };
    await post(choiceBody, 401, { authorized: false });
    await post(choiceBody, 403, { origin: "https://example.invalid" });
    await post({ ...choiceBody, correct_answer: "A" }, 400);
    await post({ block_id: "CH01-B069", answers: {} }, 404);
    await post({ block_id: "CH01-B001", answers: {} }, 400);
    await post({ block_id: "CH01-B001", answers: { [choice.id]: "Z" } }, 400);
    await post({ block_id: "CH01-B001", answers: { ...choiceBody.answers, "CH01-Q002": "A" } }, 400);
    await post(null, 400, { raw: "{" });
    await post(null, 400, { raw: JSON.stringify({ ...choiceBody, padding: "x".repeat(17000) }) });
    const correct = await post(choiceBody, 200);
    ensure(correct.results.length === 1 && correct.results[0].correct && correct.score === 1, "Local choice grading failed.");
    const wrong = await post({ ...choiceBody, answers: { [choice.id]: "ABCD"[("ABCD".indexOf(choice.letter) + 1) % 4] } }, 200);
    ensure(wrong.score === 0 && !wrong.results[0].correct, "Local wrong-choice grading failed.");
    const passage = source[0].blocks[25];
    const clozeBody = { block_id: "CH01-B026", answers: Object.fromEntries(passage.items.map((question) => [question.id, question.letter])) };
    const missing = structuredClone(clozeBody);
    delete missing.answers[passage.items[0].id];
    await post(missing, 400);
    const complete = await post(clozeBody, 200);
    ensure(complete.results.length === 5 && complete.score === 5, "Local complete-cloze grading failed.");
    for (const question of passage.items) {
      const itemBody = { block_id: clozeBody.block_id, question_id: question.id, answers: { [question.id]: question.letter } };
      const single = await post(itemBody, 200);
      ensure(single.questionId === question.id && single.results.length === 1 && single.maxScore === 1 && single.score === 1, "Individual blank grading failed.");
      ensure(single.results[0].questionId === question.id, "Individual grading returned another blank.");
      ensure(!passage.items.filter((item) => item.id !== question.id).some((item) => JSON.stringify(single).includes(item.id)), "Unsubmitted blank feedback was revealed.");
      await post({ ...itemBody, answers: clozeBody.answers }, 400);
      await post({ ...itemBody, question_id: "CH02-Q026" }, 404);
    }
  }
  console.log(JSON.stringify({ result: "passed", frozenOrderedItems: sourceItems, reviewedSourceAvailable: sourceAvailable, chapters: bank.length, clientRoots: clientRoots.length, clientGraphModules: visited.size, scannedBundles, privateExplanationCanaries: privateCanaries, localApiChecks, progressWrites: 0 }));
}
run().catch((error) => {
  // Never print assertion diffs, request payloads, cookies, private strings or secrets.
  const safe = error instanceof Error && !error.message.includes("\n") && error.message.length < 180 && !/(?:data:|ciphertext|correctOption|explanation|password|secret)/i.test(error.message)
    ? error.message : "Privacy assertion failed; inspect the specific assertion locally.";
  console.error(safe);
  process.exitCode = 1;
});
