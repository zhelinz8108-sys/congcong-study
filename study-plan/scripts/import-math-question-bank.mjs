import AdmZip from "adm-zip";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

await loadEnvLocal(path.join(projectRoot, ".env.local"));

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const reset = args.has("--reset");
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourceRoot = path.resolve(
  sourceArg ? sourceArg.slice("--source=".length) : path.join(projectRoot, "..", "数学")
);
const reportDir = path.join(projectRoot, ".tmp-math-import");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "study_plan",
  user: process.env.PGUSER ?? "study_plan",
  password: process.env.PGPASSWORD,
});

const ANSWER_NAME_TOKENS = [
  "答案解析",
  "答案与解析",
  "参考答案",
  "解析版",
  "答案版",
  "含答案",
  "含解析",
  "答案",
  "解析",
];

const STUDENT_VERSION_TOKENS = ["原卷版", "A4版", "A3版", "答题卡"];
const QUESTION_EXTENSIONS = new Set([".docx", ".pdf", ".doc"]);

function loadEnvLocal(filename) {
  return fs
    .readFile(filename, "utf8")
    .then((raw) => {
      for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    })
    .catch(() => undefined);
}

function hashId(prefix, value) {
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`;
}

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

function getTopCategory(relativePath) {
  return relativePath.split(/[\\/]/)[0] ?? "";
}

function detectUnitLabel(value) {
  const normalized = value.replace(/\s+/g, "");
  const unit = normalized.match(/第[一二三四五六七八九十0-9]+[单章]/)?.[0];
  if (unit) return unit.replace("章", "单元");
  if (normalized.includes("期中")) return "期中";
  if (normalized.includes("期末")) return "期末";
  if (normalized.includes("月考")) return "月考";
  if (normalized.includes("专项")) return "专项";
  return "";
}

function isAnswerFile(filename) {
  if (filename.includes("答题卡")) return false;
  return ANSWER_NAME_TOKENS.some((token) => filename.includes(token));
}

function isStudentFile(filename) {
  if (filename.includes("答题卡")) return false;
  return !isAnswerFile(filename);
}

function normalizeSetTitle(filename) {
  let title = path.parse(filename).name;
  for (const token of [...ANSWER_NAME_TOKENS, ...STUDENT_VERSION_TOKENS]) {
    title = title.replaceAll(token, "");
  }
  title = title.replace(/[（(]\s*[）)]/g, "");
  title = title.replace(/[（(][^）)]*(苏教版|Word版|word版)[^）)]*[）)]/g, "");
  title = title.replace(/[\s\-—_（）()]+/g, "");
  return title || path.parse(filename).name;
}

function cleanText(value) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxText(filename) {
  const zip = new AdmZip(filename);
  const entries = zip
    .getEntries()
    .filter((entry) =>
      /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(
        entry.entryName
      )
    );
  const paragraphs = [];

  for (const entry of entries) {
    const xml = entry.getData().toString("utf8");
    const paragraphMatches = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
    for (const paragraph of paragraphMatches) {
      const pieces = [];
      const tokenMatches =
        paragraph.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? [];
      for (const token of tokenMatches) {
        if (token.startsWith("<w:tab")) pieces.push("\t");
        else if (token.startsWith("<w:br")) pieces.push("\n");
        else {
          const text = token.replace(/^<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>$/, "");
          pieces.push(decodeXmlEntities(text));
        }
      }
      const line = pieces.join("").trim();
      if (line) paragraphs.push(line);
    }
  }

  return cleanText(paragraphs.join("\n"));
}

async function extractPdfFileText(filename) {
  const buffer = await fs.readFile(filename);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractPdfText(pdf, { mergePages: true });
  return cleanText(result.text ?? "");
}

async function extractFileText(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".docx") return extractDocxText(filename);
  if (ext === ".pdf") return extractPdfFileText(filename);
  return "";
}

function splitAnswerSection(text) {
  const patterns = [
    /答案解析部分/,
    /参考答案与解析/,
    /答案与解析/,
    /参考答案/,
    /期中检测答案/,
    /期末检测答案/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.index && match.index > 200) {
      return {
        questionText: text.slice(0, match.index).trim(),
        answerText: text.slice(match.index).trim(),
      };
    }
  }

  return { questionText: text, answerText: "" };
}

function parseNumberedBlocks(text) {
  const blocks = [];
  const matches = [...text.matchAll(/(?:^|\n)\s*(\d{1,2})[．.、]\s*/g)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? text.length;
    const raw = text.slice(start, nextStart).trim();
    if (!raw || raw.length < 4) continue;
    blocks.push({
      number: match[1],
      text: cleanText(raw.replace(/^\s*\d{1,2}[．.、]\s*/, "")),
    });
  }
  return blocks;
}

function extractOptions(prompt) {
  const matches = [...prompt.matchAll(/([A-F])[．.、]\s*/g)];
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? prompt.length;
    return {
      key: match[1],
      text: cleanText(prompt.slice(start, end)).slice(0, 240),
    };
  });
}

function detectQuestionType(prompt, options) {
  if (options.length >= 2) return "choice";
  if (/[√×]|判断|对错|正确|错误/.test(prompt) && prompt.length < 180) return "true_false";
  if (/[（(]\s*[）)]|_{2,}|填一填|填空|括号里填/.test(prompt)) return "fill_blank";
  if (/计算|解方程|求出|化简|脱式/.test(prompt) && prompt.length < 240) return "calculation";
  if (/作图|解决问题|列方程|统计图|为什么|请你|画图|求/.test(prompt)) return "subjective";
  return "subjective";
}

function firstMeaningfulLine(section) {
  return section
    .split(/\n+/)
    .map((line) => cleanText(line).replace(/^答案[:：]?\s*/, "").trim())
    .find((line) => line && !/^[一二三四五六七八九十]+[．.、]/.test(line)) ?? "";
}

function extractAnswerValue(section) {
  const firstLine = firstMeaningfulLine(section);
  const directChoice = firstLine.match(/^([A-F√×])(?:\s|$|[，,；;、.．。])/);
  if (directChoice) return directChoice[1];
  if (firstLine && firstLine.length <= 120 && !/[（）()]/.test(firstLine)) {
    return firstLine.slice(0, 300);
  }

  const patterns = [
    /故答案为[:：]?\s*([^。\n]+)/,
    /答案[:：]\s*([^。\n]+)/,
    /【答案】\s*([^【\n]+)/,
    /解[:：]\s*([^。\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = section.match(pattern);
    if (match?.[1]) return cleanText(match[1]).slice(0, 300);
  }

  const short = section.replace(/【分析】[\s\S]*$/g, "").trim();
  if (short.length <= 80) return short;
  const choice = section.match(/(?:^|\s)([A-F√×])(?:\s|$|。)/);
  return choice?.[1] ?? "";
}

function isUsefulAnswerValue(value) {
  const normalized = cleanText(value)
    .replace(/[答案答解：:。.，,、；;\s]/g, "")
    .trim();
  return normalized.length > 0 && !/[（）()]/.test(normalized);
}

function parseAnswerMap(answerText) {
  const map = new Map();
  for (const block of parseNumberedBlocks(answerText)) {
    const answer = extractAnswerValue(block.text);
    if (answer && isUsefulAnswerValue(answer)) {
      const existing = map.get(block.number);
      if (existing && isUsefulAnswerValue(existing.raw)) continue;
      map.set(block.number, {
        raw: answer,
        answers: [answer],
        section: block.text,
      });
    }
  }
  return map;
}

function buildQuestionRecords(setId, sourceText, answerText) {
  const blocks = parseNumberedBlocks(sourceText);
  const answerMap = parseAnswerMap(answerText);

  if (blocks.length === 0) {
    return [
      {
        id: hashId("mq", `${setId}:source-only`),
        question_number: "1",
        question_order: 1,
        question_type: "source_only",
        prompt: sourceText.slice(0, 4000) || "此资料暂未解析出独立题目，请查看原始文件。",
        options: [],
        correct_answer: {},
        explanation: answerText.slice(0, 4000),
        score: 0,
        source_anchor: "source-only",
        source_excerpt: sourceText.slice(0, 600),
        render_mode: "source",
        review_status: "source_only",
        auto_grade: false,
      },
    ];
  }

  return blocks.map((block, index) => {
    const options = extractOptions(block.text);
    const questionType = detectQuestionType(block.text, options);
    const answer = answerMap.get(block.number);
    const autoGrade =
      Boolean(answer?.answers?.length) &&
      ["choice", "true_false", "fill_blank", "calculation"].includes(questionType);
    const reviewStatus = answer ? "ready" : "needs_review";

    return {
      id: hashId("mq", `${setId}:${block.number}:${block.text.slice(0, 120)}`),
      question_number: block.number,
      question_order: index + 1,
      question_type: questionType,
      prompt: block.text,
      options,
      correct_answer: answer ? { raw: answer.raw, answers: answer.answers } : {},
      explanation: answer?.section ?? "",
      score: 1,
      source_anchor: `question-${block.number}`,
      source_excerpt: block.text.slice(0, 600),
      render_mode: "structured",
      review_status: reviewStatus,
      auto_grade: autoGrade,
    };
  });
}

async function walkFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(fullPath)));
    else if (QUESTION_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

function groupFiles(files) {
  const groups = new Map();
  for (const fullPath of files) {
    const relative = normalizeSlashes(path.relative(sourceRoot, fullPath));
    const parent = normalizeSlashes(path.dirname(relative));
    const key = `${parent}::${normalizeSetTitle(path.basename(fullPath))}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        parent,
        title: normalizeSetTitle(path.basename(fullPath)),
        files: [],
      });
    }
    groups.get(key).files.push({ fullPath, relative, name: path.basename(fullPath) });
  }
  return [...groups.values()];
}

