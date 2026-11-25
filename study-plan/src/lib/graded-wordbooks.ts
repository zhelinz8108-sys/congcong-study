import type { Unit, Word } from "@/lib/types";

const bookNames = ["新东方小学1200词", "新东方初中2000词", "新东方高中7000词"];
const englishSubjectId = "8bd6f79b-99f5-4e68-a961-872d60d260b1";

export function gradedWordbookRank(name: string) {
  const index = bookNames.indexOf(name);
  return index < 0 ? bookNames.length : index;
}

function readingOrder(a: Unit | Word, b: Unit | Word) {
  return a.sort_order - b.sort_order || Date.parse(a.created_at) - Date.parse(b.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Project a legacy local source backup into the same three active books as PostgreSQL. */
export function gradedUnitsFromBackup<T extends Unit>(units: T[]): T[] {
  const targets = units.filter(unit => unit.subject_id === englishSubjectId && bookNames.includes(unit.group_name));
  targets.sort((a, b) => gradedWordbookRank(a.group_name) - gradedWordbookRank(b.group_name) || readingOrder(a, b));
  const firstBySpelling = new Map<string, Word>();
  const wordsByUnit = new Map<string, Word[]>();
  for (const unit of targets) {
    if (!unit.words) continue;
    const retained: Word[] = [];
    wordsByUnit.set(unit.id, retained);
    for (const original of [...unit.words].sort(readingOrder)) {
      const spelling = original.word.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/\s+/g, " ");
      const first = firstBySpelling.get(spelling);
      if (!first) {
        const word = { ...original };
        retained.push(word);
        if (spelling) firstBySpelling.set(spelling, word);
        continue;
      }
      (first.previous_word_ids ??= []).push(original.id);
      if (!first.meaning.trim() && original.meaning.trim()) first.meaning = original.meaning;
      if (original.last_review && (!first.last_review || Date.parse(original.last_review) > Date.parse(first.last_review))) {
        const { mastered, interval, repetitions, ease_factor, next_review, last_review } = original;
        Object.assign(first, { mastered, interval, repetitions, ease_factor, next_review, last_review });
      }
    }
  }
  return units.map(unit => {
    const words = wordsByUnit.get(unit.id);
    return words ? { ...unit, words, word_count: words.length } : unit;
  });
}
