import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  if (body.name !== undefined) {
    await supabase
      .from("study_units")
      .update({ name: body.name.trim() })
      .eq("id", id);
  }

  const { data: updated } = await supabase
    .from("study_units")
    .select("*")
    .eq("id", id)
    .single();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await supabase.from("study_units").delete().eq("id", id);
  return NextResponse.json({ deleted: true });
}
