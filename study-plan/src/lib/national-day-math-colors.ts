// Stable chapter colors: all surfaces stay light; only readable ink is dark.
export const NATIONAL_DAY_MATH_PALETTES = {
  blue: { id: "blue", accent: "#235a91", soft: "#f5f9ff", tint: "#edf6ff", border: "#cfe2f5", marker: "#8fbbe9", practiceSoft: "#fff7ed", practiceAccent: "#92551d", practiceBorder: "#f0ddc6" },
  violet: { id: "violet", accent: "#6e469a", soft: "#faf7ff", tint: "#f5efff", border: "#e1d3f1", marker: "#b6a0d4", practiceSoft: "#fff6ef", practiceAccent: "#92551d", practiceBorder: "#f0ddc6" },
  apricot: { id: "apricot", accent: "#93581d", soft: "#fffbf4", tint: "#fff4e5", border: "#f0ddc1", marker: "#e5bb80", practiceSoft: "#eff8f2", practiceAccent: "#2b7155", practiceBorder: "#cfe7d6" },
  mint: { id: "mint", accent: "#2b7155", soft: "#f6fbf7", tint: "#edf8f0", border: "#cfe7d6", marker: "#92c7a7", practiceSoft: "#fff7ed", practiceAccent: "#92551d", practiceBorder: "#f0ddc6" },
  rose: { id: "rose", accent: "#a54465", soft: "#fff7fa", tint: "#fff0f5", border: "#f0d3de", marker: "#dfa0b7", practiceSoft: "#f7f2ff", practiceAccent: "#6e469a", practiceBorder: "#e1d3f1" },
  indigo: { id: "indigo", accent: "#5057a0", soft: "#f8f8ff", tint: "#f0f2ff", border: "#d9dcf5", marker: "#a6acde", practiceSoft: "#fff5f0", practiceAccent: "#984b39", practiceBorder: "#efd8cf" },
} as const;

export const NATIONAL_DAY_MATH_SECTION_COLORS = {
  overview: "blue", plan: "apricot", prerequisite: "violet", diagnostic: "mint",
  day1: "apricot", u1: "blue", u2: "violet", segmented: "apricot", u3: "mint", binary: "rose",
  day2: "mint", u4: "apricot", golden: "rose", u5: "violet", sports: "mint",
  day3: "rose", u6: "rose", u7: "blue", comprehensive: "indigo", review: "mint", checklist: "apricot",
} as const satisfies Record<string, keyof typeof NATIONAL_DAY_MATH_PALETTES>;

export function getNationalDayMathPalette(sectionId: string) {
  const name = NATIONAL_DAY_MATH_SECTION_COLORS[sectionId as keyof typeof NATIONAL_DAY_MATH_SECTION_COLORS] ?? "blue";
  return NATIONAL_DAY_MATH_PALETTES[name];
}
