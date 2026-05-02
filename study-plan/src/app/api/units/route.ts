import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { subject_id, name } = body;
  if (!subject_id || !name?.trim()) {
    return NextResponse.json({ error: "学科ID和名称不能为空" }, { status: 400 });
  }

  const { data: maxRow } = await supabase
    .from("study_units")
    .select("sort_order")
    .eq("subject_id", subject_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxRow?.sort_order ?? 0;
  const id = uuid();

  const { data: unit, error } = await supabase
    .from("study_units")
    .insert({ id, subject_id, name: name.trim(), sort_order: maxOrder + 1 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(unit, { status: 201 });
}
