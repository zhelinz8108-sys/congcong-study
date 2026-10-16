import "server-only";
import { pool } from "@/lib/db";
import type { PoolClient } from "pg";
import type { EnglishLockedAnswer, EnglishLockedFeedback } from "@/lib/english-locked-types";

const POS = ["限定词", "感叹词", "缩略词", "情态", "名词", "动词", "形容词", "副词", "介词", "连词", "代词", "冠词", "数词", "名", "动", "形", "副", "介", "连", "代", "冠", "数"];
export function cleanVocabMeaning(value: string) {
  return value.replace(/\s+/g, " ").trim()
    .replace(new RegExp(`(^|\\s)(?:${POS.join('|')})(?:\\s*/\\s*(?:${POS.join('|')}))*\\s+`, "g"), (_match, prefix) => prefix ? "；" : "")
    .replace(/\b(?:vt|vi|adj|adv|prep|pron|conj|aux|num|art|interj|modal|n|v|a|ad)\.?\b/gi, " ")
    .replace(/[；;，,、]+/g, "；").replace(/\s*；\s*/g, "；").replace(/；{2,}/g, "；").replace(/^；|；$/g, "").trim();
}
export async function gradeVocabLocked(id: string, response: EnglishLockedAnswer, database: Pick<PoolClient, "query"> = pool): Promise<EnglishLockedFeedback> {
  const match = /^(en-zh|zh-en):([a-z0-9][a-z0-9_-]{0,127})$/.exec(id);
  if (!match || typeof response !== "string" || !response.trim() || response.length > 2000) throw new Error("单词题编号或答案不正确");
  const row = await database.query("SELECT id, word, meaning FROM study_words WHERE id=$1", [match[2]]);
  const word = row.rows[0] as { id: string; word: string; meaning: string } | undefined;
  if (!word || String(word.id) !== match[2]) throw new Error("单词不存在或编号不规范");
  const expected = match[1] === "en-zh" ? cleanVocabMeaning(word.meaning) : word.word;
  const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return { correct: normalize(response) === normalize(expected), answer: expected,
    explanation: `${word.word}：${cleanVocabMeaning(word.meaning)}。成绩以首次提交为准。` };
}
