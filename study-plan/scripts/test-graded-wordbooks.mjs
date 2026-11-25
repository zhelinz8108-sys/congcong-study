import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { checkGradedWordbooks } from "./check-graded-wordbooks.mjs";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const connectionString = process.env.WORDBOOK_TEST_DATABASE_URL;
assert.ok(connectionString, "Provide an isolated PostgreSQL test database in WORDBOOK_TEST_DATABASE_URL");
const db = new Client({ connectionString });
const schema = "wordbook_test_" + randomBytes(8).toString("hex");
const migration = await readFile(new URL("./graded-wordbooks.sql", import.meta.url), "utf8");
const structure = await readFile(new URL("../supabase/migration.sql", import.meta.url), "utf8");
const { gradedUnitsFromBackup } = await loadHolidayTestModule("src/lib/graded-wordbooks.ts");
const subject = "8bd6f79b-99f5-4e68-a961-872d60d260b1";
const books = ["新东方小学1200词", "新东方初中2000词", "新东方高中7000词"];
await db.connect();
try {
  await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  await db.query(structure.slice(0, structure.indexOf("CREATE TABLE IF NOT EXISTS study_materials")));
  await db.query("INSERT INTO study_subjects(id,name) VALUES ($1,'英语'), ('elsewhere','另一学科')", [subject]);
  for (const [id, group, order, owner] of [
    ["z", books[2], 1, subject], ["j", books[1], 2, subject], ["p2", books[0], 12, subject],
    ["p1", books[0], 11, subject], ["school", "学校百词", 0, subject], ["other", books[1], 0, "elsewhere"],
  ]) {
    await db.query("INSERT INTO study_units(id,subject_id,name,group_name,sort_order) VALUES ($1,$2,$1,$3,$4)", [id,owner,group,order]);
  }
  for (const [unit, id, word, meaning] of [
    ["z","high"," STUDY ","研究"], ["j","mid","study","学习"], ["j","grow","grow","生长"],
    ["j","phrase-late","take   off","起飞"], ["p2","local-repeat","Study","书房"], ["p1","first","study","学习"],
    ["p1","phrase","Take off","起飞"], ["z","growing","growing","增长的"], ["school","extra","study","学习"],
    ["z","older-winner","FIRSTHAND","第一手的"], ["p1","early-empty","Book",""], ["j","meaning","BOOK","书"],
    ["other","other-id","study","学习"], ["p1","apostrophe","don't","不要"],
    ["z","curly","ＤＯＮ’Ｔ","不要"], ["p2","second-phrase","take    off","起飞"],
  ]) {
    await db.query("INSERT INTO study_words(id,unit_id,subject_id,word,meaning,audio_start) SELECT $1,id,subject_id,$3,$4,4.5 FROM study_units WHERE id=$2", [id,unit,word,meaning]);
  }
  await db.query("UPDATE study_words SET last_review='2026-11-10',mastered=1,repetitions=4,interval=9 WHERE id='high'");
  const raw = async (relation) => {
    const { rows: units } = await db.query("SELECT * FROM study_units WHERE subject_id=$1", [subject]);
    const { rows: words } = await db.query(`SELECT * FROM ${relation} WHERE subject_id=$1`, [subject]);
    return units.map(unit => ({...unit, words: words.filter(word => word.unit_id === unit.id)}));
  };
  const backup = gradedUnitsFromBackup(await raw("study_words"));
  await db.query(migration);
  await db.query(migration);
  const { rows: active } = await db.query("SELECT * FROM study_vocabulary_words WHERE subject_id=$1", [subject]);
  const source = await raw("study_sentence_words");
  const summaries = (await raw("study_words")).map(unit => ({...unit,word_count:unit.words.length}));
  assert.deepEqual(checkGradedWordbooks(source, active, summaries).map(report => report.removed), [2,3,2]);
  assert.deepEqual(active.map(w => w.id).sort(), backup.flatMap(u => u.words.map(w => w.id)).sort());
  const first = active.find(w => w.id === "first");
  assert.deepEqual([...first.previous_word_ids].sort(), ["high","local-repeat","mid"]);
  assert.equal(first.repetitions, 4);
  assert.equal(first.meaning, "学习");
  assert.equal(active.find(w => w.id === "early-empty").meaning, "书");
  assert.equal(source.flatMap(u => u.words).find(w => w.id === "high").audio_start, 4.5);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM study_words WHERE id IN ('extra','other-id','grow','growing')")).rows[0].n, 4);
  await db.query("INSERT INTO study_words(id,subject_id,unit_id,word,meaning) VALUES ('upper',$1,'j','Firsthand','直接的')", [subject]);
  await db.query(migration);
  await db.query("INSERT INTO study_words(id,subject_id,unit_id,word,meaning) VALUES ('earliest',$1,'p1','firsthand','第一手的')", [subject]);
  await db.query(migration);
  const aliases = (await db.query("SELECT previous_word_ids FROM study_vocabulary_words WHERE id='earliest'")).rows[0];
  assert.deepEqual(aliases.previous_word_ids, ["older-winner","upper"]);
  console.log("Three-book precedence, local duplicates, higher-grade-only spellings, source audio, old progress, aliases, unrelated books and repeat runs passed.");
} finally {
  await db.query("ROLLBACK");
  await db.query(`DROP SCHEMA ${schema} CASCADE`);
  await db.end();
}
