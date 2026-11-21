import { NextRequest } from "next/server";
import { bankAccess, bankHeaders, bankProfile } from "@/server/grade6-bank/http";
import { createReportAccess, reportAccess, revokeReportAccess } from "@/server/practice-report";

async function manage(request: NextRequest) {
  const denied = bankAccess(request, request.method !== "GET");
  if (denied) return denied;
  const student = bankProfile(request).id;
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: bankHeaders });
  try {
    if (request.method === "POST") {
      const created = await createReportAccess(student);
      return created ? json(created, 201) : json({ error: "已有只读密钥。如需换新，请先停用旧密钥。" }, 409);
    }
    if (request.method === "DELETE") {
      await revokeReportAccess(student);
      return json({ startsAt: null });
    }
    return json(await reportAccess(student));
  } catch {
    return json({ error: "暂时无法读取授权状态，请稍后重试。" }, 503);
  }
}

export { manage as GET, manage as POST, manage as DELETE };
