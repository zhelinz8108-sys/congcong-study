import type { NationalDayMathPublicSection, NationalDayMathDiagramId } from "./national-day-math";

export type MathAudioLesson = {
  id: string;
  sectionId: string;
  anchorId: string;
  title: string;
  kind: "lesson" | "example" | "practice";
  text: string;
};

const introductions: Record<string, string> = {
  overview: "同学你好，欢迎来到国庆数学课堂。准备好纸和笔，我们不急着记答案，而是一步一步把道理想清楚。",
  plan: "先一起安排学习节奏。听懂一个方法以后，按下暂停，自己写一遍。能离开讲解独立做出来，才算真正学会。",
  prerequisite: "正式上课前，先把工具准备好。分数、小数、单位换算和基本图形，是后面每一章都会用到的老朋友。",
  diagnostic: "现在做先修诊断。我会读题，读完后自动停下，留时间给你思考。写好答案并提交以后，再看页面上的解析。准备好后，手动选择下一题。",
  day1: "第一天，我们先打牢计算和数量关系。每次计算前先估一估，做完后再检查结果是否合理。",
  u1: "这节课研究小数乘法和除法。先想清楚计数单位怎样变化，再确定小数点的位置。遇到近似数，还要结合实际情境决定怎么取值。",
  u2: "这节课一起梳理混合运算和数量关系。先读懂题意，说清楚每个量表示什么，再决定先算哪一步。不要一看到数字就急着列式。",
  segmented: "生活里的水费、车费，常常不是一个单价算到底。这节课先把各段分清楚，再分别计算，最后相加。注意每一段的边界。",
  u3: "这节课重新认识数和运算。重点是找准整体，理解分率的意义，再用运算规律把复杂问题变简单。",
  binary: "今天当一次数的侦探，探索二进制。十进制满十进一，二进制满二进一。先观察位值，再解释每个数字代表多少。",
  day2: "第二天，我们学习比、比例和圆。边听边画图，遇到比先统一单位，遇到圆先分清半径和直径。",
  u4: "这节课学习比和比例。先问三个问题：谁和谁比，顺序是什么，单位是否相同。按比分配时，还要分清已知的是总量、一部分，还是两部分的差。",
  golden: "接下来认识黄金比。先看清楚长段、短段和全长分别是谁，再理解它们之间的比例关系。不要只记住一个小数。",
  u5: "这节课学习圆。把圆心、半径、直径先认清楚，再理解周长和面积的推导。周长是一圈有多长，面积是里面有多大，两者的单位也不同。",
  sports: "现在把圆的知识带到运动场。跑道的弯道和直道要分开想；判断路程时，看清楚题目给的是哪条边界。",
  day3: "第三天，把图形变化、确定位置和综合应用连起来。画一画、标一标，再用语言解释自己的想法。",
  u6: "这节课研究放大与缩小。对应长度按相同倍率变化，但是面积的变化要看倍率的平方。先找对应边，再判断图形有没有变形。",
  u7: "这节课学习确定位置。数对先列后行；用方向确定位置时，先找观测点，再说方向、角度和距离。跟着页面上的图一起看。",
  comprehensive: "现在进入综合自测。每道题读完都会停下，请独立完成并提交。暂时不会也没关系，先写出已知条件，画图或者列出数量关系。",
  review: "最后一起整理公式。不要只背字母，要能说出公式中每个量的意思，以及什么时候可以使用。",
  checklist: "学完以后，用这份清单检查自己。每听到一项，就问自己：我能不看答案讲清楚吗？还不熟悉的地方，回到相应小节再听一次。",
};

