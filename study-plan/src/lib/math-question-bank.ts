import { pool } from "@/lib/db";
import { DEFAULT_STUDENT_PROFILE } from "@/lib/family-access";

export const MATH_STUDENT_ID = "congcong";
export const MATH_STUDENT_NAME = DEFAULT_STUDENT_PROFILE.name;

export type MathQuestionType =
  | "choice"
  | "true_false"
  | "fill_blank"
  | "calculation"
  | "subjective"
  | "source_only";

export type MathReviewStatus = "ready" | "needs_review" | "source_only";
export type MathGradingStatus = "correct" | "incorrect" | "partial" | "self_review";

export type MathQuestionForGrading = {
  id: string;
  question_type: MathQuestionType;
  correct_answer: unknown;
  score: number | null;
  auto_grade: boolean;
};

export type GradeResult = {
  isCorrect: boolean;
  status: MathGradingStatus;
  score: number;
  maxScore: number;
  feedback: string;
};

let schemaReady: Promise<void> | null = null;

export function ensureMathQuestionBankSchema() {
  if (!schemaReady) {
    schemaReady = createMathQuestionBankSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function createMathQuestionBankSchema() {
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
      student_id TEXT NOT NULL DEFAULT '${MATH_STUDENT_ID}',
      student_name TEXT NOT NULL DEFAULT '${MATH_STUDENT_NAME}',
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
    CREATE INDEX IF NOT EXISTS idx_math_attempts_status ON math_attempts(status);
    CREATE INDEX IF NOT EXISTS idx_math_responses_attempt ON math_responses(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_math_responses_question ON math_responses(question_id);
    CREATE INDEX IF NOT EXISTS idx_math_responses_mistakes ON math_responses(question_id, is_correct);
  `);
}

export function normalizeMathAnswer(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[ＡＢＣＤ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/[，,；;、。.\s]/g, "")
    .replace(/[（）()【】\[\]{}]/g, "")
    .toUpperCase();
}

function getAnswerValues(correctAnswer: unknown): string[] {
  if (!correctAnswer) return [];
  if (Array.isArray(correctAnswer)) return correctAnswer.map(String);
  if (typeof correctAnswer === "string" || typeof correctAnswer === "number") {
    return [String(correctAnswer)];
  }
  if (typeof correctAnswer === "object") {
    const data = correctAnswer as Record<string, unknown>;
    if (Array.isArray(data.answers)) return data.answers.map(String);
    if (Array.isArray(data.value)) return data.value.map(String);
    if (data.answer !== undefined) return [String(data.answer)];
    if (data.raw !== undefined) return [String(data.raw)];
  }
  return [];
}

function normalizeTrueFalse(value: string) {
  const normalized = normalizeMathAnswer(value);
  if (["TRUE", "T", "YES", "Y", "对", "是", "正确", "√", "V"].includes(normalized)) {
    return "TRUE";
  }
  if (["FALSE", "F", "NO", "N", "错", "否", "错误", "×", "X"].includes(normalized)) {
    return "FALSE";
  }
  return normalized;
}

function extractChoice(value: string) {
  const match = normalizeMathAnswer(value).match(/[A-F]/);
  return match?.[0] ?? normalizeMathAnswer(value);
}

export function gradeMathResponse(
  question: MathQuestionForGrading,
  responseText: string,
  selfRating?: string | null
): GradeResult {
  const maxScore = Number(question.score ?? 1);
  const answers = getAnswerValues(question.correct_answer).filter(Boolean);
  const text = responseText ?? "";

  if (!question.auto_grade || question.question_type === "subjective") {
    if (selfRating === "correct") {
      return {
        isCorrect: true,
        status: "correct",
        score: maxScore,
        maxScore,
        feedback: "已按自评标记为掌握。",
      };
    }
    if (selfRating === "partial") {
      return {
        isCorrect: false,
        status: "partial",
        score: maxScore / 2,
        maxScore,
        feedback: "已按自评标记为部分正确，建议加入错题复习。",
      };
    }
    return {
      isCorrect: false,
      status: "self_review",
      score: 0,
      maxScore,
      feedback: "这道题需要对照解析自评。",
    };
  }

  if (answers.length === 0) {
    return {
      isCorrect: false,
      status: "self_review",
      score: 0,
      maxScore,
      feedback: "未解析到标准答案，请对照解析自评。",
    };
  }

  let isCorrect = false;

  if (question.question_type === "choice") {
    const response = extractChoice(text);
    isCorrect = answers.some((answer) => extractChoice(answer) === response);
  } else if (question.question_type === "true_false") {
    const response = normalizeTrueFalse(text);
    isCorrect = answers.some((answer) => normalizeTrueFalse(answer) === response);
  } else if (question.question_type === "fill_blank") {
    const responseParts = text
      .split(/[,，;；、\n]+/)
      .map(normalizeMathAnswer)
      .filter(Boolean);
    const answerParts = answers.map(normalizeMathAnswer).filter(Boolean);
    if (answerParts.length <= 1 || responseParts.length <= 1) {
      isCorrect = answerParts.some((answer) => normalizeMathAnswer(text) === answer);
    } else {
      isCorrect =
        responseParts.length === answerParts.length &&
        answerParts.every((answer, index) => answer === responseParts[index]);
    }
  } else {
    const normalizedResponse = normalizeMathAnswer(text);
    isCorrect = answers.some((answer) => normalizeMathAnswer(answer) === normalizedResponse);
  }

  return {
    isCorrect,
    status: isCorrect ? "correct" : "incorrect",
    score: isCorrect ? maxScore : 0,
    maxScore,
    feedback: isCorrect ? "回答正确。" : "回答不一致，请查看标准答案和解析。",
  };
}
