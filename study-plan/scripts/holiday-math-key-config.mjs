export function holidayEnvironmentContent(existing, key) {
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("Dedicated question-bank key is missing or invalid.");
  const previous = existing.match(/^HOLIDAY_MATH_700_KEY=(.*)$/m)?.[1]?.trim();
  if (previous && previous !== key)
    throw new Error(
      "Refusing to replace an existing question-bank key; explicit rotation is required.",
    );
  if (previous) return existing;
  return (
    existing.replace(/^HOLIDAY_MATH_700_KEY=.*\r?\n?/gm, "").trimEnd() +
    `\nHOLIDAY_MATH_700_KEY=${key}\n`
  );
}
