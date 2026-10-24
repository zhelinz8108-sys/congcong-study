import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BankResultDescriptor } from "./result-descriptor";
import { decryptBankResultDescriptors, type BankResultEnvelope } from "./result-envelope";

// Positions are reviewed against this exact authenticated, encrypted key file.
const sealedKeyDigest = "8ae6a5879966526e4d2b0a82a252a67565a600e583711acd6893826c408ce60a";
let verified: Promise<void> | undefined;
let descriptors: Promise<Map<string, BankResultDescriptor>> | undefined;
export async function getBankResultDescriptor(id: string) {
  descriptors ??= (async () => {
    await verifyBankResultDescriptors();
    const raw = await readFile(path.join(process.cwd(), "content/grade6-bank/sealed/result-assessments.encrypted.json"), "utf8");
    const data = decryptBankResultDescriptors(JSON.parse(raw) as BankResultEnvelope, process.env.HOLIDAY_MATH_700_KEY?.trim() ?? "", sealedKeyDigest) as { version: number; total: number; descriptors: Record<string, BankResultDescriptor> };
    if (!data || Object.keys(data).some(key => !["version", "total", "descriptors"].includes(key)) || data.version !== 1 || !data.descriptors || Array.isArray(data.descriptors) || data.total !== Object.keys(data.descriptors).length || data.total < 1 || data.total > 2394) throw new Error("Invalid result descriptor coverage");
    const rows = Object.entries(data.descriptors);
    if (rows.some(([key]) => !/^[a-z0-9_-]{1,100}$/i.test(key) || ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Invalid result descriptor identity");
    return new Map(rows);
  })();
  return (await descriptors).get(id);
}
export async function verifyBankResultDescriptors() {
  verified ??= readFile(path.join(process.cwd(), "content/grade6-bank/sealed/native-answers.encrypted.json")).then(raw => {
    if (createHash("sha256").update(raw).digest("hex") !== sealedKeyDigest) throw new Error("Result descriptors do not match the authenticated answer release");
  });
  return verified;
}
