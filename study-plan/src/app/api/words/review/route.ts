import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getLocalReviewedWord } from "@/lib/local-english-backup";
import { sm2 } from "@/lib/sm2";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { word_id, quality } = body;
  if (!word_id || quality === undefined) {
    return NextResponse.json({ error: "需要word_id和quality" }, { status: 400 });
  }

  const { data: word, error } = await supabase
    .from("study_words")
    .select("interval, repetitions, ease_factor")
    .eq("id", word_id)
    .single();

  if (error || !word) {
    const localReviewedWord = await getLocalReviewedWord(word_id, quality);
    if (localReviewedWord) return NextResponse.json(localReviewedWord);
    return NextResponse.json({ error: "单词不存在" }, { status: 404 });
  }

  const result = sm2({
    interval: word.interval,
    repetitions: word.repetitions,
    ease_factor: word.ease_factor,
    quality,
  });

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  await supabase
    .from("study_words")
    .update({
      interval: result.interval,
      repetitions: result.repetitions,
      ease_factor: result.ease_factor,
      next_review: result.next_review,
      last_review: now,
      mastered: result.mastered,
    })
    .eq("id", word_id);

  const { data: updated } = await supabase
    .from("study_words")
    .select("*")
    .eq("id", word_id)
    .single();

  return NextResponse.json(updated);
}
