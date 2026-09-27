import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorageRoot } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { database: false, storage: false };

  try {
    await pool.query("SELECT 1");
    checks.database = true;
  } catch {
    // Do not leak connection details from a public health endpoint.
  }

  try {
    const root = getStorageRoot();
    await mkdir(/*turbopackIgnore: true*/ root, { recursive: true });
    await access(/*turbopackIgnore: true*/ root, constants.R_OK | constants.W_OK);
    checks.storage = true;
  } catch {
    // The boolean below is enough for deployment and uptime checks.
  }

  const healthy = checks.database && checks.storage;
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
