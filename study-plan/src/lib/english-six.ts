export type SixStage = "listen" | "explain" | "practice" | "targeted" | "test" | "advanced" | "teacher" | "reference";
export type SixEdition = "new" | "legacy";
export type SixCollection = "units" | "books" | "exams";
export const englishSixCollections: { id: SixCollection; label: string }[] = [
  { id: "units", label: "单元学习" }, { id: "books", label: "整册与综合" }, { id: "exams", label: "期中期末" },
];
export const englishSixStages: { id: SixStage; label: string }[] = [
  { id: "listen", label: "课本听读" }, { id: "explain", label: "知识讲解" },
  { id: "practice", label: "基础练习" }, { id: "targeted", label: "专项巩固" },
  { id: "test", label: "单元测评" }, { id: "advanced", label: "提优拓展" },
  { id: "reference", label: "参考答案" }, { id: "teacher", label: "教案课件" },
];
export type SixResource = {
  id: string; title: string; edition: SixEdition; units: number[]; stage: SixStage;
  extension: string; size: number; pageCount: number; paths: string[];
  status: "ready" | "needs-ocr" | "download-only" | "import-error"; missingPages?: number[];
  unitStarts?: Record<string, number>;
  practice?: { type: "bank" | "assessment"; sourceId: string; questionCount: number; unit?: number };
};
export type EnglishSixIndex = {
  version: number; units: { number: number; title: string; legacyTitle: string }[];
  resources: SixResource[];
  summary: { sourceFiles: number; includedFiles: number; uniqueResources: number; practiceQuestions: number; statuses: Record<string, number>; assetBytes: number };
};
export type SixRun = { text: string; underline?: boolean };
export type SixBlock = { kind: "text"; text: string; runs?: SixRun[] } |
  { kind: "table"; rows: string[][] } | { kind: "image" | "audio" | "video"; asset: string; reference?: boolean };
export type SixPage = { title: string; blocks: SixBlock[]; ocr?: boolean };
export type SixQuestion = {
  id: string; topic: string; kind: "choice" | "judgment" | "fill" | "sentence" | "writing";
  prompt: string; context: string; options: { id: string; text: string; runs?: SixRun[] }[];
  promptRuns?: SixRun[];
  inputCount?: number;
  grading?: "exact" | "reference";
};
export type SixFeedback = { id: string; answer: string; explanation: string; correct: boolean | null; response: string };
export type SixPaper = { unit: number; sourceId: string; title: string; questions: SixQuestion[] };

export function englishSixAccuracy(results: Record<string, SixFeedback>) {
  const graded = Object.values(results).filter(r => r.correct !== null);
  const correct = graded.filter(r => r.correct).length;
  return { answered: Object.keys(results).length, graded: graded.length, correct,
    accuracy: graded.length ? Math.round(correct / graded.length * 100) : null };
}

function namedUnits(text: string) {
  const units = new Set<number>();
  for (const match of text.matchAll(/(?:unit|u)[\s_-]*([1-8])(?!\d)\s*(?:-|–|—|~|～|至|到)\s*(?:(?:unit|u)[\s_-]*)?([1-8])(?!\d)/gi)) {
    const start = Number(match[1]), end = Number(match[2]);
    if (start <= end) for (let n = start; n <= end; n++) units.add(n);
  }
  for (const match of text.matchAll(/(?:unit|u)[\s_-]*([1-8])(?!\d)/gi)) units.add(Number(match[1]));
  for (const match of text.matchAll(/第?([一二三四五六七八1-8])\s*单元/g)) {
    units.add(Number(match[1]) || "一二三四五六七八".indexOf(match[1]) + 1);
  }
  return [...units].sort((a, b) => a - b);
}

