import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getLocalSubjectResponse } from "@/lib/local-english-backup";
import { getSentenceText } from "@/lib/sentences";
import type { Material, Unit, Word } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    unique.set(row.id, row);
  }
  return [...unique.values()];
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const metaOnly = req.nextUrl.searchParams.get("meta") === "1";
  const summaryOnly = req.nextUrl.searchParams.get("summary") === "1";
  const includeUnits = req.nextUrl.searchParams.get("include_units") === "1";

  const { data: subject, error } = await supabase
    .from("study_subjects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !subject) {
    const localSubject = await getLocalSubjectResponse(id, {
      metaOnly,
      summaryOnly,
      includeUnits,
    });
    if (localSubject) return NextResponse.json(localSubject);
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }

  if (metaOnly) {
    return NextResponse.json(subject);
  }

  const now = new Date().toISOString();

  if (summaryOnly) {
    if (!includeUnits) {
      const [unitCountResult, wordCountResult, dueCountResult, masteredCountResult] =
        await Promise.all([
          supabase
            .from("study_units")
            .select("*", { count: "exact", head: true })
            .eq("subject_id", id),
          supabase
            .from("study_words")
            .select("*", { count: "exact", head: true })
            .eq("subject_id", id),
          supabase
            .from("study_words")
            .select("*", { count: "exact", head: true })
            .eq("subject_id", id)
            .lte("next_review", now),
          supabase
            .from("study_words")
            .select("*", { count: "exact", head: true })
            .eq("subject_id", id)
            .gte("mastered", 1),
        ]);

      return NextResponse.json({
        ...subject,
        units: [],
        unit_count: unitCountResult.count ?? 0,
        totalWords: wordCountResult.count ?? 0,
        dueCount: dueCountResult.count ?? 0,
        masteredCount: masteredCountResult.count ?? 0,
      });
    }

    const [wordStats, unitRows] = await Promise.all([
      fetchAllRows<{ id: string; unit_id: string | null; next_review: string; mastered: number }>(
        (from, to) =>
          supabase
            .from("study_words")
            .select("id, unit_id, next_review, mastered")
            .eq("subject_id", id)
            .order("sort_order")
            .order("created_at")
            .order("id")
            .range(from, to)
      ),
      includeUnits
        ? fetchAllRows<Unit>((from, to) =>
            supabase
              .from("study_units")
              .select("*")
              .eq("subject_id", id)
              .order("sort_order")
              .order("created_at")
              .order("id")
              .range(from, to)
          )
        : Promise.resolve([] as Unit[]),
    ]);

    const wordCountByUnit = new Map<string, number>();
    let dueCount = 0;
    let masteredCount = 0;

    for (const word of wordStats) {
      if (word.unit_id) {
        wordCountByUnit.set(word.unit_id, (wordCountByUnit.get(word.unit_id) ?? 0) + 1);
      }
      if (word.next_review <= now) {
        dueCount += 1;
      }
      if (word.mastered >= 1) {
        masteredCount += 1;
      }
    }

    const units = includeUnits
      ? unitRows.map((unit) => ({
          ...unit,
          word_count: wordCountByUnit.get(unit.id) ?? 0,
        }))
      : [];

    return NextResponse.json({
      ...subject,
      units,
      unit_count: unitRows.length,
      totalWords: wordStats.length,
      dueCount,
      masteredCount,
    });
  }

  // Fetch units and all related words/materials in parallel so subject pages
  // can render complete study content without extra round trips.

  const unitPromise = fetchAllRows<Unit>((from, to) =>
    supabase
      .from("study_units")
      .select("*")
      .eq("subject_id", id)
      .order("sort_order")
      .order("created_at")
      .order("id")
      .range(from, to)
  );

  const wordPromise = fetchAllRows<Word>((from, to) =>
    supabase
      .from("study_words")
      .select("*")
      .eq("subject_id", id)
      .order("sort_order")
      .order("created_at")
      .order("id")
      .range(from, to)
  );

  const [units, words] = await Promise.all([unitPromise, wordPromise]);

  const unitIds = units.map((u) => u.id);
  const materials: Material[] = [];
  for (let i = 0; i < unitIds.length; i += 200) {
    const chunk = unitIds.slice(i, i + 200);
    if (chunk.length === 0) continue;
    const { data } = await supabase
      .from("study_materials")
      .select("*")
      .in("unit_id", chunk)
      .order("sort_order")
      .order("created_at")
      .order("id");
    if (data?.length) materials.push(...data);
  }

  const wordsByUnit = new Map<string, Word[]>();
  for (const w of dedupeById(words)) {
    if (!w.unit_id) continue;
    if (!wordsByUnit.has(w.unit_id)) wordsByUnit.set(w.unit_id, []);
    wordsByUnit.get(w.unit_id)!.push(w);
  }

  const materialsByUnit = new Map<string, Material[]>();
  for (const m of dedupeById(materials)) {
    if (!materialsByUnit.has(m.unit_id)) materialsByUnit.set(m.unit_id, []);
    materialsByUnit.get(m.unit_id)!.push(m);
  }

  const uniqueWords = dedupeById(words);
  const dueCount = uniqueWords.filter((w) => w.next_review <= now).length;
  const masteredCount = uniqueWords.filter((w) => w.mastered >= 1).length;
  const totalWords = uniqueWords.length;

  const unitsWithCounts = units.map((u) => {
    const unitWords = [...(wordsByUnit.get(u.id) ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });
    const unitMaterials = [...(materialsByUnit.get(u.id) ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    });
    const sentenceText = getSentenceText(u.name, u.group_name);
    const fallbackEnglish =
      unitMaterials.find((m) => m.file_type === "audio" && m.name)?.name ?? "";

    return {
      ...u,
      words: unitWords,
      materials: unitMaterials,
      word_count: unitWords.length,
      sentenceText:
        sentenceText ??
        (fallbackEnglish
          ? {
              english: fallbackEnglish,
              chinese: "",
            }
          : null),
    };
  });

  return NextResponse.json({
    ...subject,
    units: unitsWithCounts,
    dueCount,
    totalWords,
    masteredCount,
  });
}
