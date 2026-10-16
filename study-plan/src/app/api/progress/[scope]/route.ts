import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCloudProgressSchema } from "@/lib/cloud-progress-schema";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";
import { dedicatedProgressScope, mergeProgressWithoutChangingScores } from "@/lib/immutable-progress-policy";
import { unsafeSubmissionOrigin } from "@/server/submission-request";

export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

function validScope(scope: string) {
  return /^[a-z0-9][a-z0-9:_-]{0,127}$/i.test(scope);
}

function getProfile(request: NextRequest) {
  return parseStudentProfileCookie(request.cookies.get(STUDENT_PROFILE_COOKIE)?.value);
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/progress/[scope]">,
) {
  const { scope } = await context.params;
  if (!validScope(scope)) {
    return NextResponse.json({ error: "无效的进度类型" }, { status: 400 });
  }

  await ensureCloudProgressSchema();
  const profile = getProfile(request);
  const result = await pool.query(
    `SELECT payload, updated_at
       FROM student_cloud_state
      WHERE student_id = $1 AND scope = $2`,
    [profile.id, scope],
  );

  const row = result.rows[0];
  return NextResponse.json({
    payload: row?.payload ?? null,
    updatedAt: row?.updated_at ?? null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/progress/[scope]">,
) {
  const { scope } = await context.params;
  if (dedicatedProgressScope(scope) || unsafeSubmissionOrigin(request)) {
    return NextResponse.json({ error: "答题记录只能通过首次提交接口保存" }, { status: 403 });
  }
  if (!validScope(scope)) {
    return NextResponse.json({ error: "无效的进度类型" }, { status: 400 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "进度数据过大" }, { status: 413 });
  }

  let body: { payload?: unknown };
  try {
    body = JSON.parse(raw) as { payload?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !("payload" in body)) {
    return NextResponse.json({ error: "缺少进度数据" }, { status: 400 });
  }

  await ensureCloudProgressSchema();
  const profile = getProfile(request);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["progress", profile.id, scope])]);
    const prior = await client.query("SELECT payload FROM student_cloud_state WHERE student_id=$1 AND scope=$2 FOR UPDATE", [profile.id, scope]);
    const payload = mergeProgressWithoutChangingScores(scope, prior.rows[0]?.payload ?? null, body.payload);
    const result = await client.query(
      `INSERT INTO student_cloud_state (student_id, scope, payload, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (student_id, scope)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      RETURNING updated_at, payload`,
      [profile.id, scope, JSON.stringify(payload)],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, payload: result.rows[0]?.payload ?? payload, updatedAt: result.rows[0]?.updated_at ?? null });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/progress/[scope]">,
) {
  const { scope } = await context.params;
  if (!validScope(scope)) {
    return NextResponse.json({ error: "无效的进度类型" }, { status: 400 });
  }

  return NextResponse.json({ error: "首次答题记录不能清除" }, { status: 403 });
}
