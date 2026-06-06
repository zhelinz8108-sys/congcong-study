-- Study Plan App Migration
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS study_subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📚',
  color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_units (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES study_subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_words (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES study_subjects(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES study_units(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  mastered INTEGER NOT NULL DEFAULT 0,
  interval INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  next_review TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_review TIMESTAMPTZ,
  audio_start REAL,
  audio_end REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_materials (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES study_units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT NOT NULL DEFAULT 'other',
  file_size INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Add sentence_text column (run if upgrading from initial schema)
ALTER TABLE study_units ADD COLUMN IF NOT EXISTS sentence_text TEXT;

-- Indexes (single-column)
CREATE INDEX IF NOT EXISTS idx_study_units_subject ON study_units(subject_id);
CREATE INDEX IF NOT EXISTS idx_study_words_subject ON study_words(subject_id);
CREATE INDEX IF NOT EXISTS idx_study_words_unit ON study_words(unit_id);
CREATE INDEX IF NOT EXISTS idx_study_words_review ON study_words(next_review);
CREATE INDEX IF NOT EXISTS idx_study_materials_unit ON study_materials(unit_id);

-- Composite indexes (performance)
CREATE INDEX IF NOT EXISTS idx_study_words_subject_review ON study_words(subject_id, next_review);
CREATE INDEX IF NOT EXISTS idx_study_units_subject_sort ON study_units(subject_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_study_materials_unit_sort ON study_materials(unit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_study_words_unit_sort ON study_words(unit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_math_question_sets_category ON math_question_sets(category);
CREATE INDEX IF NOT EXISTS idx_math_question_sets_unit ON math_question_sets(unit_label);
CREATE INDEX IF NOT EXISTS idx_math_questions_set_order ON math_questions(set_id, question_order);
CREATE INDEX IF NOT EXISTS idx_math_attempts_set_student ON math_attempts(set_id, student_id);
CREATE INDEX IF NOT EXISTS idx_math_attempts_status ON math_attempts(status);
CREATE INDEX IF NOT EXISTS idx_math_responses_attempt ON math_responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_math_responses_question ON math_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_math_responses_mistakes ON math_responses(question_id, is_correct);

-- Disable RLS for simplicity (single user app)
ALTER TABLE study_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE math_question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE math_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE math_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE math_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE math_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_study_subjects" ON study_subjects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_study_units" ON study_units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_study_words" ON study_words FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_study_materials" ON study_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_math_question_sets" ON math_question_sets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_math_questions" ON math_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_math_attempts" ON math_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_math_responses" ON math_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_math_import_logs" ON math_import_logs FOR ALL USING (true) WITH CHECK (true);

-- Default subjects (only needed for fresh installs without data migration)
-- INSERT INTO study_subjects (id, name, icon, color, sort_order) VALUES
--   ('default-yuwen', '语文', '📖', '#ef4444', 0),
--   ('default-shuxue', '数学', '🔢', '#3b82f6', 1),
--   ('default-yingyu', '英语', '🔤', '#22c55e', 2)
-- ON CONFLICT (id) DO NOTHING;
