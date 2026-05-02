import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const root = process.cwd();
const backupPath = path.join(root, ".tmp-audio-rebuild", "english-subject-before.json");

const STATIC_SUBJECTS = [
  {
    id: "f3f5f0a4-10d8-4f89-8d8-f6d83f1a1001",
    name: "语文",
    icon: "📖",
    color: "#ef4444",
    sort_order: 1,
    created_at: "2026-03-25T10:32:35+00:00",
  },
  {
    id: "4ea6b4fe-bfd3-440f-b780-6d71c2011609",
    name: "数学",
    icon: "🧮",
    color: "#3b82f6",
    sort_order: 2,
    created_at: "2026-03-25T10:32:35+00:00",
  },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "study_plan",
  user: process.env.PGUSER ?? "study_plan",
  password: process.env.PGPASSWORD,
});

function quote(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function createSchema() {
  await pool.query(`
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sentence_text TEXT
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

    ALTER TABLE study_units ADD COLUMN IF NOT EXISTS sentence_text TEXT;

    CREATE INDEX IF NOT EXISTS idx_study_units_subject ON study_units(subject_id);
    CREATE INDEX IF NOT EXISTS idx_study_words_subject ON study_words(subject_id);
    CREATE INDEX IF NOT EXISTS idx_study_words_unit ON study_words(unit_id);
    CREATE INDEX IF NOT EXISTS idx_study_words_review ON study_words(next_review);
    CREATE INDEX IF NOT EXISTS idx_study_materials_unit ON study_materials(unit_id);
    CREATE INDEX IF NOT EXISTS idx_study_words_subject_review ON study_words(subject_id, next_review);
    CREATE INDEX IF NOT EXISTS idx_study_units_subject_sort ON study_units(subject_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_study_materials_unit_sort ON study_materials(unit_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_study_words_unit_sort ON study_words(unit_id, sort_order);
  `);
}

async function insertMany(table, columns, rows, batchSize = 500) {
  if (rows.length === 0) return;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = [];
    const groups = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    await pool.query(
      `
        INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})
        VALUES ${groups.join(", ")}
        ON CONFLICT (id) DO NOTHING
      `,
      values
    );
  }
}

function loadEnglishBackup() {
  if (!fs.existsSync(backupPath)) return null;
  const raw = fs.readFileSync(backupPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

async function main() {
  await createSchema();

  const backup = loadEnglishBackup();
  const subjects = [...STATIC_SUBJECTS];
  if (backup?.id) {
    subjects.push({
      id: backup.id,
      name: backup.name,
      icon: backup.icon,
      color: backup.color,
      sort_order: 3,
      created_at: backup.created_at,
    });
  }

  await insertMany(
    "study_subjects",
    ["id", "name", "icon", "color", "sort_order", "created_at"],
    subjects
  );

  if (!backup?.units?.length) {
    console.log(`Seeded ${subjects.length} subjects. No English backup found.`);
    return;
  }

  const units = [];
  const words = [];
  const materials = [];

  for (const unit of backup.units) {
    units.push({
      id: unit.id,
      subject_id: unit.subject_id,
      name: unit.name,
      group_name: unit.group_name ?? "",
      sort_order: unit.sort_order ?? 0,
      created_at: unit.created_at,
      sentence_text: unit.sentenceText ? JSON.stringify(unit.sentenceText) : null,
    });

    for (const word of unit.words ?? []) {
      words.push({
        id: word.id,
        subject_id: word.subject_id,
        unit_id: word.unit_id,
        word: word.word,
        phonetic: word.phonetic ?? "",
        meaning: word.meaning ?? "",
        example: word.example ?? "",
        mastered: word.mastered ?? 0,
        interval: word.interval ?? 0,
        repetitions: word.repetitions ?? 0,
        ease_factor: word.ease_factor ?? 2.5,
        next_review: word.next_review ?? new Date().toISOString(),
        last_review: word.last_review ?? null,
        audio_start: word.audio_start ?? null,
        audio_end: word.audio_end ?? null,
        sort_order: word.sort_order ?? 0,
        created_at: word.created_at,
      });
    }

    for (const material of unit.materials ?? []) {
      materials.push({
        id: material.id,
        unit_id: material.unit_id,
        name: material.name,
        file_path: material.file_path ?? null,
        file_type: material.file_type ?? "other",
        file_size: material.file_size ?? 0,
        sort_order: material.sort_order ?? 0,
        created_at: material.created_at,
      });
    }
  }

  await insertMany(
    "study_units",
    ["id", "subject_id", "name", "group_name", "sort_order", "created_at", "sentence_text"],
    units
  );
  await insertMany(
    "study_words",
    [
      "id",
      "subject_id",
      "unit_id",
      "word",
      "phonetic",
      "meaning",
      "example",
      "mastered",
      "interval",
      "repetitions",
      "ease_factor",
      "next_review",
      "last_review",
      "audio_start",
      "audio_end",
      "sort_order",
      "created_at",
    ],
    words
  );
  await insertMany(
    "study_materials",
    ["id", "unit_id", "name", "file_path", "file_type", "file_size", "sort_order", "created_at"],
    materials
  );

  console.log(
    `Seeded ${subjects.length} subjects, ${units.length} units, ${words.length} words, ${materials.length} materials.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
