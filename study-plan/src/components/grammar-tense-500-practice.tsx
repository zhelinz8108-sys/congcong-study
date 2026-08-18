"use client";

import {
  GrammarOriginal500Practice,
  type GrammarPracticeBank,
} from "@/components/grammar-original-500-practice";
import {
  buildTenseGrammarExplanation,
  TENSE_GRAMMAR_QUESTIONS,
} from "@/lib/grammar-tense-500";

const TENSE_GRAMMAR_BANK: GrammarPracticeBank = {
  questions: TENSE_GRAMMAR_QUESTIONS,
  buildExplanation: buildTenseGrammarExplanation,
  progressKey: "study-plan-grammar-tense-500-progress-v1",
  autoNextKey: "study-plan-grammar-tense-500-auto-next",
  eyebrow: "新增时态题库",
  badge: "500 道混合题 · 13 类时态 · 2000 词以内",
  title: "英语主流时态选择题 500 题",
  description:
    "Word 文档中的 500 道时态题已全部导入，13 类主流时态混合打乱。点击选项立即判断对错，并显示文档原解析、时态规则、正确句和易错提醒；练习进度会单独保存在当前设备。",
  startLabel: "开始时态 500 题混合练习",
  startHint: "13 类时态全部打乱顺序，一次练完",
  practiceLabel: "主流时态 500 题混合练习",
  questionLabel: "文档原题",
};

export function GrammarTense500Practice() {
  return <GrammarOriginal500Practice bank={TENSE_GRAMMAR_BANK} />;
}
