import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// No DB/progress imports. A failed local-test handshake must be read-only even
// before authentication or any progress-table initialization is reached.
export function GET() {
  if (process.env.NODE_ENV === "production" || process.env.GRADE6_BANK_TEST_MEMORY !== "1") return new NextResponse(null, { status: 404 });
  return NextResponse.json({ isolatedTestMemory: true }, { headers: { "Cache-Control": "no-store", "X-Grade6-QA-Memory": "isolated" } });
}
