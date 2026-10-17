import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let commit = "unknown";
  let buildId = "unknown";
  try {
    // Written after the isolated release build; never infer identity from Git or env.
    const metadata: unknown = JSON.parse(await readFile(
      path.join(process.cwd(), "release-metadata.json"), "utf8",
    ));
    if (metadata && typeof metadata === "object") {
      const value = metadata as Record<string, unknown>;
      if (typeof value.commit === "string" && /^[0-9a-f]{40}$/.test(value.commit)) {
        commit = value.commit;
      }
      if (typeof value.buildId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value.buildId)) {
        buildId = value.buildId;
      }
    }
  } catch {
    // Missing, unreadable or malformed metadata must not expose diagnostics.
  }
  return Response.json({ commit, buildId }, {
    headers: { "Cache-Control": "no-store" },
  });
}