const diagrams: Record<NationalDayMathDiagramId, string> = {
  decimals: "请看小数图解。边长一米的正方形分成一百个小格，每格是零点零一平方米。绿色部分长零点六米、宽零点四米，占二十四格，所以面积是零点二四平方米。这就解释了零点六乘零点四，为什么等于零点二四。",
  whole: "请看整体与份额的图。八十本书是单位一，平均分成五份，每份十六本。借出五分之三，就是三份，十六乘三等于四十八本；剩下两份，是三十二本。先认准整体，再把分率对应到具体数量。",
  ratio: "请看比的图解。蜂蜜和水的比是三比二，总量一共五份。蜂蜜占总量的五分之三，水占五分之二。注意，蜂蜜与水相比是三比二，但蜂蜜与总量相比是三比五。比较的对象变了，比也就不同。",
  circle: "请看圆的图解。从圆心到圆上的线段叫半径，经过圆心、两端都在圆上的线段叫直径。直径由两条半径组成，所以直径是半径的二倍。",
  scale: "请看放大与缩小的图解。逐一比较对应边，确认每条边都用了相同倍率。放大二倍表示长度变成原来的二倍，面积会变成原来的四倍。",
  coordinates: "请看数对图。点 A 在第三列、第四行，写成数对三、四；点 B 在第五列、第二行。先横着找列，再竖着找行，顺序不能交换。",
  bearing: "请看方向图，观测点是 A。上北、下南、左西、右东。B 在 A 的北偏东三十度方向、两千米处。也就是从正北向东转三十度，再沿这条方向走两千米。注意，这幅图是方向示意图，不能直接拿尺子量实际距离。",
};

// These are spoken explanations of the visible formula cards, not quiz keys.
const formulas: Record<string, string> = {
  小数除法: "把被除数和除数同时乘相同的十的整数次幂，使除数变成整数，商不变。除数不能为零。",
  乘法分配律: "括号里 a 加 b 的和乘 c，等于 a 乘 c 加 b 乘 c。括号里 a 减 b 的差乘 c，等于 a 乘 c 减 b 乘 c。也可以反过来，提取相同的乘数。",
  分段计费: "总费用等于起步费或基础费用，加上每个超出段的数量乘该段单价。",
  比和比值: "a 比 b 的比值，等于 a 除以 b，b 不能为零。",
  比例基本性质: "如果 a 比 b 等于 c 比 d，那么 a 乘 d 等于 b 乘 c，也就是两外项之积等于两内项之积。两个比的后项不能为零。",
  圆的直径与半径: "直径等于二乘半径；半径等于直径除以二。",
  圆的周长: "圆的周长等于圆周率乘直径，也等于二乘圆周率乘半径。反过来，半径等于周长除以二倍圆周率。",
  圆的面积: "圆的面积等于圆周率乘半径的平方。半径的平方，就是半径乘半径。",
  半圆: "半圆面积等于圆周率乘半径的平方，再除以二。半圆周长要把半段圆周和直径加起来，等于圆周率乘半径，加二乘半径。",
  圆环: "圆环面积等于圆周率乘，外半径的平方减去内半径的平方，这个差。注意，是先分别平方，再相减。",
  数对与平移: "数对先写列，再写行。向右移动几格，列数就增加几；向上移动几格，行数就增加几。",
};

/** Turn mathematical notation into Chinese speech without changing its meaning. */
export function speakMathText(input: string): string {
  return input
    .replace(/教材[^。\n]*[页頁][^。\n]*[）)]?/g, "")
    .replace(/\b([01]+)₂/g, (_, n: string) => `二进制数 ${[...n].join(" ")}`)
    .replace(/\b(\d+)₁₀/g, "十进制数 $1")
    .replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g, "$2分之$1")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "百分之$1")
    .replace(/km[²2]/g, "平方千米").replace(/cm[²2]/g, "平方厘米")
    .replace(/dm[²2]/g, "平方分米").replace(/m[²2]/g, "平方米")
    .replace(/km\b/g, "千米").replace(/cm\b/g, "厘米").replace(/dm\b/g, "分米").replace(/mm\b/g, "毫米")
    .replace(/(?<=\d)\s*m\b/g, "米")
    .replace(/(\d+|π)(?=[a-zA-Zπ])/g, "$1 乘 ")
    .replace(/R²/g, "外半径的平方").replace(/r²/g, "半径的平方")
    .replace(/10ⁿ/g, "十的 n 次方").replace(/²/g, "的平方").replace(/³/g, "的立方")
    .replace(/π/g, "圆周率")
    .replace(/≈/g, "约等于").replace(/≠/g, "不等于").replace(/[≤]/g, "小于或等于")
    .replace(/[≥]/g, "大于或等于").replace(/[<＜]/g, "小于").replace(/[>＞]/g, "大于")
    .replace(/[=＝]/g, "等于").replace(/[×]/g, "乘").replace(/÷/g, "除以")
    .replace(/[+＋]/g, "加").replace(/[−－]/g, "减").replace(/(?<=\d)-(?=\d)/g, "减")
    .replace(/±/g, "加或减").replace(/[∶]/g, "比").replace(/(?<=\d):(?=\d)/g, "比")
    .replace(/°/g, "度").replace(/→/g, "，接着，")
    .replace(/□|_{2,}|（\s*）|\(\s*\)/g, "空格")
    .replace(/[（(]/g, "，括号，").replace(/[）)]/g, "，括号结束，")
    .replace(/[•●]/g, "").replace(/[“”‘’]/g, "")
    .replace(/\s+/g, " ").replace(/，\s*，/g, "，").trim();
}