type ResourceScope = { collection: SixCollection; units: number[]; label: string; period: "midterm" | "final" | "both" | null };
const scopes = new WeakMap<SixResource, ResourceScope>();
export function englishSixResourceScope(resource: SixResource): ResourceScope {
  const cached = scopes.get(resource);
  if (cached) return cached;
  const names = resource.paths.map(p => p.split(/[\\/]/).at(-1) ?? "");
  // Individual filenames take precedence over batch folders and noisy OCR chapter markers.
  let units = [...new Set(names.flatMap(namedUnits))].sort((a, b) => a - b);
  const title = names.join(" ");
  let periodText = title;
  if (!units.length) {
    const parents = resource.paths.map(p => p.split(/[\\/]/).slice(0, -1).reverse());
    units = [...new Set(parents.flatMap(parts => parts.map(namedUnits).find(u => u.length) ?? []))].sort((a, b) => a - b);
    if (!/期中|期末|mid[\s-]?term|final/i.test(title)) {
      periodText = parents.map(parts => parts.find(p => /期中|期末|mid[\s-]?term|final/i.test(p)) ?? "").join(" ");
    }
    if (!units.length) {
      const chapters = Object.keys(resource.unitStarts ?? {}).map(Number).filter(n => n >= 1 && n <= 8);
      units = resource.units.length > 1 ? [...resource.units] : chapters.length > 1 ? chapters.sort((a, b) => a - b) : [...resource.units];
      if (/电子课本|听读手册|背记手册/.test(`${title} ${resource.paths.join(" ")}`)) units = [1,2,3,4,5,6,7,8];
    }
  }
  const midterm = /期中|mid[\s-]?term/i.test(periodText), final = /期末|final/i.test(periodText);
  const period: ResourceScope["period"] = midterm && final ? "both" : midterm ? "midterm" : final ? "final" : null;
  const collection: SixCollection = period ? "exams" : units.length === 1 ? "units" : "books";
  const range = units.length ? units.length === 1 ? `Unit ${units[0]}` :
    units.every((n, i) => n === units[0] + i) ? `Unit ${units[0]}–${units.at(-1)}` : units.map(n => `U${n}`).join(" / ") : "综合资料";
  const label = period ? midterm && final ? "期中 / 期末" : midterm ? "期中" : "期末" :
    units.length === 8 ? `整册 · ${range}` : units.length > 1 ? `跨单元 · ${range}` : range;
  const scope = { collection, units, label, period };
  scopes.set(resource, scope);
  return scope;
}

export function englishSixResourceStage(resource: SixResource): SixStage {
  const source = `${resource.title} ${resource.paths[0]}`;
  if (/教学计划/.test(source)) return "teacher";
  if (/电子课本|听读手册|背记手册/.test(source)) return "listen";
  if (/资料简介|听力扫码|更新全册资料/.test(source)) return "reference";
  if (/知识点总结/.test(source)) return "explain";
  return resource.stage;
}

export function englishSixResourceTitle(resource: SixResource) {
  return resource.title.replace(/unit[\s_-]*([1-8])(?!\d)\s*/gi, "Unit $1 ").trim();
}

export function englishSixResources(index: EnglishSixIndex, edition: SixEdition, unit: number | null, stage: SixStage | "all", search = "", collection?: SixCollection, period: "all" | "midterm" | "final" = "all") {
  const query = search.trim().toLowerCase();
  return index.resources.filter(r => {
    const scope = englishSixResourceScope(r);
    return r.edition === edition && (!collection || scope.collection === collection) &&
      (unit === null || scope.collection === "units" && scope.units[0] === unit) &&
      (period === "all" || scope.period === period || scope.period === "both") &&
      (stage === "all" || englishSixResourceStage(r) === stage) &&
      (!query || `${englishSixResourceTitle(r)} ${scope.label} ${r.paths.join(" ")}`.toLowerCase().includes(query));
  }).sort((a, b) => englishSixStages.findIndex(s => s.id === englishSixResourceStage(a)) - englishSixStages.findIndex(s => s.id === englishSixResourceStage(b)) ||
    englishSixResourceTitle(a).localeCompare(englishSixResourceTitle(b), "zh-Hans-CN", { numeric: true }));
}
