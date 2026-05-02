import { NextRequest, NextResponse } from "next/server";

type DictionaryEntry = {
  phonetic?: string;
  phonetics?: { text?: string }[];
};

type DatamuseEntry = {
  word?: string;
  score?: number;
  tags?: string[];
};

const ARPABET_TO_IPA: Record<string, string> = {
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

function normalizeWord(word: string) {
  return word.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function canonicalWord(word: string) {
  return normalizeWord(word).replace(/[^a-z]/g, "");
}

function buildCandidates(word: string) {
  const base = word.trim().toLowerCase();
  const normalized = normalizeWord(base);
  const candidates = new Set<string>([base, normalized]);
  if (normalized.includes("-")) {
    candidates.add(normalized.replace(/-/g, " "));
    candidates.add(normalized.replace(/-/g, ""));
  }
  return [...candidates].filter(Boolean);
}

async function fetchDictionaryPhonetic(word: string) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { signal: AbortSignal.timeout(3000) }
  );
  if (!res.ok) return "";

  const data = (await res.json()) as DictionaryEntry[];
  return (
    data?.[0]?.phonetic ||
    data?.[0]?.phonetics?.find((phonetic) => phonetic.text)?.text ||
    ""
  );
}

function convertArpabetToIpa(pronunciation: string) {
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

function pickDatamusePronunciation(input: string, entries: DatamuseEntry[]) {
  const inputCanonical = canonicalWord(input);
  const ranked = entries
    .map((entry) => {
      const pronunciation = entry.tags?.find((tag) => tag.startsWith("pron:"))?.slice(5).trim();
      if (!entry.word || !pronunciation) return null;
      const exactCanonicalMatch = canonicalWord(entry.word) === inputCanonical ? 1000 : 0;
      return {
        entry,
        pronunciation,
        rank: exactCanonicalMatch + (entry.score ?? 0),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.rank - a.rank);

  return ranked[0]?.pronunciation ?? "";
}

async function fetchDatamusePhonetic(word: string) {
  const res = await fetch(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=r&max=8`,
    { signal: AbortSignal.timeout(3000) }
  );
  if (!res.ok) return "";

  const data = (await res.json()) as DatamuseEntry[];
  const arpabet = pickDatamusePronunciation(word, data);
  return arpabet ? convertArpabetToIpa(arpabet) : "";
}

async function resolvePhonetic(word: string) {
  for (const candidate of buildCandidates(word)) {
    try {
      const phonetic = await fetchDictionaryPhonetic(candidate);
      if (phonetic) return phonetic;
    } catch {
      // Fall back to the next source.
    }
  }

  for (const candidate of buildCandidates(word)) {
    try {
      const phonetic = await fetchDatamusePhonetic(candidate);
      if (phonetic) return phonetic;
    } catch {
      // Ignore and keep trying fallbacks.
    }
  }

  return "";
}

export async function GET(req: NextRequest) {
  const word = req.nextUrl.searchParams.get("word");
  if (!word) return NextResponse.json({ phonetic: "" });

  const phonetic = await resolvePhonetic(word);
  return NextResponse.json({ phonetic });
}
