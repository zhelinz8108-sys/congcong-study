import { readPracticeReport } from "@/server/practice-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await readPracticeReport(request);
  } catch {
    return Response.json({ error: "暂时读不到练习报告" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
