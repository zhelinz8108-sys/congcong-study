export function readerPracticeFixture() {
  const text = value => ({ kind: "text", text: value });
  const page = (number, lines) => ({ title: `第 ${number} 页`, blocks: lines.map(text) });
  const verbs = ["want", "ask", "remember", "use", "practise", "try", "study", "cry"];
  const answers = ["wanted", "asked", "remembered", "used", "practised", "tried", "studied", "cried"];
  const pages = [
    page(1, ["2026 Unit 1", "易错语法精讲", "知识点 1：一般过去时中动词过去式的规则变化", "一句话核心：多数动词加 -ed。"]),
    page(2, ["一、写出下列动词的过去式", ...verbs.map((v, i) => `${i + 1}. ${v} → ______`), "【答案】", ...answers.map((v, i) => `${i + 1}. ${v}`)]),
    page(3, []), page(4, []), page(5, []),
    page(6, ["一、句型转换", "1. She wanted to play Mulan.（改成否定句）", "二、用所给词填空", "2. He ______ ______ to act. (not want)", "三、单项选择", "( ) 3. —What did she do? —She ______ a song.", "A. sing", "B. sang", "C. sings", "【答案】", "1. She didn't want to play Mulan.", "2. did not, want", "3. B", "解析：过去的动作使用过去式 sang。"]),
    page(7, ["综合训练模块", "一、写出过去式", "1. go → ______", "【答案】", "1. went"]),
  ];
  const meta = { id: "c577cdad00f2", title: "Unit 1 Try your best", edition: "new", units: [1], stage: "explain", extension: ".pdf", size: 1, pageCount: pages.length, paths: ["Unit 1 易错语法精讲.pdf"], status: "ready" };
  return { id: meta.id, meta, pages, asset: null, reference: false };
}

export function readerPracticeComprehensiveFixture() {
  const fixture = readerPracticeFixture();
  const page = (number, lines) => ({ title: `第 ${number} 页`, blocks: lines.map(text => ({ kind: "text", text })) });
  fixture.pages[6] = page(7, ["综合训练模块", "一、用括号内单词的适当形式填空", "1. They ________ (see).", "2. We ________ and ________ (go, come).",
    "二、单项选择", "( ) 1. He ________ yesterday.", "A. sing B. sang", "三、句型转换", "1. She acted.（改为否定句）", "______________________",
    "四、补全对话", "从方框中选择合适的句子填空，填序号。", "A. How are you? B. Fine, thanks.", "对话一：", "Joe: 1. ________ Ann: 2. ________", "参考答案与逐题解析"]);
  fixture.pages[7] = page(8, ["一、填空答案：", "1. saw 2.", "went; came", "二、单选答案：1.B", "三、句型转换：", "1. She did not act.",
    "四、补全对话：", "对话一：1. A 对话二：2. B", "详细解析：", "• 填空第2题：Use went and came.", "• 单选第1题：Use sang in the past.",
    "• 补全对话：first A, second B.", "复习小贴士：核对动词形式。"]);
  fixture.meta.pageCount = fixture.pages.length;
  return fixture;
}
