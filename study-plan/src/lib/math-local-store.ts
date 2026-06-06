import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import {
  gradeMathResponse,
  MATH_STUDENT_ID,
  MATH_STUDENT_NAME,
  type MathQuestionForGrading,
} from "@/lib/math-question-bank";
import {
  compareMathUnitKeys,
  getMathUnitDisplay,
  getMathUnitKey,
} from "@/lib/math-unit-labels";

type LocalQuestionSet = {
  id: string;
  title: string;
  grade: string;
  semester: string;
  subject: string;
  category: string;
  unit_label: string;
  source_root: string;
  source_dir: string;
  source_files: string[];
  answer_files: string[];
  import_status: string;
  question_count: number;
  ready_count: number;
  needs_review_count: number;
  source_only_count: number;
  unit_key?: string;
  unit_display?: string;
  latest_attempt_id?: string | null;
  latest_attempt_status?: string | null;
  latest_total_score?: number | null;
  latest_max_score?: number | null;
  latest_submitted_at?: string | null;
};

type LocalQuestion = MathQuestionForGrading & {
  set_id: string;
  question_number: string;
  question_order: number;
  prompt: string;
  options: Array<{ key: string; text: string }>;
  explanation: string;
  source_anchor: string;
  source_excerpt: string;
  render_mode: string;
  review_status: string;
  created_at?: string;
};

type LocalAttempt = {
  id: string;
  set_id: string;
  student_id: string;
  student_name: string;
  started_at: string;
  submitted_at: string | null;
  total_score: number;
  max_score: number;
  correct_count: number;
  total_count: number;
  status: "in_progress" | "submitted";
};

type LocalResponse = {
  id: string;
  attempt_id: string;
  question_id: string;
  response_text: string;
  self_rating: "correct" | "partial" | "incorrect" | null;
  is_correct: boolean;
  grading_status: string;
  score: number;
  max_score: number;
  feedback: string;
  created_at: string;
  updated_at: string;
};

type LocalDataset = {
  generatedAt: string;
  sourceRoot: string;
  sets: LocalQuestionSet[];
  questions: LocalQuestion[];
};

type LocalState = {
  attempts: LocalAttempt[];
  responses: LocalResponse[];
};

type QuestionSetFilters = {
  category?: string;
  unit?: string;
  status?: string;
  attempted?: string;
  search?: string;
};

type InlineAnswerRecord = {
  raw: string;
  answers: string[];
  section: string;
};

const localDir = path.join(process.cwd(), ".tmp-math-import");
const datasetPath = path.join(localDir, "math-question-bank.json");
const statePath = path.join(localDir, "math-question-bank-state.json");

let writeChain = Promise.resolve();
const inlineAnswerCache = new Map<string, Promise<Map<string, InlineAnswerRecord>>>();

export function shouldUseLocalMathStore(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connect|database|password|relation|schema/i.test(
    message
  );
}

async function readDataset(): Promise<LocalDataset> {
  try {
    const raw = await readFile(datasetPath, "utf8");
    return JSON.parse(raw) as LocalDataset;
  } catch (error) {
    const message =
      error instanceof Error && "code" in error && error.code === "ENOENT"
        ? "本地题库还没生成，请先运行 npm run math:import:dry。"
        : "本地题库读取失败。";
    throw new Error(message);
  }
}

async function readState(): Promise<LocalState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      attempts: parsed.attempts ?? [],
      responses: parsed.responses ?? [],
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { attempts: [], responses: [] };
    }
    throw error;
  }
}

