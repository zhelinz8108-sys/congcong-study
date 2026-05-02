/**
 * Migrate data from SQLite to Supabase
 * Run: node migrate-data.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const data = JSON.parse(readFileSync("/tmp/study-plan-data.json", "utf-8"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function migrate() {
  console.log(`Migrating: ${data.subjects.length} subjects, ${data.units.length} units, ${data.words.length} words, ${data.materials.length} materials`);

  // 1. Subjects
  console.log("Inserting subjects...");
  const { error: sErr } = await supabase.from("study_subjects").upsert(data.subjects);
  if (sErr) console.error("Subjects error:", sErr.message);
  else console.log(`  ✓ ${data.subjects.length} subjects`);

  // 2. Units (batch 500)
  console.log("Inserting units...");
  for (let i = 0; i < data.units.length; i += 500) {
    const batch = data.units.slice(i, i + 500);
    const { error } = await supabase.from("study_units").upsert(batch);
    if (error) console.error(`  Units batch ${i} error:`, error.message);
  }
  console.log(`  ✓ ${data.units.length} units`);

  // 3. Words (batch 500)
  console.log("Inserting words...");
  for (let i = 0; i < data.words.length; i += 500) {
    const batch = data.words.slice(i, i + 500);
    const { error } = await supabase.from("study_words").upsert(batch);
    if (error) console.error(`  Words batch ${i} error:`, error.message);
    process.stdout.write(`  ${Math.min(i + 500, data.words.length)}/${data.words.length}\r`);
  }
  console.log(`  ✓ ${data.words.length} words`);

  // 4. Materials (batch 500)
  console.log("Inserting materials...");
  for (let i = 0; i < data.materials.length; i += 500) {
    const batch = data.materials.slice(i, i + 500);
    const { error } = await supabase.from("study_materials").upsert(batch);
    if (error) console.error(`  Materials batch ${i} error:`, error.message);
  }
  console.log(`  ✓ ${data.materials.length} materials`);

  console.log("\nDone! Data migrated to Supabase.");
}

migrate().catch(console.error);
