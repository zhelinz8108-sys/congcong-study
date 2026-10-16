import "server-only";
import { createHash, createDecipheriv, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertBankDetailedSolution, type BankDetailedSolution } from "@/lib/grade6-bank-solution";

const root = path.join(process.cwd(), "content", "grade6-bank");
const sha = (raw: string) => createHash("sha256").update(raw).digest("hex");
let solutionsPromise: Promise<Map<string, BankDetailedSolution> | null> | null = null;
type Envelope = { version: 1; publicDigest: string; salt: string; iv: string; tag: string; ciphertext: string };

/** Optional, all-or-nothing content overlay. It has no database dependencies,
 * does not regrade any attempt, and must NOT be called by question/public APIs. */
export async function getBankDetailedSolution(id: string): Promise<BankDetailedSolution | null> {
  solutionsPromise ??= (async () => {
    let raw: string;
    try { raw = await readFile(path.join(root, "sealed", "detailed-solutions.encrypted.json"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const envelope = JSON.parse(raw) as Envelope;
    const nativeRaw = await readFile(path.join(root, "questions.native.public.json"), "utf8");
    const native = JSON.parse(nativeRaw) as { total: number; questions: { id: string; inputs: { id: string }[] }[] };
    const digest = sha(nativeRaw), salt = Buffer.from(envelope.salt, "base64"), iv = Buffer.from(envelope.iv, "base64"), tag = Buffer.from(envelope.tag, "base64");
    if (Object.keys(envelope).some(key => !["version", "publicDigest", "salt", "iv", "tag", "ciphertext"].includes(key)) || envelope.version !== 1 || envelope.publicDigest !== digest || salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || !envelope.ciphertext || native.total !== 2394 || native.questions.length !== native.total) throw new Error("逐步详解题目版本不匹配");
    const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("解析服务尚未配置");
    const key = scryptSync(secret, Buffer.concat([Buffer.from("grade6-detailed-v1:"), salt]), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from("grade6-detailed-v1:solutions:" + digest)); decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8")) as { version: number; total: number; solutions: BankDetailedSolution[] };
    if (Object.keys(data).some(key => !["version", "total", "solutions"].includes(key)) || data.version !== 1 || data.total !== native.total || !Array.isArray(data.solutions) || data.solutions.length !== native.total) throw new Error("逐步详解全库覆盖不完整");
    const questions = new Map(native.questions.map(row => [row.id, row])), result = new Map<string, BankDetailedSolution>();
    for (const row of data.solutions) {
      const question = questions.get(row.id);
      if (!question || result.has(row.id)) throw new Error("逐步详解对应错误");
      assertBankDetailedSolution(row, question.id, question.inputs.map(field => field.id));
      result.set(row.id, row);
    }
    return result;
  })();
  return (await solutionsPromise)?.get(id) ?? null;
}
