import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getLocalUnitContent } from "@/lib/local-english-backup";
import { getSentenceText } from "@/lib/sentences";

type Params = { params: Promise<{ id: string }> };

/** Returns { unit, words, materials, sentenceText } for a single unit */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  // Fetch unit, words, and materials in parallel
  const [unitResult, wordsResult, materialsResult] = await Promise.all([
    supabase
      .from("study_units")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("study_words")
      .select("*")
      .eq("unit_id", id)
      .order("sort_order"),
    supabase
      .from("study_materials")
      .select("*")
      .eq("unit_id", id)
      .order("sort_order"),
  ]);

  if (unitResult.error || !unitResult.data) {
    const localContent = await getLocalUnitContent(id);
    if (localContent) return NextResponse.json(localContent);
    return NextResponse.json({ error: "未找到单元" }, { status: 404 });
  }

  const unit = unitResult.data;
  const words = wordsResult.data ?? [];
  const materials = materialsResult.data ?? [];
  const sentenceText = getSentenceText(unit.name, unit.group_name);

  return NextResponse.json({ unit, words, materials, sentenceText });
}
