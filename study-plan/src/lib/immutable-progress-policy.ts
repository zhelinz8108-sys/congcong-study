type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};

export function dedicatedProgressScope(scope: string) {
  return scope === "chinese:six:v1" || scope === "chinese:reading:attempts:v1" || scope === "chinese:reading:mistakes:v1";
}

/** Generic progress is for drafts/bookmarks, never for accepting grades.
 * Existing submitted records remain byte-for-byte authoritative. New answers
 * must use the subject's server-graded first-submission endpoint. */
export function mergeProgressWithoutChangingScores(scope: string, previous: unknown, incoming: unknown): unknown {
  const protectedScope = /^(?:math:(?:holiday700|national-day)|english:(?:holiday2400|national-day)):/u.test(scope)
    || scope === "listening:yiben-grade6:v1" || scope === "grammar:course:v1"
    || /^study-plan-grammar-(?:original|tense)-500-progress-v1$/u.test(scope);
  if (protectedScope && (!incoming || typeof incoming !== "object" || Array.isArray(incoming))) return previous ?? {};
  const prior = object(previous), next = { ...object(incoming) };
  if (/^(?:math:(?:holiday700|national-day)|english:(?:holiday2400|national-day)):/u.test(scope)) {
    next.attempts = object(prior.attempts);
    const drafts = { ...object(next.drafts) };
    for (const [id, raw] of Object.entries(object(prior.attempts))) {
      const attempt = object(raw);
      if (attempt.checked === true || Number(attempt.submissions) > 0) {
        if (id in object(prior.drafts)) drafts[id] = object(prior.drafts)[id];
        else delete drafts[id];
      }
    }
    next.drafts = drafts;
  } else if (scope === "listening:yiben-grade6:v1") {
    const exercises = { ...object(next.exercises) };
    for (const [id, raw] of Object.entries(exercises)) {
      const old = object(object(prior.exercises)[id]);
      if (old.submitted === true || Number(old.attempts) > 0) exercises[id] = old;
      else exercises[id] = { ...object(raw), submitted: false, score: 0, total: 0, bestScore: 0, attempts: 0 };
    }
    for (const [id, raw] of Object.entries(object(prior.exercises))) {
      const old = object(raw);
      if (old.submitted === true || Number(old.attempts) > 0) exercises[id] = old;
    }
    next.exercises = exercises;
  } else if (scope === "grammar:course:v1") {
    next.lessonPractice = object(prior.lessonPractice);
  } else if (/^study-plan-grammar-(?:original|tense)-500-progress-v1$/u.test(scope)) {
    return previous ?? {};
  }
  return !protectedScope && Array.isArray(incoming) ? incoming : next;
}
