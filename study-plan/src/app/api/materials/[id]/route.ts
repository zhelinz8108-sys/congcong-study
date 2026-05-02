import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await supabase.from("study_materials").delete().eq("id", id);
  return NextResponse.json({ deleted: true });
}
