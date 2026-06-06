export interface Subject {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
  material_count?: number;
  unit_count?: number;
  word_count?: number;
}

export interface Unit {
  id: string;
  subject_id: string;
  name: string;
  group_name: string;
  sort_order: number;
  created_at: string;
  materials?: Material[];
  words?: Word[];
  material_count?: number;
  word_count?: number;
}

export interface Word {
  id: string;
  subject_id: string;
  unit_id: string | null;
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
  mastered: number;
  interval: number;
  repetitions: number;
  ease_factor: number;
  next_review: string;
  last_review: string | null;
  audio_start: number | null;
  audio_end: number | null;
  sort_order: number;
  created_at: string;
}

export interface Material {
  id: string;
  unit_id: string;
  name: string;
  file_path: string | null;
  file_type: "pdf" | "image" | "video" | "audio" | "other";
  file_size: number;
  sort_order: number;
  created_at: string;
}

export interface MathQuestionSet {
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
  import_status: "ready" | "needs_review" | "pending";
  question_count: number;
  ready_count: number;
  needs_review_count: number;
  source_only_count: number;
  latest_attempt_id?: string | null;
  latest_attempt_status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MathQuestion {
  id: string;
  set_id: string;
  question_number: string;
  question_order: number;
  question_type: "choice" | "true_false" | "fill_blank" | "calculation" | "subjective" | "source_only";
  prompt: string;
  options: { key: string; text: string }[];
  correct_answer?: unknown;
  explanation?: string;
  score: number;
  source_anchor: string;
  source_excerpt: string;
  render_mode: "structured" | "source";
  review_status: "ready" | "needs_review" | "source_only";
  auto_grade: boolean;
  created_at: string;
}