/** Short utterances avoid engines silently cutting off a long lesson. */
export function splitMathSpeech(text: string, maxLength = 45): string[] {
  const result: string[] = [];
  for (const sentence of text.match(/[^。！？；\n]+[。！？；\n]?/g) ?? []) {
    let rest = sentence.trim();
    while (rest.length > maxLength) {
      const comma = rest.lastIndexOf("，", maxLength - 1);
      const end = comma >= maxLength / 3 ? comma + 1 : maxLength;
      result.push(rest.slice(0, end));
      rest = rest.slice(end).trim();
    }
    if (rest) result.push(rest);
  }
  return result;
}

/** Only explicit public fields are read, even if a raw source object is passed. */
export function buildMathAudioLessons(sections: NationalDayMathPublicSection[]): MathAudioLesson[] {
  const lessons: MathAudioLesson[] = [];
  for (const section of sections) {
    let title = section.title;
    let paragraphs = [introductions[section.id] ?? `这一节学习${section.title}。`];
    let part = 0;
    const flush = () => {
      const text = paragraphs.map(speakMathText).filter(Boolean).join("\n");
      if (text) lessons.push({ id: `${section.id}-lesson-${part++}`, sectionId: section.id, anchorId: `math-section-${section.id}`, title, kind: "lesson", text });
      paragraphs = [];
    };
    for (const block of section.blocks) {
      if (block.type === "heading") {
        flush(); title = block.text;
        paragraphs.push(`接下来，我们学习：${block.text}。`);
      } else if (block.type === "text") {
        const text = speakMathText(block.text);
        if (text) paragraphs.push(text);
      } else if (block.type === "formula") {
        paragraphs.push(`一起整理${block.title}的方法。${formulas[block.title] ?? block.formula}。${block.note}`);
      } else if (block.type === "diagram") {
        paragraphs.push(diagrams[block.id]);
      } else if (block.type === "example" || block.type === "quiz") {
        flush();
        const example = block.type === "example";
        const parts = [`${example ? "一起看" : "请独立完成"}${block.label}。${block.title}。`, block.question];
        if (example) {
          parts.push("先暂停想一想，你准备从哪里入手？想好后，跟着下面的步骤核对。");
          for (const [i, step] of block.steps.entries()) parts.push(`第${i + 1}步。${step}`);
          parts.push(`所以，这道题的答案是：${block.answer}`);
          if (block.pitfall) parts.push(`这里要特别注意：${block.pitfall}`);
          parts.push("请暂停，用自己的话讲一遍思路，再换一组数字试一试。");
        } else {
          parts.push("现在音频会停下，请在页面上独立作答并提交。完成后，点击下一段继续听课。");
        }
        lessons.push({ id: block.id, sectionId: section.id, anchorId: `question-${block.id}`, title: `${block.label} · ${block.title || (example ? "例题讲解" : "独立练习")}`, kind: example ? "example" : "practice", text: parts.map(speakMathText).join("\n") });
      }
    }
    flush();
  }
  return lessons;
}
