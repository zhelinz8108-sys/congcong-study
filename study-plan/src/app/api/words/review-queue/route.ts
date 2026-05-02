import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getLocalDueWords } from "@/lib/local-english-backup";

export async function GET(req: NextRequest) {
  const subjectId = req.nextUrl.searchParams.get("subject_id");
  if (!subjectId) {
    return NextResponse.json({ error: "需要subject_id" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Get due words ordered by most overdue first
  const { data: words, error } = await supabase
    .from("study_words")
    .select("*")
    .eq("subject_id", subjectId)
    .lte("next_review", now)
    .order("next_review", { ascending: true })
    .limit(1000);

  if (error) {
    const localWords = await getLocalDueWords(subjectId, 1000);
    if (localWords) {
      return NextResponse.json({
        words: localWords,
        dueCount: localWords.length,
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    words: words ?? [],
    dueCount: words?.length ?? 0,
  });
}
