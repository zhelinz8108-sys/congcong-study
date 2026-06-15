import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import {
  SCHOOL_WORDBOOK_GROUP_NAME,
  SCHOOL_WORDBOOK_UNITS,
  SCHOOL_WORDBOOK_WORD_COUNT,
} from "@/lib/school-wordbook";

const DEFAULT_ENGLISH_SUBJECT_ID = "8bd6f79b-99f5-4e68-a961-872d60d260b1";

type WordRow = {
  id: string;
  subject_id: string;
  unit_id: string;
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
  sort_order: number;
};

function normalizeKey(word: string) {
  return word.trim().toLowerCase();
}

async function getSubjectId(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return String(body.subject_id ?? DEFAULT_ENGLISH_SUBJECT_ID);
}

async function getSchoolWordbookStats(subjectId: string) {
  const result = await pool.query(
    `
      SELECT
        COUNT(DISTINCT u.id)::int AS unit_count,
        COUNT(w.id)::int AS word_count
      FROM study_units u
      LEFT JOIN study_words w ON w.unit_id = u.id
      WHERE u.subject_id = $1 AND u.group_name = $2
    `,
    [subjectId, SCHOOL_WORDBOOK_GROUP_NAME]
  );

  return {
    groupName: SCHOOL_WORDBOOK_GROUP_NAME,
    unitCount: result.rows[0]?.unit_count ?? 0,
    wordCount: result.rows[0]?.word_count ?? 0,
    expectedWordCount: SCHOOL_WORDBOOK_WORD_COUNT,
  };
}

async function insertWords(client: PoolClient, rows: WordRow[]) {
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    const values: unknown[] = [];
    const groups = batch.map((row) => {
      const columns = [
        row.id,
        row.subject_id,
        row.unit_id,
        row.word,
        row.phonetic,
        row.meaning,
        row.example,
        row.sort_order,
      ];
      const placeholders = columns.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    await client.query(
      `
        INSERT INTO study_words (
          id,
          subject_id,
          unit_id,
          word,
          phonetic,
          meaning,
          example,
          sort_order
        )
        VALUES ${groups.join(", ")}
      `,
      values
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const subjectId = request.nextUrl.searchParams.get("subject_id") ?? DEFAULT_ENGLISH_SUBJECT_ID;
    return NextResponse.json(await getSchoolWordbookStats(subjectId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取学校百词失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const subjectId = await getSubjectId(request);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const subject = await client.query(
      "SELECT id FROM study_subjects WHERE id = $1 LIMIT 1",
      [subjectId]
    );

    if (subject.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "未找到英语学科" }, { status: 404 });
    }

    const phoneticRows = await client.query<{ word: string; phonetic: string }>(
      `
        SELECT word, phonetic
        FROM study_words
        WHERE subject_id = $1 AND COALESCE(phonetic, '') <> ''
      `,
      [subjectId]
    );
    const phoneticByWord = new Map(
      phoneticRows.rows.map((row) => [normalizeKey(row.word), row.phonetic])
    );

    await client.query(
      "DELETE FROM study_units WHERE subject_id = $1 AND group_name = $2",
      [subjectId, SCHOOL_WORDBOOK_GROUP_NAME]
    );

    const unitOrder = await client.query<{ max_order: number }>(
      "SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM study_units WHERE subject_id = $1",
      [subjectId]
    );
    const wordOrder = await client.query<{ max_order: number }>(
      "SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM study_words WHERE subject_id = $1",
      [subjectId]
    );

    let nextUnitOrder = unitOrder.rows[0]?.max_order ?? 0;
    let nextWordOrder = wordOrder.rows[0]?.max_order ?? 0;
    const wordRows: WordRow[] = [];

    for (const unit of SCHOOL_WORDBOOK_UNITS) {
      const unitId = uuid();
      nextUnitOrder += 1;
      await client.query(
        `
          INSERT INTO study_units (
            id,
            subject_id,
            name,
            group_name,
            sort_order,
            sentence_text
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          unitId,
          subjectId,
          unit.name,
          SCHOOL_WORDBOOK_GROUP_NAME,
          nextUnitOrder,
          `${unit.name} · ${unit.words.length} 个词/短语`,
        ]
      );

      for (const entry of unit.words) {
        nextWordOrder += 1;
        wordRows.push({
          id: uuid(),
          subject_id: subjectId,
          unit_id: unitId,
          word: entry.word,
          phonetic: entry.phonetic ?? phoneticByWord.get(normalizeKey(entry.word)) ?? "",
          meaning: entry.meaning,
          example: "",
          sort_order: nextWordOrder,
        });
      }
    }

    await insertWords(client, wordRows);
    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      groupName: SCHOOL_WORDBOOK_GROUP_NAME,
      unitCount: SCHOOL_WORDBOOK_UNITS.length,
      wordCount: wordRows.length,
      expectedWordCount: SCHOOL_WORDBOOK_WORD_COUNT,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入学校百词失败" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