function selectSourceFile(files) {
  const sourceFiles = files.filter((file) => isStudentFile(file.name));
  const pool = sourceFiles.length ? sourceFiles : files;
  return (
    pool.find((file) => file.name.includes("A4版")) ??
    pool.find((file) => file.name.includes("原卷版")) ??
    pool.find((file) => path.extname(file.name).toLowerCase() === ".docx") ??
    pool[0]
  );
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS math_question_sets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      grade TEXT NOT NULL DEFAULT '五年级',
      semester TEXT NOT NULL DEFAULT '下册',
      subject TEXT NOT NULL DEFAULT '数学',
      category TEXT NOT NULL DEFAULT '',
      unit_label TEXT NOT NULL DEFAULT '',
      source_root TEXT NOT NULL DEFAULT '',
      source_dir TEXT NOT NULL DEFAULT '',
      source_files JSONB NOT NULL DEFAULT '[]'::jsonb,
      answer_files JSONB NOT NULL DEFAULT '[]'::jsonb,
      import_status TEXT NOT NULL DEFAULT 'pending',
      question_count INTEGER NOT NULL DEFAULT 0,
      ready_count INTEGER NOT NULL DEFAULT 0,
      needs_review_count INTEGER NOT NULL DEFAULT 0,
      source_only_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS math_questions (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES math_question_sets(id) ON DELETE CASCADE,
      question_number TEXT NOT NULL DEFAULT '',
      question_order INTEGER NOT NULL DEFAULT 0,
      question_type TEXT NOT NULL DEFAULT 'subjective',
      prompt TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_answer JSONB NOT NULL DEFAULT '{}'::jsonb,
      explanation TEXT NOT NULL DEFAULT '',
      score REAL NOT NULL DEFAULT 1,
      source_anchor TEXT NOT NULL DEFAULT '',
      source_excerpt TEXT NOT NULL DEFAULT '',
      render_mode TEXT NOT NULL DEFAULT 'structured',
      review_status TEXT NOT NULL DEFAULT 'needs_review',
      auto_grade BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS math_attempts (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES math_question_sets(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL DEFAULT 'congcong',
      student_name TEXT NOT NULL DEFAULT '聪聪',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      total_score REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress'
    );
    CREATE TABLE IF NOT EXISTS math_responses (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL REFERENCES math_attempts(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES math_questions(id) ON DELETE CASCADE,
      response_text TEXT NOT NULL DEFAULT '',
      self_rating TEXT,
      is_correct BOOLEAN NOT NULL DEFAULT false,
      grading_status TEXT NOT NULL DEFAULT 'self_review',
      score REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 0,
      feedback TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (attempt_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS math_import_logs (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      set_id TEXT,
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_math_question_sets_category ON math_question_sets(category);
    CREATE INDEX IF NOT EXISTS idx_math_question_sets_unit ON math_question_sets(unit_label);
    CREATE INDEX IF NOT EXISTS idx_math_questions_set_order ON math_questions(set_id, question_order);
    CREATE INDEX IF NOT EXISTS idx_math_attempts_set_student ON math_attempts(set_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_math_responses_attempt ON math_responses(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_math_responses_mistakes ON math_responses(question_id, is_correct);
  `);
}

async function importSet(group) {
  const setId = hashId("mqset", group.key);
  const category = getTopCategory(group.parent);
  const answerFiles = group.files.filter((file) => isAnswerFile(file.name));
  const sourceFile = selectSourceFile(group.files);
  const sourceFiles = group.files.filter((file) => isStudentFile(file.name));
  let sourceText = "";
  let answerText = "";
  const logs = [];

  try {
    if (sourceFile && path.extname(sourceFile.name).toLowerCase() !== ".doc") {
      const fullText = await extractFileText(sourceFile.fullPath);
      const split = splitAnswerSection(fullText);
      sourceText = split.questionText;
      answerText = split.answerText;
    } else {
      sourceText = "旧版 DOC 资料已登记，第一版不做强制结构化解析。";
    }

    for (const file of answerFiles) {
      if (sourceFile && path.resolve(file.fullPath) === path.resolve(sourceFile.fullPath)) continue;
      if (path.extname(file.name).toLowerCase() === ".doc") continue;
      const text = await extractFileText(file.fullPath);
      answerText += `\n\n${text}`;
    }
  } catch (error) {
    logs.push({
      id: hashId("milog", `${setId}:extract-error`),
      source_file: sourceFile?.relative ?? group.parent,
      set_id: setId,
      status: "error",
      message: error instanceof Error ? error.message : "extract failed",
      details: { files: group.files.map((file) => file.relative) },
    });
  }

  const questions = buildQuestionRecords(setId, sourceText, answerText);
  const readyCount = questions.filter((question) => question.review_status === "ready").length;
  const sourceOnlyCount = questions.filter((question) => question.review_status === "source_only").length;
  const needsReviewCount = questions.filter((question) => question.review_status === "needs_review").length;

  const set = {
    id: setId,
    title: group.title,
    grade: "五年级",
    semester: "下册",
    subject: "数学",
    category,
    unit_label: detectUnitLabel(`${group.parent} ${group.title}`),
    source_root: sourceRoot,
    source_dir: group.parent,
    source_files: sourceFiles.length ? sourceFiles.map((file) => file.relative) : group.files.map((file) => file.relative),
    answer_files: answerFiles.map((file) => file.relative),
    import_status: needsReviewCount > 0 ? "needs_review" : "ready",
    question_count: questions.length,
    ready_count: readyCount,
    needs_review_count: needsReviewCount,
    source_only_count: sourceOnlyCount,
  };

  logs.push({
    id: hashId("milog", `${setId}:summary:${questions.length}:${readyCount}`),
    source_file: sourceFile?.relative ?? group.parent,
    set_id: setId,
    status: set.import_status,
    message: `Imported ${questions.length} questions; ${readyCount} ready; ${needsReviewCount} need review.`,
    details: {
      answerFiles: answerFiles.map((file) => file.relative),
      sourceFiles: set.source_files,
    },
  });

  return { set, questions, logs };
}

async function writeSet({ set, questions, logs }) {
  await pool.query(
    `
      INSERT INTO math_question_sets (
        id, title, grade, semester, subject, category, unit_label, source_root,
        source_dir, source_files, answer_files, import_status, question_count,
        ready_count, needs_review_count, source_only_count, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        unit_label = EXCLUDED.unit_label,
        source_root = EXCLUDED.source_root,
        source_dir = EXCLUDED.source_dir,
        source_files = EXCLUDED.source_files,
        answer_files = EXCLUDED.answer_files,
        import_status = EXCLUDED.import_status,
        question_count = EXCLUDED.question_count,
        ready_count = EXCLUDED.ready_count,
        needs_review_count = EXCLUDED.needs_review_count,
        source_only_count = EXCLUDED.source_only_count,
        updated_at = NOW()
    `,
    [
      set.id,
      set.title,
      set.grade,
      set.semester,
      set.subject,
      set.category,
      set.unit_label,
      set.source_root,
      set.source_dir,
      JSON.stringify(set.source_files),
      JSON.stringify(set.answer_files),
      set.import_status,
      set.question_count,
      set.ready_count,
      set.needs_review_count,
      set.source_only_count,
    ]
  );

  await pool.query("DELETE FROM math_questions WHERE set_id = $1", [set.id]);
  for (const question of questions) {
    await pool.query(
      `
        INSERT INTO math_questions (
          id, set_id, question_number, question_order, question_type, prompt,
          options, correct_answer, explanation, score, source_anchor,
          source_excerpt, render_mode, review_status, auto_grade
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        question.id,
        set.id,
        question.question_number,
        question.question_order,
        question.question_type,
        question.prompt,
        JSON.stringify(question.options),
        JSON.stringify(question.correct_answer),
        question.explanation,
        question.score,
        question.source_anchor,
        question.source_excerpt,
        question.render_mode,
        question.review_status,
        question.auto_grade,
      ]
    );
  }

  for (const log of logs) {
    await pool.query(
      `
        INSERT INTO math_import_logs (id, source_file, set_id, status, message, details)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        log.id,
        log.source_file,
        log.set_id,
        log.status,
        log.message,
        JSON.stringify(log.details ?? {}),
      ]
    );
  }
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });
  const files = await walkFiles(sourceRoot);
  const groups = groupFiles(files);
  const imported = [];
  const failures = [];

  console.log(`Math source: ${sourceRoot}`);
  console.log(`Files: ${files.length}; grouped sets: ${groups.length}; dryRun=${dryRun}; reset=${reset}`);

  if (!dryRun) {
    await createSchema();
    if (reset) {
      await pool.query(
        "TRUNCATE math_import_logs, math_responses, math_attempts, math_questions, math_question_sets CASCADE"
      );
    }
  }

  for (const group of groups) {
    try {
      const result = await importSet(group);
      imported.push(result);
      if (!dryRun) await writeSet(result);
    } catch (error) {
      failures.push({
        group: group.key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    sourceRoot,
    dryRun,
    reset,
    fileCount: files.length,
    setCount: imported.length,
    questionCount: imported.reduce((sum, item) => sum + item.questions.length, 0),
    readyQuestionCount: imported.reduce(
      (sum, item) => sum + item.questions.filter((question) => question.review_status === "ready").length,
      0
    ),
    needsReviewQuestionCount: imported.reduce(
      (sum, item) =>
        sum + item.questions.filter((question) => question.review_status === "needs_review").length,
      0
    ),
    sourceOnlyQuestionCount: imported.reduce(
      (sum, item) =>
        sum + item.questions.filter((question) => question.review_status === "source_only").length,
      0
    ),
    failureCount: failures.length,
    failures,
  };
  const dataset = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    fileCount: files.length,
    setCount: imported.length,
    questionCount: summary.questionCount,
    sets: imported.map((item) => item.set),
    questions: imported.flatMap((item) =>
      item.questions.map((question) => ({
        ...question,
        set_id: item.set.id,
      }))
    ),
    logs: imported.flatMap((item) => item.logs),
    failures,
  };

  await fs.writeFile(
    path.join(reportDir, "math-import-report.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(reportDir, "math-question-bank.json"),
    JSON.stringify(dataset, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
