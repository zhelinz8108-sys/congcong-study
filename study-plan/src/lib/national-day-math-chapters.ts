import type { NationalDayMathPublicSection } from "./national-day-math";
import type { NationalDayMathAttempt } from "./national-day-math-progress";

export const NATIONAL_DAY_MATH_CHAPTERS = [
  {
    id: "preparation",
    kind: "preparation",
    title: "学习准备与先修诊断",
    subtitle: "三天学习安排、先修知识补给、12道诊断题",
    colorId: "prerequisite",
    sectionIds: ["overview", "plan", "prerequisite", "diagnostic"],
  },
  {
    id: "u1",
    kind: "chapter",
    title: "第一章 · 小数乘法和除法（二）",
    subtitle: "小数计算、积与商的变化、近似数",
    colorId: "u1",
    sectionIds: ["day1", "u1"],
  },
  {
    id: "u2",
    kind: "chapter",
    title: "第二章 · 混合运算与数量关系（三）",
    subtitle: "运算顺序、数量关系、生活中的分段计费",
    colorId: "u2",
    sectionIds: ["u2", "segmented"],
  },
  {
    id: "u3",
    kind: "chapter",
    title: "第三章 · 数与运算的再认识",
    subtitle: "数的意义、运算规律、二进制的秘密",
    colorId: "u3",
    sectionIds: ["u3", "binary"],
  },
  {
    id: "u4",
    kind: "chapter",
    title: "第四章 · 比和比例",
    subtitle: "比、比例、比例尺、神奇的黄金比",
    colorId: "u4",
    sectionIds: ["day2", "u4", "golden"],
  },
  {
    id: "u5",
    kind: "chapter",
    title: "第五章 · 圆",
    subtitle: "圆的周长与面积、体育中的数学",
    colorId: "u5",
    sectionIds: ["u5", "sports"],
  },
  {
    id: "u6",
    kind: "chapter",
    title: "第六章 · 放大与缩小",
    subtitle: "图形变化、长度比与面积比",
    colorId: "u6",
    sectionIds: ["day3", "u6"],
  },
  {
    id: "u7",
    kind: "chapter",
    title: "第七章 · 确定位置",
    subtitle: "数对、方向、角度与距离",
    colorId: "u7",
    sectionIds: ["u7"],
  },
  {
    id: "review",
    kind: "review",
    title: "综合自测与全书复习",
    subtitle: "20道综合题、公式方法速查、掌握清单",
    colorId: "comprehensive",
    sectionIds: ["comprehensive", "review", "checklist"],
  },
] as const;

export type NationalDayMathChapter = {
  id: string;
  kind: "preparation" | "chapter" | "review";
  title: string;
  subtitle: string;
  colorId: string;
  sectionIds: readonly string[];
};
export type NationalDayMathChapterSummary = NationalDayMathChapter & {
  examples: number;
  quizIds: string[];
  completionSectionIds: string[];
};

export function getNationalDayMathChapterSections(
  sections: NationalDayMathPublicSection[],
  chapter: NationalDayMathChapter,
) {
  return sections.filter((section) => chapter.sectionIds.includes(section.id));
}

/** Directory metadata contains no content blocks or private grading answers. */
export function getNationalDayMathChapterSummaries(
  sections: NationalDayMathPublicSection[],
): NationalDayMathChapterSummary[] {
  return NATIONAL_DAY_MATH_CHAPTERS.map((chapter) => {
    const selected = getNationalDayMathChapterSections(sections, chapter);
    const blocks = selected.flatMap((section) => section.blocks);
    return {
      ...chapter,
      examples: blocks.filter((block) => block.type === "example").length,
      quizIds: blocks
        .filter((block) => block.type === "quiz")
        .map((block) => block.id),
      completionSectionIds: selected
        .filter((section) => section.kind === "chapter")
        .map((section) => section.id),
    };
  });
}

export function nationalDayMathChapterStats(
  quizIds: string[],
  attempts: Record<string, NationalDayMathAttempt>,
) {
  const submitted = quizIds
    .map((id) => attempts[id])
    .filter(
      (attempt) =>
        attempt?.checked &&
        attempt.gradingVersion === 2 &&
        attempt.selfRated !== true,
    );
  const correct = submitted.filter(
    (attempt) => attempt.correct === true,
  ).length;
  return {
    total: quizIds.length,
    answered: submitted.length,
    correct,
    wrong: submitted.filter((attempt) => attempt.correct === false).length,
    accuracy: submitted.length
      ? Math.round((correct / submitted.length) * 1000) / 10
      : null,
  };
}

export function nationalDayMathSectionHref(
  subjectId: string,
  sectionId: string,
) {
  const chapter = NATIONAL_DAY_MATH_CHAPTERS.find((entry) =>
    entry.sectionIds.some((id) => id === sectionId),
  );
  return chapter
    ? `/subjects/${subjectId}/national-day-math/${chapter.id}#math-section-${encodeURIComponent(sectionId)}`
    : null;
}
