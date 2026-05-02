import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { unit_id, name, file_path, file_type = "other", file_size = 0 } = body;
  if (!unit_id || !name?.trim()) {
    return NextResponse.json({ error: "单元ID和名称不能为空" }, { status: 400 });
  }

  const { data: maxRow } = await supabase
    .from("study_materials")
    .select("sort_order")
    .eq("unit_id", unit_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const maxOrder = maxRow?.sort_order ?? 0;
  const id = uuid();

  const { data: material, error } = await supabase
    .from("study_materials")
    .insert({
      id,
      unit_id,
      name: name.trim(),
      file_path: file_path ?? null,
      file_type,
      file_size,
      sort_order: maxOrder + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(material, { status: 201 });
}
