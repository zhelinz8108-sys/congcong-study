import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureMathQuestionBankSchema, MATH_STUDENT_ID } from "@/lib/math-question-bank";
import { getLocalQuestionSets } from "@/lib/math-local-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? "";
  const unit = searchParams.get("unit") ?? "";
  const status = searchParams.get("status") ?? "";
  const attempted = searchParams.get("attempted") ?? "";
  const search = searchParams.get("search") ?? "";
  const filters = { category, unit, status, attempted, search };

  try {
    await ensureMathQuestionBankSchema();

    const values: unknown[] = [MATH_STUDENT_ID];
    const where: string[] = [];

    if (category) {
      values.push(category);
      where.push(`qs.category = $${values.length}`);
    }
    if (unit) {
      values.push(unit);
      where.push(`qs.unit_label = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`qs.import_status = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      where.push(`qs.title ILIKE $${values.length}`);
    }
    if (attempted === "done") where.push("latest.id IS NOT NULL");
    if (attempted === "new") where.push("latest.id IS NULL");

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [setsResult, metaResult] = await Promise.all([
      pool.query(
        `
          SELECT
            qs.*,
            latest.id AS latest_attempt_id,
            latest.status AS latest_attempt_status,
            latest.total_score AS latest_total_score,
            latest.max_score AS latest_max_score,
            latest.submitted_at AS latest_submitted_at
          FROM math_question_sets qs
          LEFT JOIN LATERAL (
            SELECT id, status, total_score, max_score, submitted_at
            FROM math_attempts
            WHERE set_id = qs.id AND student_id = $1
            ORDER BY started_at DESC
            LIMIT 1
          ) latest ON true
          ${whereSql}
          ORDER BY
            CASE WHEN qs.unit_label = '' THEN 1 ELSE 0 END,
            qs.unit_label,
            qs.category,
            qs.title
          LIMIT 300
        `,
        values
      ),
      pool.query(`
        SELECT
          COALESCE(NULLIF(category, ''), '未分类') AS category,
          COALESCE(NULLIF(unit_label, ''), '未标单元') AS unit_label,
          COUNT(*)::int AS count
        FROM math_question_sets
        GROUP BY category, unit_label
        ORDER BY category, unit_label
      `),
    ]);

    if (setsResult.rowCount === 0) {
      return NextResponse.json(await getLocalQuestionSets(filters));
    }

    const categories = Array.from(
      new Map(
        metaResult.rows.map((row) => [
          row.category,
          {
            name: row.category,
            count: metaResult.rows
              .filter((item) => item.category === row.category)
              .reduce((sum, item) => sum + Number(item.count), 0),
          },
        ])
      ).values()
    );

    const units = Array.from(
      new Map(
        metaResult.rows.map((row) => [
          row.unit_label,
          {
            name: row.unit_label,
            count: metaResult.rows
              .filter((item) => item.unit_label === row.unit_label)
              .reduce((sum, item) => sum + Number(item.count), 0),
          },
        ])
      ).values()
    );

    return NextResponse.json({
      sets: setsResult.rows,
      filters: { categories, units },
      storage: "database",
    });
  } catch {
    try {
      return NextResponse.json(await getLocalQuestionSets(filters));
    } catch (localError) {
      return NextResponse.json(
        {
          error:
            localError instanceof Error
              ? localError.message
              : "本地题库读取失败，请运行 npm run math:import:dry。",
        },
        { status: 503 }
      );
    }
  }
}
