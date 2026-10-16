import "server-only";
import { pool } from "@/lib/db";
import type { PoolClient } from "pg";
import { getSentenceText } from "@/lib/sentences";
import { buildListeningQuestionsForBand, LISTENING_BANDS, type ListeningUnit } from "@/lib/english-listening-bank";
import type { Material, Word } from "@/lib/types";
import type { EnglishLockedAnswer, EnglishLockedFeedback } from "@/lib/english-locked-types";

/** Rebuild deterministic questions from canonical DB content, never client answer keys. */
export async function gradeListeningPanelLocked(id: string, response: EnglishLockedAnswer, database: Pick<PoolClient, "query"> = pool): Promise<EnglishLockedFeedback> {
  const match = /^(primary|junior)-(main|detail|inference)-([a-f0-9-]{36})-(\d{1,3})$/i.exec(id);
  if (!match || Number(match[4]) >= 500 || typeof response !== "string" || !response.trim() || response.length > 2000) throw new Error("题目或选项不正确");
  const unitRow = await database.query("SELECT subject_id FROM study_units WHERE id=$1", [match[3]]);
  if (!unitRow.rows[0]) throw new Error("题目不存在");
  const subject = unitRow.rows[0].subject_id;
  const [unitRows, wordRows, materialRows] = await Promise.all([
    database.query("SELECT * FROM study_units WHERE subject_id=$1 ORDER BY sort_order, created_at, id", [subject]),
    database.query("SELECT * FROM study_words WHERE subject_id=$1 ORDER BY sort_order, created_at, id", [subject]),
    database.query("SELECT m.* FROM study_materials m JOIN study_units u ON m.unit_id=u.id WHERE u.subject_id=$1 ORDER BY m.sort_order, m.created_at, m.id", [subject]),
  ]);
  const words = wordRows.rows as Word[], materials = materialRows.rows as Material[];
  const units: ListeningUnit[] = unitRows.rows.map(unit => {
    const unitMaterials = materials.filter(material => material.unit_id === unit.id);
    const audioName = unitMaterials.find(material => material.file_type === "audio" && material.name)?.name;
    return { ...unit, words: words.filter(word => word.unit_id === unit.id), materials: unitMaterials,
      sentenceText: getSentenceText(unit.name, unit.group_name) ?? (audioName ? { english: audioName, chinese: "" } : null) };
  });
  const band = LISTENING_BANDS.find(band => band.key === match[1])!;
  const question = buildListeningQuestionsForBand(band, units)[Number(match[4])];
  if (!question || question.id !== id || !question.options.includes(response)) throw new Error("题目或选项不正确");
  return { correct: response === question.answer, answer: question.answer, explanation: `${question.explanation}\n${question.english}\n${question.chinese}` };
}
