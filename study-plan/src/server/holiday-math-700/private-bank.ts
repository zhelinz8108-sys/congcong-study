import "server-only";
import { createDecipheriv, scryptSync } from "node:crypto";
import encrypted from "./answers.encrypted.json";
import type { HolidayPrivateRecord } from "@/lib/holiday-math-700-types";
let records: Map<string, HolidayPrivateRecord> | undefined;
export function holidayPrivateAnswer(id: string) {
  if (!records) {
    const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret))
      throw new Error("判题服务尚未配置");
    const salt = Buffer.from(encrypted.salt, "base64");
    const key = scryptSync(
      secret,
      Buffer.concat([Buffer.from("holiday-math-700-v1:"), salt]),
      32,
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAAD(Buffer.from("holiday-math-700-v1"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]);
    const rows = JSON.parse(plain.toString("utf8")) as HolidayPrivateRecord[];
    if (rows.length !== 700) throw new Error("判题数据不完整");
    records = new Map(rows.map((row) => [row.question_id, row]));
  }
  return records.get(id);
}
