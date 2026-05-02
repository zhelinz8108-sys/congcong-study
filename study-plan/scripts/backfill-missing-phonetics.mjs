import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ARPABET_TO_IPA = {
  AA: "ɑ",
  AE: "æ",
  AH: "ʌ",
  AO: "ɔ",
  AW: "aʊ",
  AY: "aɪ",
  EH: "ɛ",
  ER: "ɝ",
  EY: "eɪ",
  IH: "ɪ",
  IY: "i",
  OW: "oʊ",
  OY: "ɔɪ",
  UH: "ʊ",
  UW: "u",
  AX: "ə",
  IX: "ɨ",
  UX: "ʉ",
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  F: "f",
  G: "ɡ",
  HH: "h",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  P: "p",
  R: "r",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};

const SUBJECT_ID = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
const ENV_PATH = path.join(process.cwd(), ".env.local");
const REPORT_PATH = path.join(process.cwd(), ".tmp-phonetic-backfill-report.json");

for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeWord(word) {
  return word.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function canonicalWord(word) {
  return normalizeWord(word).replace(/[^a-z]/g, "");
}

function buildCandidates(word) {
  const base = word.trim().toLowerCase();
  const normalized = normalizeWord(base);
  const candidates = new Set([base, normalized]);
  if (normalized.includes("-")) {
    candidates.add(normalized.replace(/-/g, " "));
    candidates.add(normalized.replace(/-/g, ""));
  }
  return [...candidates].filter(Boolean);
}

function convertArpabetToIpa(pronunciation) {
  const tokens = pronunciation.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  const primaryStressIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.endsWith("1"))
    .map(({ index }) => index);
  const downgradedPrimaryStress = new Set(primaryStressIndexes.slice(0, -1));

  const ipa = tokens
    .map((token, index) => {
      const match = token.match(/^([A-Z]+)([012])?$/);
      const base = match?.[1] ?? token;
      const stress = match?.[2] ?? "";
      let sound = ARPABET_TO_IPA[base] ?? base.toLowerCase();

      if (base === "AH" && stress === "0") sound = "ə";
      if (base === "ER" && stress === "0") sound = "ər";

      let marker = "";
      if (stress === "1") {
        marker = downgradedPrimaryStress.has(index) ? "ˌ" : "ˈ";
      } else if (stress === "2") {
        marker = "ˌ";
      }

      return `${marker}${sound}`;
    })
    .join("");

  return ipa ? `/${ipa}/` : "";
}

async function fetchDictionaryPhonetic(word) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { signal: AbortSignal.timeout(3000) }
  );
  if (!res.ok) return "";
  const data = await res.json();
  return (
    data?.[0]?.phonetic ||
    data?.[0]?.phonetics?.find((phonetic) => phonetic.text)?.text ||
    ""
  );
}

function pickDatamusePronunciation(input, entries) {
  const inputCanonical = canonicalWord(input);
  const ranked = entries
    .map((entry) => {
      const pronunciation = entry.tags?.find((tag) => tag.startsWith("pron:"))?.slice(5).trim();
      if (!entry.word || !pronunciation) return null;
      return {
        pronunciation,
        rank:
          (canonicalWord(entry.word) === inputCanonical ? 1000 : 0) + (entry.score ?? 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank);
  return ranked[0]?.pronunciation ?? "";
}

async function fetchDatamusePhonetic(word) {
  const res = await fetch(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=r&max=8`,
    { signal: AbortSignal.timeout(3000) }
  );
  if (!res.ok) return "";
  const data = await res.json();
  const arpabet = pickDatamusePronunciation(word, data);
  return arpabet ? convertArpabetToIpa(arpabet) : "";
}

async function resolvePhonetic(word) {
  for (const candidate of buildCandidates(word)) {
    try {
      const phonetic = await fetchDictionaryPhonetic(candidate);
      if (phonetic) return { phonetic, source: "dictionaryapi", candidate };
    } catch {
      // Ignore and continue.
    }
  }

  for (const candidate of buildCandidates(word)) {
    try {
      const phonetic = await fetchDatamusePhonetic(candidate);
      if (phonetic) return { phonetic, source: "datamuse", candidate };
    } catch {
      // Ignore and continue.
    }
  }

  return { phonetic: "", source: "unresolved", candidate: "" };
}

async function fetchAll(table, select, queryBuilder) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  for (;;) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = queryBuilder(query);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

const units = await fetchAll("study_units", "id", (query) =>
  query.eq("subject_id", SUBJECT_ID)
);
const unitIds = units.map((unit) => unit.id);
const words = await fetchAll("study_words", "id,word,phonetic,unit_id", (query) =>
  query.in("unit_id", unitIds)
);
const missingRows = words.filter((word) => !word.phonetic || !String(word.phonetic).trim());
const uniqueWords = [...new Set(missingRows.map((word) => word.word))];

const resolved = new Map();
const report = {
  totalWords: words.length,
  missingBefore: missingRows.length,
  uniqueMissingWords: uniqueWords.length,
  updatedRows: 0,
  unresolvedWords: [],
  sample: [],
};

for (const word of uniqueWords) {
  const result = await resolvePhonetic(word);
  resolved.set(word, result);
}

for (const row of missingRows) {
  const result = resolved.get(row.word);
  if (!result?.phonetic) {
    report.unresolvedWords.push(row.word);
    continue;
  }

  const { error } = await supabase
    .from("study_words")
    .update({ phonetic: result.phonetic })
    .eq("id", row.id);

  if (error) throw error;
  report.updatedRows += 1;

  if (report.sample.length < 25) {
    report.sample.push({
      word: row.word,
      phonetic: result.phonetic,
      source: result.source,
      candidate: result.candidate,
    });
  }
}

const refreshedWords = await fetchAll("study_words", "id,phonetic,unit_id", (query) =>
  query.in("unit_id", unitIds)
);
report.missingAfter = refreshedWords.filter(
  (word) => !word.phonetic || !String(word.phonetic).trim()
).length;

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
