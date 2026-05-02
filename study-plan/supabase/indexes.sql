-- Performance indexes for study plan app
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Composite index for fetching words due for review in a subject
CREATE INDEX IF NOT EXISTS idx_study_words_subject_review ON study_words(subject_id, next_review);

-- Composite index for fetching units ordered within a subject
CREATE INDEX IF NOT EXISTS idx_study_units_subject_sort ON study_units(subject_id, sort_order);

-- Composite index for fetching materials ordered within a unit
CREATE INDEX IF NOT EXISTS idx_study_materials_unit_sort ON study_materials(unit_id, sort_order);

-- Composite index for fetching words ordered within a unit
CREATE INDEX IF NOT EXISTS idx_study_words_unit_sort ON study_words(unit_id, sort_order);