async function writeState(state: LocalState) {
  await mkdir(localDir, { recursive: true });
  const tmpPath = `${statePath}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await rename(tmpPath, statePath);
}

async function updateState<T>(mutator: (state: LocalState) => T | Promise<T>) {
  let result: T;
  writeChain = writeChain.then(async () => {
    const state = await readState();
    result = await mutator(state);
    await writeState(state);
  });
  await writeChain;
  return result!;
}

function cleanMathText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitAnswerSection(text: string) {
  const markers = ["参考答案与解析", "参考答案", "答案解析部分", "答案与解析", "答案解析"];
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index > -1) return text.slice(index);
  }
  return text;
}

function parseNumberedAnswerBlocks(text: string) {
  const blocks: Array<{ number: string; text: string }> = [];
  const matches = [...text.matchAll(/(?:^|\n)\s*(\d{1,2})[．.、]\s*/g)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const nextStart = matches[index + 1]?.index ?? text.length;
    const raw = text.slice(start, nextStart).trim();
    if (!raw || raw.length < 2) continue;
    blocks.push({
      number: match[1],
      text: cleanMathText(raw.replace(/^\s*\d{1,2}[．.、]\s*/, "")),
    });
  }

  return blocks;
}

function firstMeaningfulLine(section: string) {
  return (
    section
      .split(/\n+/)
      .map((line) => cleanMathText(line).replace(/^答案[:：]?\s*/, "").trim())
      .find((line) => line && !/^[一二三四五六七八九十]+[．.、]/.test(line)) ?? ""
  );
}

function extractInlineAnswerValue(section: string) {
  const firstLine = firstMeaningfulLine(section);
  const directChoice = firstLine.match(/^([A-F√×])(?:\s|$|[，,；;、.．。])/);
  if (directChoice) return directChoice[1];
  if (firstLine && firstLine.length <= 120 && !/[（）()]/.test(firstLine)) return firstLine;

  const patterns = [
    /故答案为[:：]?\s*([^。\n]+)/,
    /答案[:：]\s*([^。\n]+)/,
    /【答案】\s*([^【\n]+)/,
    /解[:：]\s*([^。\n]+)/,
  ];

  for (const pattern of patterns) {
    const match = section.match(pattern);
    if (match?.[1]) return cleanMathText(match[1]).slice(0, 300);
  }

  const short = section.replace(/【分析】[\s\S]*$/g, "").trim();
  if (short.length <= 80) return short;
  const choice = section.match(/(?:^|\s)([A-F√×])(?:\s|$|。)/);
  return choice?.[1] ?? "";
}

function isUsefulInlineAnswer(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[答案答解：:。.，,、；;\s]/g, "")
    .trim();
  return normalized.length > 0 && !/[（）()]/.test(normalized);
}

function getInlineAnswerValues(answer: unknown) {
  if (!answer || typeof answer !== "object") return [];
  const data = answer as Record<string, unknown>;
  if (Array.isArray(data.answers)) return data.answers.map(String).filter(Boolean);
  if (data.answer !== undefined) return [String(data.answer)];
  if (data.raw !== undefined) return [String(data.raw)];
  return [];
}

function shouldUseInlineAnswer(question: LocalQuestion, record: InlineAnswerRecord) {
  if (!isUsefulInlineAnswer(record.raw)) return false;

  const existing = getInlineAnswerValues(question.correct_answer);
  if (existing.length === 0) return true;

  if (question.question_type === "choice") {
    return !existing.some((value) => /^[A-F]$/.test(value.trim().toUpperCase()));
  }

  if (question.question_type === "true_false") {
    return !existing.some((value) => /^[√×]$/.test(value.trim()));
  }

  return !existing.some(isUsefulInlineAnswer);
}

async function extractAnswerFileText(fullPath: string) {
  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: fullPath });
    return cleanMathText(result.value ?? "");
  }

  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = await readFile(fullPath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    return cleanMathText(result.text ?? "");
  }

  return "";
}

function resolveLocalMathFile(set: LocalQuestionSet, relative: string) {
  const sourceRoot = path.resolve(set.source_root);
  const fullPath = path.resolve(sourceRoot, relative);
  const relativeToRoot = path.relative(sourceRoot, fullPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;
  return fullPath;
}

function buildInlineAnswerMapFromText(answerText: string) {
  const map = new Map<string, InlineAnswerRecord>();
  for (const block of parseNumberedAnswerBlocks(answerText)) {
    const answer = extractInlineAnswerValue(block.text);
    if (!isUsefulInlineAnswer(answer)) continue;
    if (map.has(block.number)) continue;
    map.set(block.number, {
      raw: answer,
      answers: [answer],
      section: block.text,
    });
  }
  return map;
}

async function loadInlineAnswerMap(set: LocalQuestionSet) {
  const cacheKey = `${set.id}:${set.answer_files.join("|")}:${set.source_files.join("|")}`;
  const cached = inlineAnswerCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const files = set.answer_files.length > 0 ? set.answer_files : set.source_files;
    const map = new Map<string, InlineAnswerRecord>();

    for (const relative of files) {
      const fullPath = resolveLocalMathFile(set, relative);
      if (!fullPath) continue;
      const text = splitAnswerSection(await extractAnswerFileText(fullPath));
      const nextMap = buildInlineAnswerMapFromText(text);
      for (const [number, record] of nextMap) {
        if (!map.has(number)) map.set(number, record);
      }
    }

    return map;
  })();

  inlineAnswerCache.set(cacheKey, promise);
  return promise;
}

async function mergeInlineAnswers(set: LocalQuestionSet, questions: LocalQuestion[]) {
  const answerMap = await loadInlineAnswerMap(set).catch(() => new Map<string, InlineAnswerRecord>());
  if (answerMap.size === 0) return questions;

  return questions.map((question) => {
    const record = answerMap.get(question.question_number);
    if (!record || !shouldUseInlineAnswer(question, record)) return question;

    const autoGrade = ["choice", "true_false", "fill_blank", "calculation"].includes(
      question.question_type
    );
    const explanation =
      record.section.trim() === record.raw.trim() ? question.explanation : record.section;

    return {
      ...question,
      correct_answer: { raw: record.raw, answers: record.answers },
      explanation,
      review_status: question.review_status === "source_only" ? question.review_status : "ready",
      auto_grade: autoGrade,
    };
  });
}

function displayCategory(set: LocalQuestionSet) {
  return set.category || "未分类";
}

function displayUnit(set: LocalQuestionSet) {
  return getMathUnitDisplay(set.unit_label);
}

function unitKey(set: LocalQuestionSet) {
  return getMathUnitKey(set.unit_label);
}

function enrichSetUnit<T extends LocalQuestionSet>(set: T) {
  return {
    ...set,
    unit_key: unitKey(set),
    unit_display: displayUnit(set),
  };
}

function latestAttemptForSet(state: LocalState, setId: string) {
  return state.attempts
    .filter((attempt) => attempt.set_id === setId && attempt.student_id === MATH_STUDENT_ID)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

function buildFilterOptions(sets: LocalQuestionSet[]) {
  const categoryMap = new Map<string, number>();
  const unitMap = new Map<string, number>();

  for (const set of sets) {
    categoryMap.set(displayCategory(set), (categoryMap.get(displayCategory(set)) ?? 0) + 1);
    unitMap.set(unitKey(set), (unitMap.get(unitKey(set)) ?? 0) + 1);
  }

  return {
    categories: [...categoryMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    units: [...unitMap.entries()]
      .map(([value, count]) => ({ value, name: getMathUnitDisplay(value), count }))
      .sort((a, b) => compareMathUnitKeys(a.value, b.value)),
  };
}

export async function getLocalQuestionSets(filters: QuestionSetFilters) {
  const [dataset, state] = await Promise.all([readDataset(), readState()]);
  const allSets = dataset.sets;
  let sets = allSets.map((set) => {
    const latest = latestAttemptForSet(state, set.id);
    return enrichSetUnit({
      ...set,
      latest_attempt_id: latest?.id ?? null,
      latest_attempt_status: latest?.status ?? null,
      latest_total_score: latest?.total_score ?? null,
      latest_max_score: latest?.max_score ?? null,
      latest_submitted_at: latest?.submitted_at ?? null,
    });
  });

  if (filters.category) {
    sets = sets.filter((set) => displayCategory(set) === filters.category);
  }
  if (filters.unit) {
    sets = sets.filter((set) => unitKey(set) === filters.unit || displayUnit(set) === filters.unit);
  }
  if (filters.status) {
    sets = sets.filter((set) => set.import_status === filters.status);
  }
  if (filters.search?.trim()) {
    const keyword = filters.search.trim().toLowerCase();
    sets = sets.filter((set) => set.title.toLowerCase().includes(keyword));
  }
  if (filters.attempted === "done") {
    sets = sets.filter((set) => Boolean(set.latest_attempt_id));
  }
  if (filters.attempted === "new") {
    sets = sets.filter((set) => !set.latest_attempt_id);
  }

  sets.sort(
    (a, b) =>
      Number(unitKey(a) === "special:unknown") - Number(unitKey(b) === "special:unknown") ||
      compareMathUnitKeys(unitKey(a), unitKey(b)) ||
      displayCategory(a).localeCompare(displayCategory(b), "zh-Hans-CN") ||
      a.title.localeCompare(b.title, "zh-Hans-CN")
  );

  return {
    sets: sets.slice(0, 300),
    filters: buildFilterOptions(allSets),
    storage: "local",
  };
}

export async function getLocalQuestionSet(setId: string, includeAnswers: boolean) {
  const dataset = await readDataset();
  const set = dataset.sets.find((item) => item.id === setId);
  if (!set) return null;

  const fullQuestions = dataset.questions
    .filter((question) => question.set_id === setId)
    .sort((a, b) => a.question_order - b.question_order);

  const questions = includeAnswers
    ? await mergeInlineAnswers(set, fullQuestions)
    : fullQuestions.map((question) => {
      const safeQuestion: Partial<LocalQuestion> = { ...question };
      delete safeQuestion.correct_answer;
      delete safeQuestion.explanation;
      return safeQuestion;
    });

  return { set: enrichSetUnit(set), questions, storage: "local" };
}

export async function getLocalQuestionSourceFile(
  setId: string,
  kind: "source" | "answer",
  index: number
) {
  const dataset = await readDataset();
  const set = dataset.sets.find((item) => item.id === setId);
  if (!set) return null;

  const files = kind === "answer" ? set.answer_files : set.source_files;
  const relative = files[index];
  if (!relative) return null;

  const sourceRoot = path.resolve(set.source_root);
  const fullPath = path.resolve(sourceRoot, relative);
  const relativeToRoot = path.relative(sourceRoot, fullPath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;

  return {
    fullPath,
    filename: path.basename(relative),
    relative,
  };
}

export async function createLocalAttempt(setId: string) {
  const dataset = await readDataset();
  const set = dataset.sets.find((item) => item.id === setId);
  if (!set) return null;

  return updateState((state) => {
    const attempt: LocalAttempt = {
      id: uuid(),
      set_id: setId,
      student_id: MATH_STUDENT_ID,
      student_name: MATH_STUDENT_NAME,
      started_at: new Date().toISOString(),
      submitted_at: null,
      total_score: 0,
      max_score: 0,
      correct_count: 0,
      total_count: 0,
      status: "in_progress",
    };
    state.attempts.push(attempt);
    return attempt;
  });
}

export async function saveLocalResponse(
  attemptId: string,
  questionId: string,
  responseText: string,
  selfRating: LocalResponse["self_rating"]
) {
  return updateState((state) => {
    const attempt = state.attempts.find((item) => item.id === attemptId);
    if (!attempt) return { error: "练习记录不存在", status: 404 as const };
    if (attempt.status === "submitted") {
      return { error: "已提交的练习不能修改", status: 409 as const };
    }

    const now = new Date().toISOString();
    const existing = state.responses.find(
      (item) => item.attempt_id === attemptId && item.question_id === questionId
    );

    if (existing) {
      existing.response_text = responseText;
      existing.self_rating = selfRating;
      existing.updated_at = now;
      return { response: existing };
    }

    const response: LocalResponse = {
      id: uuid(),
      attempt_id: attemptId,
      question_id: questionId,
      response_text: responseText,
      self_rating: selfRating,
      is_correct: false,
      grading_status: "self_review",
      score: 0,
      max_score: 0,
      feedback: "",
      created_at: now,
      updated_at: now,
    };
    state.responses.push(response);
    return { response };
  });
}

export async function submitLocalAttempt(attemptId: string) {
  const dataset = await readDataset();

  return updateState(async (state) => {
    const attempt = state.attempts.find((item) => item.id === attemptId);
    if (!attempt) return { error: "练习记录不存在", status: 404 as const };

    const set = dataset.sets.find((item) => item.id === attempt.set_id);
    const baseQuestions = dataset.questions
      .filter((question) => question.set_id === attempt.set_id)
      .sort((a, b) => a.question_order - b.question_order);
    const questions = set ? await mergeInlineAnswers(set, baseQuestions) : baseQuestions;
    const now = new Date().toISOString();

    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;

    for (const question of questions) {
      let response = state.responses.find(
        (item) => item.attempt_id === attemptId && item.question_id === question.id
      );
      if (!response) {
        response = {
          id: uuid(),
          attempt_id: attemptId,
          question_id: question.id,
          response_text: "",
          self_rating: null,
          is_correct: false,
          grading_status: "self_review",
          score: 0,
          max_score: 0,
          feedback: "",
          created_at: now,
          updated_at: now,
        };
        state.responses.push(response);
      }

      const grade = gradeMathResponse(
        question,
        response.response_text,
        response.self_rating
      );
      response.is_correct = grade.isCorrect;
      response.grading_status = grade.status;
      response.score = grade.score;
      response.max_score = grade.maxScore;
      response.feedback = grade.feedback;
      response.updated_at = now;

      totalScore += grade.score;
      maxScore += grade.maxScore;
      if (grade.isCorrect) correctCount += 1;
    }

    attempt.submitted_at = now;
    attempt.total_score = totalScore;
    attempt.max_score = maxScore;
    attempt.correct_count = correctCount;
    attempt.total_count = questions.length;
    attempt.status = "submitted";

    return { attempt };
  });
}

export async function getLocalAttemptResult(attemptId: string) {
  const [dataset, state] = await Promise.all([readDataset(), readState()]);
  const attempt = state.attempts.find((item) => item.id === attemptId);
  if (!attempt) return null;

  const set = dataset.sets.find((item) => item.id === attempt.set_id);
  if (!set) return null;

  const baseQuestions = dataset.questions
    .filter((question) => question.set_id === attempt.set_id)
    .sort((a, b) => a.question_order - b.question_order);
  const questions = (await mergeInlineAnswers(set, baseQuestions))
    .map((question) => {
      const response = state.responses.find(
        (item) => item.attempt_id === attemptId && item.question_id === question.id
      );
      return {
        ...question,
        response_text: response?.response_text ?? null,
        self_rating: response?.self_rating ?? null,
        is_correct: response?.is_correct ?? null,
        grading_status: response?.grading_status ?? null,
        response_score: response?.score ?? null,
        max_score: response?.max_score ?? null,
        feedback: response?.feedback ?? null,
      };
    });

  return {
    attempt: {
      ...attempt,
      set_title: set.title,
      category: set.category,
      unit_label: set.unit_label,
      unit_key: unitKey(set),
      unit_display: displayUnit(set),
    },
    questions,
    storage: "local",
  };
}

export async function getLocalMistakes() {
  const [dataset, state] = await Promise.all([readDataset(), readState()]);
  const submittedAttempts = state.attempts.filter(
    (attempt) => attempt.student_id === MATH_STUDENT_ID && attempt.status === "submitted"
  );
  const attemptsById = new Map(submittedAttempts.map((attempt) => [attempt.id, attempt]));
  const latestByQuestion = new Map<string, LocalResponse>();

  for (const response of state.responses) {
    const attempt = attemptsById.get(response.attempt_id);
    if (!attempt) continue;
    const previous = latestByQuestion.get(response.question_id);
    const previousAttempt = previous ? attemptsById.get(previous.attempt_id) : null;
    if (!previousAttempt || attempt.submitted_at! > previousAttempt.submitted_at!) {
      latestByQuestion.set(response.question_id, response);
    }
  }

  const questionsBySet = new Map<string, LocalQuestion[]>();
  for (const questionId of latestByQuestion.keys()) {
    const question = dataset.questions.find((item) => item.id === questionId);
    if (!question) continue;
    const questions = questionsBySet.get(question.set_id) ?? [];
    questions.push(question);
    questionsBySet.set(question.set_id, questions);
  }

  const questionById = new Map<string, LocalQuestion>();
  for (const [setId, questions] of questionsBySet) {
    const set = dataset.sets.find((item) => item.id === setId);
    const mergedQuestions = set ? await mergeInlineAnswers(set, questions) : questions;
    for (const question of mergedQuestions) questionById.set(question.id, question);
  }

  const mistakes = [...latestByQuestion.values()]
    .filter((response) => !response.is_correct)
    .map((response) => {
      const question = questionById.get(response.question_id);
      const attempt = attemptsById.get(response.attempt_id);
      const set = dataset.sets.find((item) => item.id === question?.set_id);
      if (!question || !attempt || !set) return null;
      return {
        question_id: question.id,
        question_number: question.question_number,
        question_type: question.question_type,
        prompt: question.prompt,
        options: question.options,
        correct_answer: question.correct_answer,
        explanation: question.explanation,
        review_status: question.review_status,
        auto_grade: question.auto_grade,
        set_id: set.id,
        set_title: set.title,
        category: set.category,
        unit_label: set.unit_label,
        unit_key: unitKey(set),
        unit_display: displayUnit(set),
        response_text: response.response_text,
        self_rating: response.self_rating,
        is_correct: response.is_correct,
        grading_status: response.grading_status,
        score: response.score,
        max_score: response.max_score,
        feedback: response.feedback,
        attempt_id: attempt.id,
        submitted_at: attempt.submitted_at,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)))
    .slice(0, 200);

  return { mistakes, storage: "local" };
}
