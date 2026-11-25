-- The active vocabulary table owns one occurrence per spelling in reading order.
-- Keep retired source rows separately for sentence audio and historical questions.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE study_units IN SHARE MODE;
LOCK TABLE study_words IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS graded_wordbook_archive (
  word_id text PRIMARY KEY,
  kept_word_id text NOT NULL,
  subject_id text NOT NULL,
  unit_id text NOT NULL,
  source_word jsonb NOT NULL,
  CHECK (word_id <> kept_word_id)
);
CREATE INDEX IF NOT EXISTS graded_wordbook_archive_kept_idx ON graded_wordbook_archive(kept_word_id);
CREATE INDEX IF NOT EXISTS graded_wordbook_archive_subject_idx ON graded_wordbook_archive(subject_id);

CREATE TEMP TABLE graded_wordbook_repeats ON COMMIT DROP AS
WITH ranked AS (
  SELECT w.id, first_value(w.id) OVER reading_order AS kept_word_id, row_number() OVER reading_order AS position
  FROM study_words w
  JOIN study_units u ON u.id = w.unit_id AND u.subject_id = w.subject_id
  WHERE w.subject_id = '8bd6f79b-99f5-4e68-a961-872d60d260b1'
    AND u.group_name IN ('新东方小学1200词', '新东方初中2000词', '新东方高中7000词')
    AND w.word ~ '[^[:space:]]'
  WINDOW reading_order AS (
    PARTITION BY lower(btrim(regexp_replace(translate(normalize(w.word, NFKC), '’‘', chr(39) || chr(39)), '[[:space:]]+', ' ', 'g')))
    ORDER BY CASE u.group_name WHEN '新东方小学1200词' THEN 1 WHEN '新东方初中2000词' THEN 2 ELSE 3 END,
             u.sort_order, u.created_at, u.id, w.sort_order, w.created_at, w.id
  )
)
SELECT id, kept_word_id, position FROM ranked WHERE id <> kept_word_id;

DELETE FROM graded_wordbook_archive a
WHERE EXISTS (SELECT 1 FROM graded_wordbook_repeats d WHERE d.kept_word_id = a.word_id);

-- A reimport may introduce an earlier occurrence of a previously retained word.
UPDATE graded_wordbook_archive a SET kept_word_id = d.kept_word_id
FROM graded_wordbook_repeats d WHERE a.kept_word_id = d.id;

INSERT INTO graded_wordbook_archive (word_id, kept_word_id, subject_id, unit_id, source_word)
SELECT w.id, d.kept_word_id, w.subject_id, w.unit_id, to_jsonb(w)
FROM graded_wordbook_repeats d JOIN study_words w ON w.id = d.id
ON CONFLICT (word_id) DO UPDATE SET kept_word_id = EXCLUDED.kept_word_id,
  subject_id = EXCLUDED.subject_id, unit_id = EXCLUDED.unit_id, source_word = EXCLUDED.source_word;

WITH definitions AS (
  SELECT DISTINCT ON (d.kept_word_id) d.kept_word_id, w.meaning
  FROM graded_wordbook_repeats d JOIN study_words w ON w.id = d.id
  WHERE btrim(w.meaning) <> '' ORDER BY d.kept_word_id, d.position
)
UPDATE study_words w SET meaning = def.meaning FROM definitions def
WHERE w.id = def.kept_word_id AND btrim(w.meaning) = '';

-- Carry forward the most recent dated review as one complete spaced-repetition state.
WITH latest AS (
  SELECT DISTINCT ON (d.kept_word_id) d.kept_word_id, w.*
  FROM graded_wordbook_repeats d JOIN study_words w ON w.id = d.id
  WHERE w.last_review IS NOT NULL
  ORDER BY d.kept_word_id, w.last_review DESC, w.id
)
UPDATE study_words w SET (mastered, interval, repetitions, ease_factor, next_review, last_review) =
  (l.mastered, l.interval, l.repetitions, l.ease_factor, l.next_review, l.last_review)
FROM latest l
WHERE w.id = l.kept_word_id AND (w.last_review IS NULL OR w.last_review < l.last_review);

DELETE FROM study_words w USING graded_wordbook_repeats d, graded_wordbook_archive a
WHERE w.id = d.id AND a.word_id = w.id AND a.kept_word_id = d.kept_word_id;

CREATE OR REPLACE VIEW study_sentence_words AS
  SELECT w.id, w.subject_id, w.unit_id, w.word, w.phonetic, w.meaning, w.example,
         w.mastered, w.interval, w.repetitions, w.ease_factor, w.next_review, w.last_review,
         w.audio_start, w.audio_end, w.sort_order, w.created_at
  FROM study_words w
  UNION ALL
  SELECT a.word_id, a.subject_id, a.unit_id, original.word, original.phonetic, original.meaning, original.example,
         original.mastered, original.interval, original.repetitions, original.ease_factor, original.next_review, original.last_review,
         original.audio_start, original.audio_end, original.sort_order, original.created_at
  FROM graded_wordbook_archive a
  CROSS JOIN LATERAL jsonb_populate_record(NULL::study_words, a.source_word) original
  WHERE NOT EXISTS (SELECT 1 FROM study_words w WHERE w.id = a.word_id);

CREATE OR REPLACE VIEW study_vocabulary_words AS
  SELECT w.*, aliases.previous_word_ids FROM study_words w
  LEFT JOIN (
    SELECT kept_word_id, array_agg(word_id ORDER BY word_id) AS previous_word_ids
    FROM graded_wordbook_archive GROUP BY kept_word_id
  ) aliases ON aliases.kept_word_id = w.id;
COMMIT;
