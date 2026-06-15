#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const limitArgIndex = process.argv.indexOf("--limit");
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1] ?? 0) : 0;

const moduleCache = new Map();

function fromRoot(...parts) {
  return path.join(ROOT, ...parts);
}

function resolveTsPath(relativePath) {
  const absolute = fromRoot(relativePath);
  if (fs.existsSync(absolute)) return absolute;
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    if (fs.existsSync(`${absolute}${ext}`)) return `${absolute}${ext}`;
  }
  throw new Error(`Cannot resolve ${relativePath}`);
}

function stubRequire(specifier) {
  if (specifier === "react") {
    return {
      useCallback: (fn) => fn,
      useDeferredValue: (value) => value,
      useEffect: () => undefined,
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [typeof value === "function" ? value() : value, () => undefined],
    };
  }
  if (specifier === "react/jsx-runtime") {
    return { Fragment: Symbol("Fragment"), jsx: () => null, jsxs: () => null };
  }
  if (specifier === "next/link" || specifier === "next/image") {
    return {};
  }
  if (specifier === "next/navigation") {
    return { useParams: () => ({ id: "audio-generation" }) };
  }
  return null;
}

function loadTsModule(relativePath, appendedSource = "") {
  const absolute = resolveTsPath(relativePath);
  if (moduleCache.has(absolute) && !appendedSource) {
    return moduleCache.get(absolute);
  }

  const source = `${fs.readFileSync(absolute, "utf8")}\n${appendedSource}`;
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolute,
  }).outputText;

  const sandboxModule = { exports: {} };
  const dirname = path.dirname(absolute);
  const localRequire = (specifier) => {
    const stub = stubRequire(specifier);
    if (stub) return stub;
    if (specifier.startsWith("@/")) {
      return loadTsModule(path.join("src", specifier.slice(2)));
    }
    if (specifier.startsWith(".")) {
      return loadTsModule(path.relative(ROOT, path.resolve(dirname, specifier)));
    }
    return require(specifier);
  };

  vm.runInNewContext(output, {
    console,
    exports: sandboxModule.exports,
    module: sandboxModule,
    require: localRequire,
    setTimeout,
    clearTimeout,
  }, { filename: absolute });

  if (!appendedSource) {
    moduleCache.set(absolute, sandboxModule.exports);
  }
  return sandboxModule.exports;
}

function toPublicPath(...parts) {
  return path.join("public", "generated-audio", ...parts).replace(/\\/g, "/");
}

function textFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((segment) => segment.text).filter(Boolean).join("。");
  }
  return String(payload ?? "");
}

function cleanText(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/[•·]/g, "，")
    .trim();
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function voiceForText(text) {
  return hasCjk(text) ? "zh-CN-XiaoxiaoNeural" : "en-US-JennyNeural";
}

const jobs = [];
const seenPaths = new Set();

function addJob({ id, outPath, text, voice, rate = "+0%" }) {
  const cleaned = cleanText(text);
  if (!cleaned || seenPaths.has(outPath)) return;
  seenPaths.add(outPath);
  jobs.push({ id, outPath, text: cleaned, voice, rate });
}

const mathLib = loadTsModule("src/lib/math-generated-practice");
const mathPageHelpers = loadTsModule(
  "src/app/subjects/[id]/math/generated-practice/page.tsx",
  `
module.exports.__audioHelpers = {
  buildUnitReviewSpeechSegments,
  buildSectionSpeechText,
  buildChecklistSpeechText
};
`
).__audioHelpers;

