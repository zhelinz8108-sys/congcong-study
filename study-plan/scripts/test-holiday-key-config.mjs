import assert from "node:assert/strict";
import { test } from "node:test";
import { holidayEnvironmentContent as configure } from "./holiday-math-key-config.mjs";
const key = "ab".repeat(32);
test("missing environment creates only the dedicated question bank entry", () =>
  assert.equal(configure("", key), `\nHOLIDAY_MATH_700_KEY=${key}\n`));
test("existing family and database settings are preserved", () => {
  const previous =
    "FAMILY_ACCESS_PASSWORD=unchanged\nDATABASE_URL=postgresql://example\n";
  assert.equal(
    configure(previous, key),
    previous + `HOLIDAY_MATH_700_KEY=${key}\n`,
  );
});
test("existing identical key makes deployment idempotent", () => {
  const previous = `OTHER=unchanged\nHOLIDAY_MATH_700_KEY=${key}\n`;
  assert.equal(configure(previous, key), previous);
});
test("different existing key cannot be silently overwritten", () =>
  assert.throws(() =>
    configure(`HOLIDAY_MATH_700_KEY=${"cd".repeat(32)}\n`, key),
  ));
test("blank key placeholders are replaced without modifying other settings", () =>
  assert.equal(
    configure("OTHER=unchanged\nHOLIDAY_MATH_700_KEY=\n", key),
    `OTHER=unchanged\nHOLIDAY_MATH_700_KEY=${key}\n`,
  ));
test("missing or short deployment secrets reject", () => {
  for (const value of ["", "123", "x".repeat(64)])
    assert.throws(() => configure("", value));
});
