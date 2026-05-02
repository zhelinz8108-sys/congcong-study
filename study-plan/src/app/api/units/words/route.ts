import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import type { Material, Word } from "@/lib/types";

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    unique.set(row.id, row);
  }
  return [...unique.values()];
}

/** Load words and materials for a list of unit IDs */
export async function POST(req: NextRequest) {
  const { unit_ids } = await req.json();
  if (!Array.isArray(unit_ids) || unit_ids.length === 0) {
    return NextResponse.json({ error: "需要unit_ids数组" }, { status: 400 });
  }

  // Fetch words and materials for these units in parallel
  const fetchAll = async <T extends Word | Material>(
    table: "study_words" | "study_materials",
    col: string,
    ids: string[],
    select = "*"
  ): Promise<T[]> => {
    const rows: T[] = [];
    // Supabase IN filter has limits, batch by 100
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from(table)
          .select(select)
          .in(col, batch)
          .order("sort_order")
          .order("created_at")
          .order("id")
          .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        rows.push(...(data as unknown as T[]));
        if (data.length < 1000) break;
        offset += 1000;
      }
    }
    return rows;
  };

  const [words, materials] = await Promise.all([
    fetchAll<Word>("study_words", "unit_id", unit_ids),
    fetchAll<Material>("study_materials", "unit_id", unit_ids),
  ]);

  // Group by unit_id
  const wordsByUnit: Record<string, Word[]> = {};
  for (const w of dedupeById(words)) {
    if (!w.unit_id) continue;
    if (!wordsByUnit[w.unit_id]) wordsByUnit[w.unit_id] = [];
    wordsByUnit[w.unit_id].push(w);
  }
  const materialsByUnit: Record<string, Material[]> = {};
  for (const m of dedupeById(materials)) {
    if (!materialsByUnit[m.unit_id]) materialsByUnit[m.unit_id] = [];
    materialsByUnit[m.unit_id].push(m);
  }

  return NextResponse.json({ wordsByUnit, materialsByUnit });
}
