import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCloudProgressSchema } from "@/lib/cloud-progress-schema";
import { STUDENT_PROFILE_COOKIE, parseStudentProfileCookie } from "@/lib/family-access";

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
  });
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/progress/[scope]">,
) {
  const { scope } = await context.params;
  if (scope === "chinese:six:v1") {
    return NextResponse.json({ error: "六上答题记录只能通过单次提交接口保存" }, { status: 403 });
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
  if (!("payload" in body)) {
    return NextResponse.json({ error: "缺少进度数据" }, { status: 400 });
  }

  await ensureCloudProgressSchema();
  const profile = getProfile(request);
  const result = await pool.query(
    `INSERT INTO student_cloud_state (student_id, scope, payload, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (student_id, scope)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING updated_at`,
    [profile.id, scope, JSON.stringify(body.payload)],
  );

  return NextResponse.json({ ok: true, updatedAt: result.rows[0]?.updated_at ?? null });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/progress/[scope]">,
) {
  const { scope } = await context.params;
  if (scope === "chinese:six:v1") {
    return NextResponse.json({ error: "六上答题记录不能直接清除，请开始新的练习" }, { status: 403 });
  }
  if (!validScope(scope)) {
    return NextResponse.json({ error: "无效的进度类型" }, { status: 400 });
  }

  await ensureCloudProgressSchema();
  const profile = getProfile(request);
  await pool.query(
    "DELETE FROM student_cloud_state WHERE student_id = $1 AND scope = $2",
    [profile.id, scope],
  );
  return NextResponse.json({ ok: true });
}
