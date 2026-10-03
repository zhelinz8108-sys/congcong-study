export type HolidayQuestionType =
  | "single_choice"
  | "multi_choice"
  | "fill_numeric"
  | "fill_expression"
  | "multi_blank"
  | "table_fill"
  | "matching"
  | "ordering"
  | "classification"
  | "multi_part"
  | "true_false_with_reason"
  | "error_diagnosis"
  | "can_or_cannot_determine";
export type HolidayItem = { id: string; text: string };
export type HolidayNode = {
  type: HolidayQuestionType;
  stem: string;
  choices?: HolidayItem[] | null;
  input?: { blanks: { label: string; unit: string | null }[] } | null;
  interaction?: {
    items?: HolidayItem[];
    categories?: HolidayItem[];
    left?: HolidayItem[];
    right?: HolidayItem[];
    table?: { header: string[]; rows: string[][] };
  } | null;
  parts?: (HolidayNode & { part_id: string })[] | null;
};
export type HolidayQuestion = HolidayNode & {
  id: string;
  chapter_id: string;
  chapter_title: string;
  difficulty: "easy" | "hard" | "extreme";
  difficulty_score: number;
  knowledge_points: string[];
  knowledge_point_names?: string[];
  skills: string[];
  requires_diagram: boolean;
  diagram: {
    type: "svg";
    src: string;
    alt: string;
    width?: number;
    height?: number;
  } | null;
  estimated_time_seconds: number;
  extension_topic?: string | null;
};
export type HolidayChapter = {
  chapter_id: string;
  chapter_title: string;
  count: number;
};
export type HolidayStudentAnswer =
  string | string[] | { [key: string]: HolidayStudentAnswer };
export type HolidayAnswerKey = {
  kind:
    | "choice"
    | "choices"
    | "number"
    | "fraction"
    | "expression"
    | "text"
    | "blanks"
    | "mapping"
    | "sequence"
    | "parts";
  value: string | string[] | Record<string, string | HolidayAnswerKey>;
  accepted_answers: unknown[];
  tolerance: number | string | null;
  unit: string | (string | null)[] | null;
  unit_required: boolean;
};
export type HolidayPrivateRecord = {
  question_id: string;
  answer: HolidayAnswerKey;
  hints: string[];
  solution: { short_explanation: string; steps: string[] };
  choice_rationales: Record<string, string | Record<string, string>>;
  common_mistakes: string[];
  difficulty_reason: string;
};
export type HolidayItemResult = {
  path: string;
  label: string;
  correct: boolean;
  expected: string;
  message?: string;
};
export type HolidayGrade = {
  correct: boolean;
  score: number;
  maxScore: number;
  items: HolidayItemResult[];
};
export type HolidayFeedback = HolidayGrade & {
  question_id: string;
  solution: HolidayPrivateRecord["solution"];
  choice_rationales: HolidayPrivateRecord["choice_rationales"];
  common_mistakes: string[];
};
export const HOLIDAY_TYPE_LABELS: Record<HolidayQuestionType, string> = {
  single_choice: "单项选择",
  multi_choice: "多项选择",
  fill_numeric: "数值填空",
  fill_expression: "表达式填空",
  multi_blank: "多空填答",
  table_fill: "表格填空",
  matching: "匹配连线",
  ordering: "排序",
  classification: "分类",
  multi_part: "多小题",
  true_false_with_reason: "判断与理由",
  error_diagnosis: "错误诊断",
  can_or_cannot_determine: "信息充分性判断",
};