for (const unit of mathLib.MATH_GENERATED_UNITS) {
  const base = (name) => toPublicPath("math", `${unit.id}-${name}.mp3`);
  addJob({
    id: `${unit.id}-review-full`,
    outPath: base("review-full"),
    text: textFromPayload(mathPageHelpers.buildUnitReviewSpeechSegments(unit)),
    voice: "zh-CN-XiaoxiaoNeural",
  });
  addJob({
    id: `${unit.id}-review-overview`,
    outPath: base("review-overview"),
    text: `单元概览。${unit.review.overview}`,
    voice: "zh-CN-XiaoxiaoNeural",
  });
  addJob({
    id: `${unit.id}-review-knowledge-all`,
    outPath: base("review-knowledge-all"),
    text: [
      "核心知识点。",
      ...unit.review.knowledge.map((section) =>
        mathPageHelpers.buildSectionSpeechText("知识点", section)
      ),
    ].join(" "),
    voice: "zh-CN-XiaoxiaoNeural",
  });
  unit.review.knowledge.forEach((section, index) => {
    addJob({
      id: `${unit.id}-review-knowledge-${index + 1}`,
      outPath: base(`review-knowledge-${index + 1}`),
      text: mathPageHelpers.buildSectionSpeechText("知识点", section),
      voice: "zh-CN-XiaoxiaoNeural",
    });
  });
  addJob({
    id: `${unit.id}-review-strategies-all`,
    outPath: base("review-strategies-all"),
    text: [
      "解题思路。",
      ...unit.review.strategies.map((section) =>
        mathPageHelpers.buildSectionSpeechText("解题思路", section)
      ),
    ].join(" "),
    voice: "zh-CN-XiaoxiaoNeural",
  });
  unit.review.strategies.forEach((section, index) => {
    addJob({
      id: `${unit.id}-review-strategy-${index + 1}`,
      outPath: base(`review-strategy-${index + 1}`),
      text: mathPageHelpers.buildSectionSpeechText("解题思路", section),
      voice: "zh-CN-XiaoxiaoNeural",
    });
  });
  addJob({
    id: `${unit.id}-review-mistakes`,
    outPath: base("review-mistakes"),
    text: mathPageHelpers.buildChecklistSpeechText("易错提醒", unit.review.commonMistakes),
    voice: "zh-CN-XiaoxiaoNeural",
  });
  addJob({
    id: `${unit.id}-review-checklist`,
    outPath: base("review-checklist"),
    text: mathPageHelpers.buildChecklistSpeechText("做题前检查", unit.review.beforePractice),
    voice: "zh-CN-XiaoxiaoNeural",
  });
}

const grammarLib = loadTsModule("src/lib/english-grammar");
const grammarPageHelpers = loadTsModule(
  "src/app/subjects/[id]/grammar/page.tsx",
  `
module.exports.__audioHelpers = {
  PINNED_GRAMMAR_UNIT_IDS,
  buildLearningGuide,
  buildFormCards,
  buildPracticeCards,
  buildDisplayExamples,
  speakableEnglish
};
`
).__audioHelpers;
const grammarUnitsById = new Map(
  grammarLib.ENGLISH_GRAMMAR_CHAPTERS.flatMap((chapter) =>
    chapter.units.map((unit) => [unit.id, unit])
  )
);

for (const unitId of grammarPageHelpers.PINNED_GRAMMAR_UNIT_IDS) {
  const unit = grammarUnitsById.get(unitId);
  if (!unit) continue;
  const prefix = `unit-${String(unit.id).padStart(3, "0")}`;
  const out = (name) => toPublicPath("grammar", `${prefix}-${name}.mp3`);
  const learningGuide = grammarPageHelpers.buildLearningGuide(unit);

  addJob({
    id: `${prefix}-guide`,
    outPath: out("guide"),
    text: learningGuide.teacherScript,
    voice: "zh-CN-XiaoxiaoNeural",
  });
  unit.patterns.forEach((pattern, index) => {
    addJob({
      id: `${prefix}-pattern-${index + 1}`,
      outPath: out(`pattern-${index + 1}`),
      text: grammarPageHelpers.speakableEnglish(pattern),
      voice: "en-US-JennyNeural",
    });
  });
  grammarPageHelpers.buildFormCards(unit).forEach((formCard, index) => {
    const formText = grammarPageHelpers.speakableEnglish(formCard.value);
    addJob({
      id: `${prefix}-form-${index + 1}`,
      outPath: out(`form-${index + 1}`),
      text: formText,
      voice: voiceForText(formText),
    });
  });
  grammarPageHelpers.buildDisplayExamples(unit).forEach((example, index) => {
    addJob({
      id: `${prefix}-example-${index + 1}`,
      outPath: out(`example-${index + 1}`),
      text: example.english,
      voice: "en-US-JennyNeural",
    });
  });
  grammarPageHelpers.buildPracticeCards(unit).forEach((practiceCard, index) => {
    const practiceText = grammarPageHelpers.speakableEnglish(practiceCard.sample);
    addJob({
      id: `${prefix}-practice-${index + 1}`,
      outPath: out(`practice-${index + 1}`),
      text: practiceText,
      voice: voiceForText(practiceText),
    });
  });
}

const payloadPath = fromRoot(".tmp-audio-jobs.json");
const effectiveJobs = limit > 0 ? jobs.slice(0, limit) : jobs;
fs.writeFileSync(payloadPath, JSON.stringify({ jobs: effectiveJobs }, null, 2), "utf8");
console.log(`Prepared ${effectiveJobs.length} audio jobs.`);

if (dryRun) {
  console.log(`Job list written to ${path.relative(ROOT, payloadPath)}`);
  process.exit(0);
}

const python = process.env.PYTHON || "python";
const synthArgs = ["scripts/synthesize_audio_jobs.py", payloadPath];
if (force) synthArgs.push("--force");
const result = spawnSync(python, synthArgs, { cwd: ROOT, stdio: "inherit" });
process.exit(result.status ?? 1);
