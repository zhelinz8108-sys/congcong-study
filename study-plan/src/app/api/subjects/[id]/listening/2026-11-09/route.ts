import { NextRequest, NextResponse } from "next/server";
import { v5 as uuidv5, validate as isUuid } from "uuid";
import { pool } from "@/lib/db";
import { holidayAccess, holidayHeaders } from "@/server/holiday-math-700/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function listeningUnit(subjectId: string) {
  if (!isUuid(subjectId)) return null;
  const subject = await pool.query(
    "SELECT id FROM study_subjects WHERE id=$1 AND name=$2",
    [subjectId, "英语"],
  );
  return subject.rows.length
    ? uuidv5("english-listening:2026-11-09", subjectId)
    : null;
}

function unavailable() {
  return NextResponse.json(
    { error: "听力资料暂时不可用，请稍后重试。" },
    { status: 503, headers: holidayHeaders },
  );
}

function missingSubject() {
  return NextResponse.json(
    { error: "未找到英语学科。" },
    { status: 404, headers: holidayHeaders },
  );
}

export async function GET(request: NextRequest, { params }: Context) {
  const denied = holidayAccess(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const unitId = await listeningUnit(id);
    if (!unitId) return missingSubject();
    // Visiting an empty date never creates a unit or changes learning records.
    const result = await pool.query(
      `SELECT m.id, m.unit_id, m.name, m.file_path, m.file_type,
              m.file_size, m.sort_order, m.created_at
       FROM study_materials m JOIN study_units u ON u.id=m.unit_id
       WHERE u.id=$1 AND u.subject_id=$2
       ORDER BY m.sort_order, m.created_at, m.id`,
      [unitId, id],
    );
    return NextResponse.json(
      { unitId, materials: result.rows },
      { headers: holidayHeaders },
    );
  } catch {
    return unavailable();
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const denied = holidayAccess(request, true);
  if (denied) return denied;
  try {
    const { id } = await params;
    const unitId = await listeningUnit(id);
    if (!unitId) return missingSubject();
    // A date has one stable ID per English subject, including concurrent uploads.
    // Existing names, grouping and uploaded materials are never overwritten.
    const created = await pool.query(
      `INSERT INTO study_units (id, subject_id, name, group_name, sort_order)
       SELECT $1, $2, $3, $4, COALESCE(MAX(sort_order), 0)+1
       FROM study_units WHERE subject_id=$2
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [unitId, id, "2026年11月9日听力", "英语听力"],
    );
    if (!created.rows.length) {
      const existing = await pool.query(
        "SELECT id FROM study_units WHERE id=$1 AND subject_id=$2",
        [unitId, id],
      );
      if (!existing.rows.length) return unavailable();
    }
    return NextResponse.json(
      { unitId },
      { status: created.rows.length ? 201 : 200, headers: holidayHeaders },
    );
  } catch {
    return unavailable();
  }
}
