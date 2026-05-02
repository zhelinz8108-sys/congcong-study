import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { v4 as uuid } from "uuid";

/**
 * Parse text into word-meaning-phonetic triples.
 * Handles multiple formats:
 *   1. Textbook: word* [phonetic] 词性 中文意思
 *   2. Simple:   word - meaning / word  meaning / word\tmeaning
 */
function parseWords(text: string): { word: string; meaning: string; phonetic: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results: { word: string; meaning: string; phonetic: string }[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.length < 2 || line.length > 300) continue;
    if (/^(unit|chapter|lesson|page|sentence|preface|instruction|目录|单元|第.+[课章节]|语法|搭配|记忆|辨析|注：|主题归纳|核心词表|使用说明|编者|版权|书名|出版|ISBN|扫码|附录|本书|通过|经过|对于)/i.test(line)) continue;
    if (/[是为意]为|固定句型|可数名词|不可数|用于|表示"/.test(line)) continue;

    let word = "";
    let meaning = "";
    let phonetic = "";

    const textbookMatch = line.match(
      /^([a-zA-Z][a-zA-Z\s'-]*?)\*?\s*\[([^\]]+)\]\s*(?:名|动|形|副|介|代|连|冠|限定词|数|叹|感)\s+([\u4e00-\u9fff].+)$/
    );
    if (textbookMatch) {
      word = textbookMatch[1].trim();
      phonetic = `/${textbookMatch[2].trim()}/`;
      meaning = textbookMatch[3].split(/[；;]/)[0].trim();
      meaning = meaning.replace(/\s*搭配.*$/, "").trim();
    }

    if (!word) {
      const m2 = line.match(/^([a-zA-Z][a-zA-Z\s'-]*?)\*?\s*\[([^\]]+)\]\s+([\u4e00-\u9fff].+)$/);
      if (m2) {
        word = m2[1].trim();
        phonetic = `/${m2[2].trim()}/`;
        meaning = m2[3].split(/[；;]/)[0].trim();
      }
    }

    if (!word) {
      const m3 = line.match(/^([a-zA-Z][a-zA-Z\s'-]*?)\s+\/([^/]+)\/\s+([\u4e00-\u9fff].+)$/);
      if (m3) {
        word = m3[1].trim();
        phonetic = `/${m3[2].trim()}/`;
        meaning = m3[3].split(/[；;]/)[0].trim();
      }
    }

    if (!word) {
      const cleaned = line.replace(/^\d+[\.\)、\s]+/, "").trim();
      if (!cleaned) continue;

      const delimiters = [
        /\s+[-—–]\s+/,
        /\t+/,
        /\s{2,}/,
        /[,，]\s*/,
        /[;；]\s*/,
      ];

      for (const d of delimiters) {
        const parts = cleaned.split(d);
        if (parts.length >= 2) {
          const first = parts[0].trim();
          const rest = parts.slice(1).join(" ").trim();
          const firstIsEn = /^[a-zA-Z]/.test(first);
          const restHasCn = /[\u4e00-\u9fff]/.test(rest);

          if (firstIsEn && restHasCn) {
            word = first.replace(/\*$/, "").trim();
            meaning = rest.split(/[；;]/)[0].trim();
            break;
          }
        }
      }

      if (!word) {
        const m = cleaned.match(/^([a-zA-Z][a-zA-Z\s'-]*?)\*?\s+([\u4e00-\u9fff].+)$/);
        if (m) {
          word = m[1].trim();
          meaning = m[2].split(/[；;]/)[0].trim();
        }
      }
    }

    if (word && meaning) {
      word = word.replace(/\[.*?\]|\(.*?\)|\/.*?\//g, "").replace(/\*$/, "").trim();
      meaning = meaning.replace(/^(?:名|动|形|副|介|代|连|冠|限定词|数|叹|感)\s+/, "").trim();
      meaning = meaning.replace(/\s*搭配.*$/, "").trim();
      if (word.length < 2 || word.length > 30) continue;
      if (/^\d+$/.test(word)) continue;
      if (/[。？！，：]/.test(word)) continue;
      if (/[\u4e00-\u9fff]/.test(word)) continue;

      const key = word.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ word, meaning, phonetic });
      }
    }
  }

  return results;
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(buffer));
  const text = result.text;
  return Array.isArray(text) ? text.join("\n") : (text || "");
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const subjectId = formData.get("subject_id") as string | null;
  const mode = (formData.get("mode") as string) || "preview";
  const wordsJson = formData.get("words") as string | null;

  if (mode === "import" && subjectId && wordsJson) {
    const words: { word: string; meaning: string; phonetic?: string }[] = JSON.parse(wordsJson);

    const { data: maxRow } = await supabase
      .from("study_words")
      .select("sort_order")
      .eq("subject_id", subjectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const maxOrder = maxRow?.sort_order ?? 0;

    // Get existing words for duplicate check
    const { data: existingWords } = await supabase
      .from("study_words")
      .select("word")
      .eq("subject_id", subjectId);

    const existingSet = new Set(
      ((existingWords ?? []) as Array<{ word: string }>).map((w) => w.word.toLowerCase())
    );

    const toInsert = [];
    let idx = 0;
    for (const w of words) {
      if (existingSet.has(w.word.toLowerCase())) continue;
      toInsert.push({
        id: uuid(),
        subject_id: subjectId,
        word: w.word.trim(),
        phonetic: w.phonetic?.trim() ?? "",
        meaning: w.meaning.trim(),
        sort_order: maxOrder + idx + 1,
      });
      idx++;
    }

    if (toInsert.length > 0) {
      // Insert in batches of 500
      for (let i = 0; i < toInsert.length; i += 500) {
        await supabase.from("study_words").insert(toInsert.slice(i, i + 500));
      }
    }

    return NextResponse.json({ imported: toInsert.length, total: words.length });
  }

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 });
  }

  let text = "";
  const name = file.name.toLowerCase();

  try {
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractTextFromPDF(buffer);
    } else {
      text = await file.text();
    }
  } catch (e) {
    return NextResponse.json({ error: `文件解析失败: ${e}` }, { status: 500 });
  }

  const parsedWords = parseWords(text);

  return NextResponse.json({
    parsed: parsedWords.length,
    preview: parsedWords.slice(0, 500),
    filename: file.name,
  });
}
