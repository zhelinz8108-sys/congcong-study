/** Compare forms, while preserving meaningful apostrophes and word order. */
export function normalizeNationalDayAnswer(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑–—]/g, "-")
    .replace(/\b(can't|cannot)\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/\b([a-z]+)n't\b/g, "$1 not")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\b(you|we|they)'re\b/g, "$1 are")
    .replace(/\b(he|she|it|there|that|who)'s\b/g, "$1 is")
    .replace(/\b(i|you|he|she|it|we|they)'ll\b/g, "$1 will")
    .replace(/[.,!?;:，。！？；：“”"()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkNationalDayAnswer(values: string[], accepted: string[][]) {
  return accepted.length > 0 && values.length === accepted.length && accepted.every((alternatives, index) =>
    alternatives.some((answer) => normalizeNationalDayAnswer(values[index]) === normalizeNationalDayAnswer(answer)),
  );
}
