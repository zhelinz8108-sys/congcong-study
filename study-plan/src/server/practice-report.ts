import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "@/lib/db";
import { isRoundId } from "@/server/dot/rounds";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const pageSize = 100;
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };

export async function reportAccess(student: string) {
  const result = await pool.query<{ starts_at: Date }>("SELECT starts_at FROM practice_report_grants WHERE student_id=$1", [student]);
  return { startsAt: result.rows[0]?.starts_at.toISOString() ?? null };
}

export async function createReportAccess(student: string) {
  const token = "pr_" + randomBytes(32).toString("base64url");
  const result = await pool.query<{ starts_at: Date }>(`
    INSERT INTO practice_report_grants (student_id, token_hash) VALUES ($1, $2)
    ON CONFLICT (student_id) DO NOTHING RETURNING starts_at`, [student, hash(token)]);
  return result.rows[0] ? { token, startsAt: result.rows[0].starts_at.toISOString() } : null;
}

export async function revokeReportAccess(student: string) {
  await pool.query("DELETE FROM practice_report_grants WHERE student_id=$1", [student]);
}

export async function readPracticeReport(request: Request) {
  const unauthorized = () => Response.json({ error: "需要有效的练习报告只读密钥" },
    { status: 401, headers: { ...headers, "WWW-Authenticate": 'Bearer realm="practice-reports"' } });
  const match = /^Bearer (pr_[A-Za-z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return unauthorized();
  const tokenHash = hash(match[1]);
  const query = new URL(request.url).searchParams;
  const after = query.get("after"), since = query.get("since");
  if ((after !== null && !isRoundId(after)) || (since !== null &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(since) || !Number.isFinite(Date.parse(since))))) {
    return Response.json({ error: "分页编号或 UTC 起始时间无效" }, { status: 400, headers });
  }
  // Keep the cursor at PostgreSQL's precision when several rounds close within a millisecond.
  const grant = await pool.query<{ after_at: string | null }>(`
    SELECT cursor.finished_at::text AS after_at FROM practice_report_grants g
    LEFT JOIN practice_rounds cursor ON cursor.id=$2 AND cursor.student_id=g.student_id
      AND cursor.finished_at>=g.starts_at
    WHERE g.token_hash=$1`, [tokenHash, after]);
  if (!grant.rows.length) return unauthorized();
  const afterAt = grant.rows[0].after_at;
  if (after && !afterAt) return Response.json({ error: "这份报告中没有该分页编号" }, { status: 400, headers });

  const result = await pool.query<{ id: string; activity: string; answered: number; finishedAt: Date }>(`
    SELECT r.id, r.activity, r.answered, r.finished_at AS "finishedAt"
    FROM practice_report_grants g JOIN practice_rounds r ON r.student_id=g.student_id
    WHERE g.token_hash=$1 AND r.finished_at>=g.starts_at
      AND ($2::timestamptz IS NULL OR r.finished_at>=$2)
      AND ($3::timestamptz IS NULL OR (r.finished_at,r.id)>($3,$4::uuid))
    ORDER BY r.finished_at,r.id LIMIT $5`, [tokenHash, since ? new Date(since).toISOString() : null, afterAt, after, pageSize + 1]);
  const rounds = result.rows.slice(0, pageSize);
  return Response.json({ rounds, nextAfter: result.rows.length > pageSize ? rounds[pageSize - 1].id : null }, { headers });
}
