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

-- Disable RLS for simplicity (single user app)
ALTER TABLE study_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_study_subjects" ON study_subjects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_study_units" ON study_units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_study_words" ON study_words FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_study_materials" ON study_materials FOR ALL USING (true) WITH CHECK (true);

-- Default subjects (only needed for fresh installs without data migration)
-- INSERT INTO study_subjects (id, name, icon, color, sort_order) VALUES
--   ('default-yuwen', '语文', '📖', '#ef4444', 0),
--   ('default-shuxue', '数学', '🔢', '#3b82f6', 1),
--   ('default-yingyu', '英语', '🔤', '#22c55e', 2)
-- ON CONFLICT (id) DO NOTHING;
