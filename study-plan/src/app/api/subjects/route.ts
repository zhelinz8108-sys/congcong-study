import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getLocalSubjectsWithCounts } from "@/lib/local-english-backup";
import type { Subject } from "@/lib/types";

const STATIC_SUBJECT_COUNTS: Record<string, { unit_count: number; material_count: number }> = {
  数学: { unit_count: 165, material_count: 0 },
};

export async function GET() {
  try {
    const { data: subjects, error } = await supabase
      .from("study_subjects")
      .select("*")
      .order("sort_order")
      .order("created_at");

    if (error) {
      const fallback = await getLocalSubjectsWithCounts();
      if (fallback.length > 0) return NextResponse.json(fallback);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const [unitRows, materialRows] = await Promise.all([
      fetchAllRows<{ id: string; subject_id: string }>((from, to) =>
        supabase
          .from("study_units")
          .select("id, subject_id")
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<{ id: string; unit_id: string }>((from, to) =>
        supabase
          .from("study_materials")
          .select("id, unit_id")
          .order("id")
          .range(from, to)
      ),
    ]);

    const unitCounts = new Map<string, number>();
    const materialCounts = new Map<string, number>();
    const unitSubjectById = new Map<string, string>();

    for (const unit of unitRows) {
      unitSubjectById.set(unit.id, unit.subject_id);
      unitCounts.set(unit.subject_id, (unitCounts.get(unit.subject_id) ?? 0) + 1);
    }

    for (const material of materialRows) {
      const subjectId = unitSubjectById.get(material.unit_id);
      if (!subjectId) continue;
      materialCounts.set(subjectId, (materialCounts.get(subjectId) ?? 0) + 1);
    }

    const result = ((subjects ?? []) as Subject[]).map((subject) => ({
      ...subject,
      unit_count:
        unitCounts.get(subject.id) ??
        STATIC_SUBJECT_COUNTS[subject.name]?.unit_count ??
        0,
      material_count:
        materialCounts.get(subject.id) ??
        STATIC_SUBJECT_COUNTS[subject.name]?.material_count ??
        0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    const fallback = await getLocalSubjectsWithCounts();
    if (fallback.length > 0) return NextResponse.json(fallback);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TypeError: fetch failed" },
      { status: 500 }
    );
  }
}
