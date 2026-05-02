import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getLocalWords } from "@/lib/local-english-backup";
import type { Word } from "@/lib/types";
import { v4 as uuid } from "uuid";

export async function GET(req: NextRequest) {
  const subjectId = req.nextUrl.searchParams.get("subject_id");
  if (!subjectId) return NextResponse.json({ error: "需要subject_id" }, { status: 400 });

  let words: Word[] = [];
  try {
    words = await fetchAllRows<Word>((from, to) =>
      supabase
        .from("study_words")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    );
  } catch (error) {
    const localWords = await getLocalWords(subjectId);
    if (localWords) {
      const now = Date.now();
      const dueCount = localWords.filter((word) => {
        if (!word.next_review) return true;
        const time = new Date(word.next_review.replace(" ", "T")).getTime();
        return Number.isNaN(time) || time <= now;
      }).length;
      return NextResponse.json({ words: localWords, dueCount });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch words" },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const { count: dueCount } = await supabase
    .from("study_words")
    .select("*", { count: "exact", head: true })
    .eq("subject_id", subjectId)
    .lte("next_review", now);

  return NextResponse.json({ words, dueCount: dueCount ?? 0 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { subject_id, unit_id = null, word, phonetic = "", meaning = "", example = "" } = body;
  if (!subject_id || !word?.trim()) {
    return NextResponse.json({ error: "学科ID和单词不能为空" }, { status: 400 });
  }

  const { data: maxRow } = await supabase
    .from("study_words")
    .select("sort_order")
    .eq("subject_id", subject_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxRow?.sort_order ?? 0;
  const id = uuid();

  const { data: created, error } = await supabase
    .from("study_words")
    .insert({
      id,
      subject_id,
      unit_id,
      word: word.trim(),
      phonetic: phonetic.trim(),
      meaning: meaning.trim(),
      example: example.trim(),
      sort_order: maxOrder + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(created, { status: 201 });
}
