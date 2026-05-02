import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "word", "phonetic", "meaning", "example", "mastered",
    "interval", "repetitions", "ease_factor", "next_review",
    "audio_start", "audio_end",
  ];

  const updateData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updateData[key] = typeof body[key] === "string" ? body[key].trim() : body[key];
    }
  }

  if (Object.keys(updateData).length > 0) {
    await supabase.from("study_words").update(updateData).eq("id", id);
  }

  const { data: updated } = await supabase
    .from("study_words")
    .select("*")
    .eq("id", id)
    .single();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await supabase.from("study_words").delete().eq("id", id);
  return NextResponse.json({ deleted: true });
}
