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
