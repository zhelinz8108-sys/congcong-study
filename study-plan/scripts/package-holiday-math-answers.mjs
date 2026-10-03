import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(appRoot, false);
const source = process.argv[2];
if (!source)
  throw new Error("Provide the optimized answers_private.json path.");
const secret = process.env.HOLIDAY_MATH_700_KEY?.trim();
if (!secret || !/^[a-f0-9]{64}$/i.test(secret))
  throw new Error(
    "HOLIDAY_MATH_700_KEY must be a dedicated random 32-byte hex key; never put it in the repository.",
  );
const plain = readFileSync(source);
const rows = JSON.parse(plain);
if (
  rows.length !== 700 ||
  new Set(rows.map((row) => row.question_id)).size !== 700
)
  throw new Error("Expected exactly 700 private answer records.");
const salt = randomBytes(32),
  iv = randomBytes(12);
const key = scryptSync(
  secret,
  Buffer.concat([Buffer.from("holiday-math-700-v1:"), salt]),
  32,
);
const cipher = createCipheriv("aes-256-gcm", key, iv);
cipher.setAAD(Buffer.from("holiday-math-700-v1"));
const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
const target = fileURLToPath(
  new URL(
    "../src/server/holiday-math-700/answers.encrypted.json",
    import.meta.url,
  ),
);
mkdirSync(
  fileURLToPath(new URL("../src/server/holiday-math-700/", import.meta.url)),
  { recursive: true },
);
writeFileSync(
  target,
  JSON.stringify({
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  }) + "\n",
);
console.log(
  "Packaged 700 encrypted server answers; no plaintext answers or key emitted.",
);
