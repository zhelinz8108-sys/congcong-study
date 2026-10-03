import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadHolidayTestModule, appRoot } from "./holiday-math-test-utils.mjs";
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : [path.join(directory, entry.name)],
  );
}
const { holidayPrivateAnswer: privateAnswer } = await loadHolidayTestModule(
  "src/server/holiday-math-700/private-bank.ts",
);
const questions = JSON.parse(
  readFileSync(
    path.join(appRoot, "src/server/holiday-math-700/questions.public.json"),
    "utf8",
  ),
);
const encrypted = JSON.parse(
  readFileSync(
    path.join(appRoot, "src/server/holiday-math-700/answers.encrypted.json"),
    "utf8",
  ),
);
const privatePhrases = questions.flatMap((q) => {
  const record = privateAnswer(q.id);
  return [
    ...record.hints,
    record.solution.short_explanation,
    ...record.solution.steps,
  ].filter((text) => text.length >= 60);
});
const candidates = files(path.join(appRoot, ".next/static")).filter((file) =>
  /\.(?:js|json|map)$/.test(file),
);
for (const file of candidates) {
  const text = readFileSync(file, "utf8");
  assert.ok(
    !text.includes(process.env.HOLIDAY_MATH_700_KEY),
    "A secret reached a client asset",
  );
  assert.ok(
    !text.includes(encrypted.ciphertext.slice(0, 100)),
    "Encrypted private package reached a client asset",
  );
  assert.ok(
    !text.includes("accepted_answers"),
    "Grading answer keys reached a client asset",
  );
  for (const phrase of privatePhrases)
    assert.ok(
      !text.includes(phrase),
      `Private solution in ${path.basename(file)}`,
    );
}
assert.equal(files(path.join(appRoot, "public/holiday-math-700")).length, 82);
console.log(
  JSON.stringify(
    {
      clientAssetsChecked: candidates.length,
      privatePhrasesChecked: privatePhrases.length,
      privateAnswersInBrowser: false,
      keyInBrowser: false,
      encryptedPackageInBrowser: false,
    },
    null,
    2,
  ),
);
