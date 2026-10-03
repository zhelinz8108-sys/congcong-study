import {
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
  chownSync,
  chmodSync,
} from "node:fs";

// Deployment only. The secret arrives over SSH stdin, never a command argument.
// The existing application environment and its owner/mode must be preserved.
if (process.platform !== "linux" || process.getuid?.() !== 0)
  throw new Error("Run only as root during Linux deployment.");
const key = readFileSync(0, "utf8").trim();
if (!/^[a-f0-9]{64}$/i.test(key))
  throw new Error("Dedicated question-bank key is missing or invalid.");
const target = "/etc/study-plan.env",
  metadata = statSync(target),
  existing = readFileSync(target, "utf8");
const previous = existing.match(/^HOLIDAY_MATH_700_KEY=(.*)$/m)?.[1]?.trim();
if (previous && previous !== key)
  throw new Error(
    "Refusing to replace an existing question-bank key; explicit rotation is required.",
  );
if (!previous) {
  const content =
    existing.replace(/^HOLIDAY_MATH_700_KEY=.*\r?\n?/gm, "").trimEnd() +
    `\nHOLIDAY_MATH_700_KEY=${key}\n`;
  const temporary = "/etc/study-plan.env.holiday-key.tmp";
  writeFileSync(temporary, content, {
    flag: "wx",
    mode: metadata.mode & 0o777,
  });
  chownSync(temporary, metadata.uid, metadata.gid);
  chmodSync(temporary, metadata.mode & 0o777);
  renameSync(temporary, target);
}
console.log("Private question-bank server key configured; no value emitted.");
