import "server-only";
import type { BankManifest } from "@/lib/grade6-bank-types";

// Reviewed against the immutable 2,394-question release. Retirement affects
// current practice only: original IDs, sealed answers and learner history stay
// intact. Never remap a retired response to its keeper or renumber survivors.
export const RAW_BANK_MANIFEST_SHA256 = "86e948bc3b3f07f2b5fb86cfcb468165a82ce29daae46c3d508cc41f9cc39233";
export const RETIRED_BANK_DUPLICATES = [
  {
    "keepId": "SYNC-CH00-P016-0044",
    "removeId": "SYNC-CH02-P081-0071",
    "reason": "计划造林200公顷/实际250公顷，求增产分率；仅答案标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P017-0045",
    "removeId": "SYNC-CH02-P081-0072",
    "reason": "计划2000双鞋/实际2400双，求增加分率；仅答案标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P017-0046",
    "removeId": "SYNC-CH02-P081-0073",
    "reason": "心跳平时75次/跑步135次，求跑步比平时多几分之几。仅“约跳动”与“的跳动”措辞、标点和标签变化，无新条件或求解任务。"
  },
  {
    "keepId": "SYNC-CH00-P017-0048",
    "removeId": "SYNC-CH02-P081-0075",
    "reason": "17.5吨比20吨少几分之几；仅答案标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P017-0049",
    "removeId": "SYNC-CH02-P081-0076",
    "reason": "大米60千克/面粉45千克，求面粉比大米少的分率；仅答案标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P017-0050",
    "removeId": "SYNC-CH02-P081-0077",
    "reason": "果园今年1200千克、比去年少200千克，求今年比去年减少分率；仅“答/减产的分率”标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P019-0056",
    "removeId": "SYNC-CH02-P082-0078",
    "reason": "蝴蝶为蜻蜓2/3、蜻蜓为甲壳虫1/4、蝴蝶12只，求甲壳虫数量；仅标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P019-0057",
    "removeId": "SYNC-CH02-P082-0079",
    "reason": "苹果为梨5/8、梨为香蕉4/5、苹果135吨，求香蕉吨数；仅标签变化。"
  },
  {
    "keepId": "SYNC-CH00-P019-0058",
    "removeId": "SYNC-CH02-P082-0080",
    "reason": "体操40人占六年级1/7，六年级占全校2/15，求全校人数；仅“学生人数/人数”和答案标签变化。"
  },
  {
    "keepId": "G6E-CH01-Q017",
    "removeId": "G6E-CH01-Q045",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH01-Q025",
    "removeId": "G6E-CH01-Q053",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH01-Q058",
    "removeId": "G6E-CH01-Q032",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6-T04-Q041",
    "removeId": "G6-T03-Q006",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "SYNC-CH01-P028-0059",
    "removeId": "SYNC-CH01-P029-0067",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH01-Q008",
    "removeId": "G6-T05-Q028",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH01-Q024",
    "removeId": "G6E-CH01-Q050",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6-T04-Q028",
    "removeId": "G6-T01-Q007",
    "reason": "4÷11循环小数与精确到千分位，两空、数值、要求与顺序相同；仅数学节点和普通文字表示不同。"
  },
  {
    "keepId": "G6E-CH01-Q076",
    "removeId": "G6E-CH01-Q043",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6-T04-Q019",
    "removeId": "G6-T03-Q010",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH02-Q021",
    "removeId": "G6-T09-Q027",
    "reason": "4000连续减去剩余量1/2、1/3直到1/100，求最后余数；仅空白外围括号和标签变化。"
  },
  {
    "keepId": "G6-T08-Q012",
    "removeId": "G6-T08-Q007",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6-T08-Q008",
    "removeId": "G6-T09-Q028",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6-T08-Q010",
    "removeId": "G6-T09-Q024",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH02-Q063",
    "removeId": "G6-T09-Q026",
    "reason": "工程合作12.6小时、甲先交替整数小时、乙先多1/3小时，求甲单独时长。条件与任务完全一致；仅“交替着做/交替做”与字段标签/ID变化。"
  },
  {
    "keepId": "G6E-CH02-Q066",
    "removeId": "G6-T01-Q032",
    "reason": "空池进水4小时注满、放水5小时排空，各轮流1小时，求注满总时长。仅标点及短输入/多行解答过程的展示不同；根据主代理确认规则纳入同题重复。"
  },
  {
    "keepId": "SYNC-CH04-P148-0022",
    "removeId": "SYNC-CH04-P148-0025",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "SYNC-CH04-P157-0100",
    "removeId": "SYNC-CH04-P157-0103",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "SYNC-CH05-P178-0028",
    "removeId": "SYNC-CH05-P178-0029",
    "reason": "同一160×160正方形底图中画最大圆、标圆心和半径、保留找圆心痕迹；仅指令措辞及将标准字母O/r明写，数学作图任务与底图完全一致。"
  },
  {
    "keepId": "SYNC-CH05-P199-0157",
    "removeId": "SYNC-CH05-P199-0158",
    "reason": "完整原生题块完全相同（忽略题目ID和答题字段ID，规范空白）；数字、各小题、选项、图形、公式及答题形式一致。"
  },
  {
    "keepId": "G6E-CH06-Q006",
    "removeId": "G6-T13-Q004",
    "reason": "小圆直径等于大圆半径，求大圆周长倍数及小圆面积占比；两空顺序相同，仅括号与标签变化。"
  },
  {
    "keepId": "G6-T13-Q015",
    "removeId": "G6E-CH06-Q043",
    "reason": "判断2:1放大长方形面积为原2倍这一命题，选项同为√/×；仅补充“判断对错”提示及标签变化。"
  }
] as const;
const retiredIds = new Set<string>(RETIRED_BANK_DUPLICATES.map(pair => pair.removeId));

export function isRetiredBankQuestion(id: string) {
  return retiredIds.has(id);
}

export function activeBankManifest(raw: BankManifest): BankManifest {
  const refs = raw.collections.flatMap(collection => collection.questions);
  const positions = new Map(refs.map((question, index) => [question.id, index]));
  if (raw.total !== 2394 || refs.length !== raw.total || positions.size !== raw.total ||
      retiredIds.size !== RETIRED_BANK_DUPLICATES.length) throw new Error("Invalid bank retirement release");
  for (const { keepId, removeId } of RETIRED_BANK_DUPLICATES) {
    const keep = positions.get(keepId), remove = positions.get(removeId);
    if (keep === undefined || remove === undefined || keep >= remove || retiredIds.has(keepId)) {
      throw new Error("Invalid bank duplicate mapping");
    }
  }
  const collections = raw.collections.map(collection => {
    const questions = collection.questions.filter(question => !retiredIds.has(question.id));
    const difficultyCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
    for (const question of questions) difficultyCounts[question.difficulty]++;
    return { ...collection, questions, questionCount: questions.length, difficultyCounts };
  });
  return { ...raw, collections, total: collections.reduce((sum, collection) => sum + collection.questionCount, 0) };
}
