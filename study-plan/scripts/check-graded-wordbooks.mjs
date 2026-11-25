import assert from "node:assert/strict";

const books = ["新东方小学1200词", "新东方初中2000词", "新东方高中7000词"];
const compare = (a, b) => a.sort_order - b.sort_order || Date.parse(a.created_at) - Date.parse(b.created_at) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Check the vocabulary APIs against all original listening occurrences, including retired ones.
export function checkGradedWordbooks(sourceUnits, activeWords, summaryUnits) {
  const current = new Map(activeWords.map(word => [word.id, word]));
  const counts = new Map(summaryUnits.map(unit => [unit.id, unit.word_count]));
  const seen = new Map();
  const stats = [];
  for (const group of books) {
    const units = sourceUnits.filter(unit => unit.group_name === group).sort(compare);
    assert.ok(units.length > 0, group);
    let source = 0, retained = 0;
    for (const unit of units) {
      let keptInUnit = 0;
      for (const word of [...unit.words].sort(compare)) {
        const key = word.word.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/\s+/g, " ");
        const first = key && seen.get(key);
        source++;
        if (first) {
          assert.ok(!current.has(word.id), "Later spelling still appears in the vocabulary list");
          assert.ok(current.get(first)?.previous_word_ids?.includes(word.id), "A retired ID lost its original spelling");
        } else {
          assert.equal(current.get(word.id)?.unit_id, unit.id, "First occurrence must stay in its original unit");
          if (key) seen.set(key, word.id);
          keptInUnit++;
        }
      }
      assert.equal(counts.get(unit.id), keptInUnit, "Book overview differs from the practice list");
      retained += keptInUnit;
    }
    stats.push({ source, retained, removed: source - retained });
  }
  return stats;
}

export async function verifyGradedWordbookRoutes(base, headers) {
  const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
  async function get(path) {
    const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, 200);
    return response.json();
  }
  const { units: source } = await get(`/api/subjects/${subject}?source=listening`);
  const { words } = await get(`/api/words?subject_id=${subject}`);
  const { units } = await get(`/api/subjects/${subject}?summary=1&include_units=1`);
  const stats = checkGradedWordbooks(source, words, units);
  for (const [i, row] of stats.entries()) {
    console.log(`Vocabulary book ${i + 1}: source=${row.source} retained=${row.retained} removed=${row.removed}`);
  }
}
