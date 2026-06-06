type MathAnswer = {
  raw?: string;
  answers?: string[];
  answer?: string;
} | null | undefined;

type MathExplanationQuestion = {
  question_type?: string;
  prompt?: string;
  options?: Array<{ key: string; text: string }>;
  correct_answer?: MathAnswer;
  explanation?: string | null;
};

function normalizeAnswer(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[，。；、\s]/g, "")
    .replace(/[（）()【】\[\]{}]/g, "")
    .toUpperCase();
}

function extractChoice(value: string) {
  return normalizeAnswer(value).match(/[A-F]/)?.[0] ?? normalizeAnswer(value);
}

export function getMathAnswerValues(answer: MathAnswer) {
  if (!answer) return [];
  if (Array.isArray(answer.answers)) return answer.answers.map(String).filter(Boolean);
  if (answer.answer) return [String(answer.answer)];
  if (answer.raw) return [String(answer.raw)];
  return [];
}

export function formatMathAnswer(answer: MathAnswer) {
  const values = getMathAnswerValues(answer);
  if (values.length > 0) return values.join("；");
  return answer?.raw || "未解析到标准答案";
}

function cleanOptionText(option?: { key: string; text: string }) {
  if (!option) return "";
  return option.text
    .trim()
    .replace(new RegExp(`^${option.key}[．.、]?\\s*`), "")
    .trim();
}

function sourceExplanation(question: MathExplanationQuestion) {
  const explanation = question.explanation?.trim() ?? "";
  if (!explanation) return "";

  const prompt = question.prompt?.trim() ?? "";
  const answer = formatMathAnswer(question.correct_answer).trim();
  if (explanation === prompt || explanation === answer) return "";
  if (/^答案[:：]?\s*[A-F√×]?\s*[。.]?$/.test(explanation)) return "";
  if (prompt.includes(explanation) && explanation.length > 20) return "";
  if (explanation.includes(prompt) && !/[解答析]/.test(explanation.replace(prompt, ""))) return "";
  return explanation;
}

function conceptHint(prompt: string) {
  const text = prompt.replace(/\s+/g, "");

  if (text.includes("3的倍数")) {
    return "判断 3 的倍数，看各位数字之和是否能被 3 整除。";
  }
  if (text.includes("2的倍数") || text.includes("5的倍数")) {
    return "判断 2、5 的倍数时，重点看个位：个位是 0、2、4、6、8 的数是 2 的倍数；个位是 0 或 5 的数是 5 的倍数。";
  }
  if (text.includes("最大公因数")) {
    return "求最大公因数，要先找出几个数共有的因数，再取其中最大的一个。";
  }
  if (text.includes("最小公倍数")) {
    return "求最小公倍数，要找几个数共同的倍数，再取其中最小的一个。";
  }
  if (text.includes("公因数")) {
    return "公因数是几个数共同拥有的因数，判断时要同时满足每个数都能被它整除。";
  }
  if (text.includes("因数") && text.includes("倍数")) {
    return "判断因数和倍数时，关键看能不能整除：如果 a 能整除 b，那么 a 是 b 的因数，b 是 a 的倍数。";
  }
  if ((text.includes("足球") || text.includes("篮球")) && text.includes("共用去")) {
    return "这类总价问题可以设一个未知单价为 x，再根据“数量×单价”的总价关系列方程，结合两个单价的差求解。";
  }
  if (text.includes("统计图")) {
    return "读统计图时先看横轴、纵轴和每个点表示的数量，再比较折线的起点、终点和上升下降趋势。";
  }
  if (text.includes("相遇")) {
    return "相遇或再次同时出现的问题，通常要找两个周期的最小公倍数，再从起始时间往后推。";
  }
  if (text.includes("通分") || text.includes("异分母")) {
    return "异分母分数加减法要先通分，把分数单位统一后，再按同分母分数加减法计算。";
  }
  if (text.includes("方程") || text.includes("x")) {
    return "列方程时先设未知数，再把题目中的等量关系写成方程，最后解方程并回到题目检查。";
  }

  return "";
}

export function buildMathExplanation(question: MathExplanationQuestion) {
  const original = sourceExplanation(question);
  if (original) return original;

  const answer = formatMathAnswer(question.correct_answer);
  if (answer === "未解析到标准答案") {
    return "这道题还没有从答案文件里识别出标准答案，先对照原卷和答案文件核对。";
  }

  const prompt = question.prompt ?? "";
  const hint = conceptHint(prompt);

  if (question.question_type === "choice") {
    const key = extractChoice(answer);
    const option = question.options?.find((item) => item.key === key);
    const optionText = cleanOptionText(option);
    const lines = [`答案是 ${key}。`];
    if (optionText) {
      lines.push(`对应选项是 ${key}. ${optionText}。`);
    } else {
      lines.push(`这道题的选项包含图片、公式或原卷元素，系统已从答案区识别出正确选项为 ${key}。`);
    }
    lines.push(hint || `做选择题时，按题干条件逐项排除，最后与标准答案 ${key} 对照。`);
    return lines.join("\n");
  }

  if (question.question_type === "true_false") {
    const normalized = normalizeAnswer(answer);
    const display = ["TRUE", "T", "YES", "Y", "对", "正确", "√", "V"].includes(normalized)
      ? "正确"
      : ["FALSE", "F", "NO", "N", "错", "错误", "×", "X"].includes(normalized)
        ? "错误"
        : answer;
    return [`标准判断是：${display}。`, hint || "判断题要逐字核对题干条件，只要有一个条件不成立，就应判为错误。"].join("\n");
  }

  if (question.question_type === "fill_blank") {
    return [`参考答案是：${answer}。`, hint || "填空题要核对结果、单位和顺序；多空题要按题目空格顺序逐一填写。"].join("\n");
  }

  if (question.question_type === "calculation") {
    return [`参考结果是：${answer}。`, hint || "计算题要把关键步骤写清楚，最后核对结果是否与参考答案一致。"].join("\n");
  }

  return [`参考答案是：${answer}。`, hint || "应用题和综合题要先找数量关系，再核对关键步骤、单位和最终结论。"].join("\n");
}
