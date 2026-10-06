import "server-only";
import { createDecipheriv, scryptSync } from "node:crypto";
import encrypted from "./answers.encrypted.json";
import type { EnglishPracticeLetter } from "@/lib/national-day-english-practice-types";

type PrivateEnglishAnswer = {
  questionId: string;
  correctOption: EnglishPracticeLetter;
  correctText: string;
  explanation: string;
};
let records: Map<string, PrivateEnglishAnswer> | undefined;
export function englishPracticePrivateAnswer(id: string) {
  if (!records) {
    const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret))
      throw new Error("判题服务尚未配置");
    const aad = "holiday-english-2400-v1";
    if (encrypted.version !== 1 || encrypted.algorithm !== "aes-256-gcm" || encrypted.aad !== aad)
      throw new Error("判题数据不完整");
    const salt = Buffer.from(encrypted.salt, "base64");
    const key = scryptSync(secret, Buffer.concat([Buffer.from(`${aad}:`), salt]), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]);
    const rows = JSON.parse(plain.toString("utf8")) as PrivateEnglishAnswer[];
    if (!Array.isArray(rows) || rows.length !== 2400 || rows.some((row) =>
      !row || !/^CH(?:0[1-9]|1\d|2[0-4])-Q(?:00[1-9]|0[1-9]\d|100)$/.test(row.questionId) ||
      !/^[ABCD]$/.test(row.correctOption) ||
      typeof row.correctText !== "string" || !row.correctText ||
      typeof row.explanation !== "string" || !row.explanation
    )) throw new Error("判题数据不完整");
    const loaded = new Map(rows.map((row) => [row.questionId, row]));
    if (loaded.size !== 2400) throw new Error("判题数据不完整");
    records = loaded;
  }
  return records.get(id);
}
