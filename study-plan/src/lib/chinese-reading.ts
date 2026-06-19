export type ChineseReadingTopicKey =
  | "summary"
  | "character"
  | "sentence"
  | "expression"
  | "title"
  | "theme"
  | "information"
  | "life"
  | "noncontinuous";

export type ChineseReadingQuestionType = "choice" | "fill" | "short";

export type ChineseReadingQuestion = {
  id: string;
  type: ChineseReadingQuestionType;
  prompt: string;
  options?: string[];
  answer: string;
  acceptedAnswers?: string[];
  scoringPoints: string[];
  template: string;
  explanation: string;
  mistakeTags: string[];
};

export type ChineseReadingPassage = {
  id: string;
  topicKey: ChineseReadingTopicKey;
  title: string;
  genre: "记叙文" | "说明文" | "非连续性文本";
  difficulty: "基础" | "提高" | "挑战";
  estimatedMinutes: number;
  focus: string;
  body: string;
  questions: ChineseReadingQuestion[];
};

export type ChineseReadingTopic = {
  key: ChineseReadingTopicKey;
  name: string;
  shortName: string;
  goal: string;
  method: string;
};

type PassageBlueprint = {
  id: string;
  topicKey: ChineseReadingTopicKey;
  title: string;
  genre: ChineseReadingPassage["genre"];
  difficulty: ChineseReadingPassage["difficulty"];
  setting: string;
  character: string;
  event: string;
  problem: string;
  action: string;
  turn: string;
  result: string;
  detail: string;
  quote: string;
  symbol: string;
  theme: string;
  summaryAnswer: string;
  detailAnswer: string;
};

export const CHINESE_READING_TOPICS: ChineseReadingTopic[] = [
  {
    key: "summary",
    name: "概括主要内容",
    shortName: "概括",
    goal: "抓人物、事件、结果，避免只抄一句话。",
    method: "先找谁做了什么，再补上原因和结果，用一句完整话概括。",
  },
  {
    key: "character",
    name: "人物形象分析",
    shortName: "人物",
    goal: "从动作、语言、心理和事件中判断人物特点。",
    method: "先写特点，再回到原文找依据，最后说明这个细节表现了什么。",
  },
  {
    key: "sentence",
    name: "句子含义理解",
    shortName: "句意",
    goal: "读懂句子的表层意思和深层意思。",
    method: "先解释关键词，再联系上下文和中心，不能只翻译字面。",
  },
  {
    key: "expression",
    name: "表达作用赏析",
    shortName: "赏析",
    goal: "说明修辞、描写、对比等表达方法的作用。",
    method: "按“方法 + 内容 + 情感/效果”答题，句子赏析更完整。",
  },
  {
    key: "title",
    name: "标题作用",
    shortName: "标题",
    goal: "理解标题和线索、人物、中心之间的关系。",
    method: "从概括内容、设置悬念、作为线索、点明中心四个角度判断。",
  },
  {
    key: "theme",
    name: "中心思想",
    shortName: "中心",
    goal: "能说清文章表达的情感、道理或品质。",
    method: "看结尾、看人物变化、看反复出现的词语，再用完整句表达中心。",
  },
  {
    key: "information",
    name: "信息提取",
    shortName: "信息",
    goal: "从文中快速定位关键词，准确回答。",
    method: "圈题干关键词，回原文找对应句，答案尽量用原文信息组织。",
  },
  {
    key: "life",
    name: "联系生活谈理解",
    shortName: "生活",
    goal: "结合文章道理和自己的生活经历答题。",
    method: "先说文章启示，再说生活例子，最后表明自己怎么做。",
  },
  {
    key: "noncontinuous",
    name: "非连续性文本",
    shortName: "图文",
    goal: "读懂图表、通知、清单和多则材料。",
    method: "先看标题和项目，再比较数据变化，最后整合多处信息。",
  },
];

const topicByKey = Object.fromEntries(
  CHINESE_READING_TOPICS.map((topic) => [topic.key, topic])
) as Record<ChineseReadingTopicKey, ChineseReadingTopic>;

const BLUEPRINTS: PassageBlueprint[] = [
  {
    id: "summary-1",
    topicKey: "summary",
    title: "旧操场上的新尺子",
    genre: "记叙文",
    difficulty: "基础",
    setting: "学校准备重新画操场跑道",
    character: "林晨",
    event: "主动和同学一起测量旧操场",
    problem: "几组数据总是对不上，大家开始互相埋怨",
    action: "他重新检查起点、绳结和记录表，还请体育老师一起核对",
    turn: "大家发现原来有一段绳子被踩松了，少量了半米",
    result: "班级最后交出了准确数据，也学会了分工合作",
    detail: "他把铅笔头夹在本子中间，蹲在跑道边一格一格地对数字",
    quote: "别急着怪谁，先把问题找出来。",
    symbol: "那把旧卷尺",
    theme: "遇到问题先冷静核实，合作比争吵更有力量",
    summaryAnswer: "林晨和同学测量操场时发现数据不一致，他带大家重新核对，找出绳子松动的原因，最终完成了准确记录。",
    detailAnswer: "绳子被踩松，少量了半米",
  },
  {
    id: "summary-2",
    topicKey: "summary",
    title: "雨天的图书角",
    genre: "记叙文",
    difficulty: "提高",
    setting: "连续下雨的午休时间",
    character: "小雅",
    event: "整理班级图书角并设计借阅卡",
    problem: "图书被随手乱放，许多同学找不到想看的书",
    action: "她按主题分类，写好标签，又做了一个借阅登记板",
    turn: "起初有人嫌麻烦，后来发现找书快了很多",
    result: "图书角重新热闹起来，午休也安静有序",
    detail: "她把湿雨伞靠在门边，袖口沾着水，却一直低头擦书脊",
    quote: "书也需要一个能回家的地方。",
    symbol: "蓝色借阅卡",
    theme: "细心的整理能让公共空间变得更好",
    summaryAnswer: "小雅发现班级图书角混乱，主动分类贴标签并制作借阅卡，使同学们更方便地找书、借书。",
    detailAnswer: "按主题分类、贴标签、制作借阅登记板",
  },
  {
    id: "summary-3",
    topicKey: "summary",
    title: "一封没有寄出的信",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "毕业前的班队课",
    character: "周远",
    event: "写信感谢曾经帮助过自己的值日生",
    problem: "他一直不知道那次是谁帮他擦干了被雨淋湿的作业",
    action: "他向同学询问，又回忆那天的细节，最后写下公开感谢",
    turn: "全班才知道原来很多小事都被别人默默记在心里",
    result: "那封信贴在班级墙上，成了大家互相感谢的开始",
    detail: "他把信纸折了又展开，最后只在署名处写下“被帮助过的人”",
    quote: "谢谢那个没有留下名字的人。",
    symbol: "没有寄出的信",
    theme: "善意可能很小，却会被人长久记住",
    summaryAnswer: "周远想感谢曾经默默帮助自己的人，虽然没有找到具体姓名，却用一封公开信让全班开始关注和传递善意。",
    detailAnswer: "感谢曾经帮他擦干被雨淋湿作业的人",
  },
  {
    id: "character-1",
    topicKey: "character",
    title: "留下来的队长",
    genre: "记叙文",
    difficulty: "基础",
    setting: "科技节模型比赛结束后",
    character: "队长顾南",
    event: "留下来检查小组模型和桌面工具",
    problem: "别的小组已经离场，他的小组模型却有一处接口松动",
    action: "他没有急着去领奖，而是带着组员重新固定接口",
    turn: "老师提醒可以先交作品，他还是坚持把隐患处理完",
    result: "模型展示时运行稳定，小组也明白了负责的意义",
    detail: "他手上沾满胶水，仍用纸巾垫住模型底座，怕弄脏展示台",
    quote: "奖状可以晚一点，问题不能留在作品里。",
    symbol: "松动的接口",
    theme: "负责的人会把看不见的小问题也认真做好",
    summaryAnswer: "顾南在比赛后发现模型接口松动，坚持留下修好问题，表现出认真负责的品质。",
    detailAnswer: "他坚持先修好模型接口",
  },
  {
    id: "character-2",
    topicKey: "character",
    title: "慢半拍的掌声",
    genre: "记叙文",
    difficulty: "提高",
    setting: "班级朗读展示课",
    character: "沈念",
    event: "鼓励读错字的同桌重新朗读",
    problem: "同桌紧张得停在讲台上，教室里一时很安静",
    action: "她先轻轻鼓掌，又用口型提醒同桌从上一句接着读",
    turn: "其他同学也跟着鼓掌，同桌终于读完了全文",
    result: "展示课后，同桌第一次主动报名参加朗读",
    detail: "她没有大声催促，只把掌声放得很慢，像给人留出一条路",
    quote: "你可以慢一点，但别停下来。",
    symbol: "慢半拍的掌声",
    theme: "真正的鼓励不是替别人完成，而是陪他找回勇气",
    summaryAnswer: "沈念用慢半拍的掌声和提醒帮助紧张的同桌完成朗读，表现出体贴和善于鼓励别人。",
    detailAnswer: "她轻轻鼓掌并用口型提醒同桌",
  },
  {
    id: "character-3",
    topicKey: "character",
    title: "窗边的值日生",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "大风后的清晨",
    character: "值日生阿衡",
    event: "提前到教室清理被风吹乱的窗台",
    problem: "粉笔灰、落叶和试卷混在一起，窗户还关不严",
    action: "他先把试卷夹好，再清扫窗台，最后找来绳子临时固定窗扣",
    turn: "同学们进教室时只看到干净的窗边，没有人知道他早到了半小时",
    result: "班主任表扬值日认真，他却只说这是值日该做的事",
    detail: "他把冻红的手缩进袖子里，又伸出来按住被风掀起的纸角",
    quote: "值日不是让别人看见，是让教室能好好开始一天。",
    symbol: "关不严的窗户",
    theme: "踏实的人常把责任做在别人看不见的地方",
    summaryAnswer: "阿衡提前到教室清理窗台并固定窗扣，表现出踏实、负责、不张扬的品质。",
    detailAnswer: "提前半小时清理窗台、整理试卷、固定窗扣",
  },
  {
    id: "sentence-1",
    topicKey: "sentence",
    title: "桥下的灯",
    genre: "记叙文",
    difficulty: "基础",
    setting: "傍晚放学路上",
    character: "外婆和小辰",
    event: "一起经过一座老桥",
    problem: "桥下的路灯坏了，行人经过时都放慢脚步",
    action: "外婆每天带一只小手电，照着别人走过湿滑的台阶",
    turn: "维修工来换灯时，才知道这几天都是外婆在照路",
    result: "新路灯亮起后，小辰也学会主动提醒路人小心台阶",
    detail: "手电光不大，却稳稳落在每一级台阶边缘",
    quote: "灯坏了，人心里的光不能也灭了。",
    symbol: "小手电",
    theme: "普通人的小善意能给别人带来安全和温暖",
    summaryAnswer: "外婆在桥下路灯坏掉时用手电为行人照路，小辰受到影响，也学会关心他人。",
    detailAnswer: "外婆每天用小手电为行人照台阶",
  },
  {
    id: "sentence-2",
    topicKey: "sentence",
    title: "被擦亮的奖杯",
    genre: "记叙文",
    difficulty: "提高",
    setting: "学校荣誉室开放日",
    character: "讲解员小珂",
    event: "给低年级同学介绍旧奖杯",
    problem: "有个奖杯年代久远，表面已经暗淡",
    action: "她查阅校史，知道那是第一届合唱队留下的奖杯",
    turn: "讲解时，她没有只说成绩，而是讲起队员每天清晨练声的故事",
    result: "低年级同学听完后主动问怎样参加合唱队",
    detail: "她用软布慢慢擦奖杯，像是在擦一段被时间盖住的故事",
    quote: "亮的不是金属，是那些坚持过的早晨。",
    symbol: "旧奖杯",
    theme: "荣誉背后是长期坚持，不只是结果闪光",
    summaryAnswer: "小珂通过查校史和讲故事，让旧奖杯重新被理解，表现了荣誉来自坚持的道理。",
    detailAnswer: "奖杯代表第一届合唱队长期坚持练习",
  },
  {
    id: "sentence-3",
    topicKey: "sentence",
    title: "墙角的向日葵",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "班级自然角",
    character: "转学生鹿鸣",
    event: "照顾一盆长歪了的向日葵",
    problem: "向日葵被书架挡住阳光，茎歪向窗外",
    action: "鹿鸣没有把它强行扶直，而是慢慢调整花盆位置",
    turn: "几周后，向日葵仍有弯曲的痕迹，却开出了明亮的花",
    result: "鹿鸣在分享时说自己也像这盆花，正在寻找合适的方向",
    detail: "阳光斜斜照进来，花盘一点点转向窗外，像在认真倾听",
    quote: "有些弯路不是错误，是寻找光的方向。",
    symbol: "长歪的向日葵",
    theme: "成长中遇到不适应并不可怕，重要的是找到方向",
    summaryAnswer: "鹿鸣照顾长歪的向日葵，并从中理解自己适应新环境的过程。",
    detailAnswer: "向日葵被书架挡住阳光，向窗外弯曲",
  },
  {
    id: "expression-1",
    topicKey: "expression",
    title: "风把纸船推远",
    genre: "记叙文",
    difficulty: "基础",
    setting: "春游时的小河边",
    character: "晓然",
    event: "和同学放纸船比赛",
    problem: "她的纸船被风吹偏，离开了规定水道",
    action: "她蹲下来观察水流，重新折了一只船，调整船头方向",
    turn: "第二只纸船没有最快，却稳稳穿过石桥",
    result: "她明白了做事不能只靠着急，还要看清规律",
    detail: "风像一只看不见的手，轻轻把纸船推向芦苇丛",
    quote: "原来慢一点，也能走得更稳。",
    symbol: "纸船",
    theme: "观察和调整比盲目用力更重要",
    summaryAnswer: "晓然通过观察风向和水流调整纸船，明白做事要看规律、会调整。",
    detailAnswer: "风把纸船推向芦苇丛",
  },
  {
    id: "expression-2",
    topicKey: "expression",
    title: "会呼吸的菜园",
    genre: "说明文",
    difficulty: "提高",
    setting: "学校劳动实践基地",
    character: "劳动老师和五年级同学",
    event: "观察菜园土壤变化",
    problem: "有一块地浇水后总是板结，菜苗长得慢",
    action: "老师带大家松土、铺稻草，并记录土壤湿度",
    turn: "一周后，土壤变松，蚯蚓也多了起来",
    result: "同学们知道了土壤需要空气，菜园也需要被照料",
    detail: "松过的土像刚揉开的面团，轻轻一按就散出潮湿的气息",
    quote: "土地也要呼吸。",
    symbol: "松软的土",
    theme: "劳动实践能帮助我们理解自然规律",
    summaryAnswer: "同学们通过给菜园松土、铺稻草、记录湿度，理解土壤需要空气和细心照料。",
    detailAnswer: "松土、铺稻草、记录湿度",
  },
  {
    id: "expression-3",
    topicKey: "expression",
    title: "雪后的第一行脚印",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "清晨的校园小路",
    character: "保安叔叔",
    event: "在学生到校前扫出一条路",
    problem: "夜里下雪，台阶和小路都很滑",
    action: "他先撒沙子，再用扫帚一点点推开积雪",
    turn: "学生们踩着干净的小路进校，却很少注意路旁堆起的雪",
    result: "班级写观察日记时，孩子们才发现第一行脚印来自守护校园的人",
    detail: "扫帚在雪地上划出沙沙的声音，像给清晨写下第一行字",
    quote: "总得有人先走一遍，后面的人才稳。",
    symbol: "第一行脚印",
    theme: "平凡岗位上的付出值得被看见",
    summaryAnswer: "保安叔叔雪后提前清理校园道路，让学生安全进校，表现了平凡守护的可贵。",
    detailAnswer: "扫帚声像给清晨写下第一行字",
  },
  {
    id: "title-1",
    topicKey: "title",
    title: "一粒迟到的种子",
    genre: "记叙文",
    difficulty: "基础",
    setting: "科学课种植实验",
    character: "米粒",
    event: "照顾一粒很晚才发芽的豆种",
    problem: "其他同学的豆芽已经长高，她的杯子里仍没有动静",
    action: "她没有扔掉种子，而是每天换水、观察、记录",
    turn: "第七天早晨，杯底终于露出一点白白的根",
    result: "她在观察本上写下：有些等待不是失败",
    detail: "那一点白根短得像逗号，却把她皱着的眉头轻轻打开",
    quote: "它只是走得慢，不是不会长。",
    symbol: "迟到的种子",
    theme: "耐心等待和坚持观察能带来发现",
    summaryAnswer: "米粒耐心照顾迟迟不发芽的豆种，最终等到它长出白根，懂得了等待和坚持的意义。",
    detailAnswer: "第七天早晨种子露出白根",
  },
  {
    id: "title-2",
    topicKey: "title",
    title: "借来的铅笔",
    genre: "记叙文",
    difficulty: "提高",
    setting: "一次临时测验前",
    character: "贺言",
    event: "借给同学一支铅笔",
    problem: "同学忘带文具，急得快哭出来",
    action: "他把自己唯一的备用铅笔削好递过去",
    turn: "测验后，同学想买新铅笔还他，他却说只要以后也帮助别人",
    result: "那支铅笔后来在班里传递了很多次",
    detail: "铅笔很普通，木屑还留着淡淡的清香，却让紧张的教室安静下来",
    quote: "它不是借给你一个人，是借给需要帮助的时候。",
    symbol: "借来的铅笔",
    theme: "善意可以被传递，普通小事也有温度",
    summaryAnswer: "贺言把备用铅笔借给忘带文具的同学，并希望这份帮助继续传递。",
    detailAnswer: "备用铅笔在班里多次传递帮助同学",
  },
  {
    id: "title-3",
    topicKey: "title",
    title: "校门口的第三棵树",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "每天上学经过的校门口",
    character: "小满",
    event: "观察第三棵树一年四季的变化",
    problem: "她觉得每天上学路都一样，没什么可写",
    action: "老师让她只观察一个固定对象，她选择了第三棵树",
    turn: "她发现树影、鸟巢、落叶和新芽每天都有细微变化",
    result: "她写出了第一篇被贴在展示栏的观察作文",
    detail: "冬天的树枝像沉默的线，春天却忽然在末端点出绿色的小灯",
    quote: "不是生活没变化，是我以前走得太匆忙。",
    symbol: "第三棵树",
    theme: "持续观察能让普通生活变得丰富",
    summaryAnswer: "小满持续观察校门口第三棵树，发现生活细节并写出优秀观察作文。",
    detailAnswer: "第三棵树贯穿全文，是观察生活变化的线索",
  },
  {
    id: "theme-1",
    topicKey: "theme",
    title: "半张课程表",
    genre: "记叙文",
    difficulty: "基础",
    setting: "新学期开学第一天",
    character: "新同学予安",
    event: "因为只拿到半张课程表而走错教室",
    problem: "她不好意思开口询问，几次站在门口犹豫",
    action: "班长发现后主动带她熟悉楼层，还帮她补全课程表",
    turn: "予安后来也在门口等下一位新同学",
    result: "半张课程表被贴在她的笔记本里，提醒她记住被帮助的感觉",
    detail: "纸边缺了一角，像她刚来时不完整的安心",
    quote: "有人带我走过一次，我也能带别人走一次。",
    symbol: "半张课程表",
    theme: "被帮助后学会帮助别人，温暖会继续传递",
    summaryAnswer: "予安因为课程表不完整得到班长帮助，后来也主动帮助新同学。",
    detailAnswer: "予安后来主动帮助下一位新同学",
  },
  {
    id: "theme-2",
    topicKey: "theme",
    title: "没有冠军的接力",
    genre: "记叙文",
    difficulty: "提高",
    setting: "校运动会接力赛",
    character: "五年级三班",
    event: "在接力赛中扶起摔倒的同学",
    problem: "第三棒摔倒后，班级几乎失去夺冠机会",
    action: "第四棒没有抱怨，先扶同学站稳，再接棒跑完",
    turn: "他们没有拿冠军，却得到全场掌声",
    result: "班级在总结会上把“跑完全程”写成最大的收获",
    detail: "终点线前的掌声比名次牌更响，落在每个人心里",
    quote: "我们输掉了速度，但没有输掉一个班的样子。",
    symbol: "接力棒",
    theme: "比赛不只看名次，团结和担当同样重要",
    summaryAnswer: "五年级三班在接力赛中先扶起摔倒同学再跑完全程，体现了团结和担当。",
    detailAnswer: "第四棒先扶同学站稳，再接棒跑完",
  },
  {
    id: "theme-3",
    topicKey: "theme",
    title: "最后一盏教室灯",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "傍晚放学后的教学楼",
    character: "班主任和学生们",
    event: "发现老师总是最后离开教室",
    problem: "大家只看到作业上的红笔批注，却不知道老师放学后还在整理反馈",
    action: "几个同学留下取东西，看到老师逐本检查错题原因",
    turn: "第二天，他们主动把订正本按小组整理好",
    result: "教室灯依旧亮得很晚，但不再只属于老师一个人的努力",
    detail: "那盏灯把窗玻璃照成温暖的方格，像一页没有写完的作业纸",
    quote: "学习不是老师追着你走，而是你也愿意往前迈一步。",
    symbol: "最后一盏教室灯",
    theme: "成长需要老师的付出，也需要学生主动承担",
    summaryAnswer: "学生们发现老师放学后仍认真批改和整理反馈，于是主动分担订正整理，理解了学习也需要自己的主动。",
    detailAnswer: "教室灯象征老师的付出和师生共同努力",
  },
  {
    id: "information-1",
    topicKey: "information",
    title: "校园植物认养记录",
    genre: "说明文",
    difficulty: "基础",
    setting: "学校开展植物认养活动",
    character: "五年级植物小组",
    event: "记录三种植物的浇水和光照情况",
    problem: "不同植物需要的水量和光照不一样",
    action: "小组制作观察表，每两天记录一次叶片状态",
    turn: "他们发现薄荷喜光但怕积水，绿萝适合散射光",
    result: "班级根据记录调整摆放位置，植物长势更好",
    detail: "记录表上有日期、天气、浇水量和叶片变化四栏",
    quote: "养植物不能只靠热心，还要看它真正需要什么。",
    symbol: "观察表",
    theme: "准确信息能帮助我们作出合适判断",
    summaryAnswer: "植物小组通过持续记录浇水、光照和叶片变化，帮助班级调整植物养护方式。",
    detailAnswer: "日期、天气、浇水量、叶片变化",
  },
  {
    id: "information-2",
    topicKey: "information",
    title: "失物招领处的一上午",
    genre: "说明文",
    difficulty: "提高",
    setting: "学校失物招领处",
    character: "大队部志愿者",
    event: "整理一上午收到的失物",
    problem: "水杯、红领巾和校卡混在一起，寻找效率很低",
    action: "志愿者按物品类别、发现地点和时间登记",
    turn: "登记后，许多同学能根据线索快速找回物品",
    result: "大队部决定每周公布一次失物清单",
    detail: "清单上写着“蓝色水杯，操场东侧，第三节课后”",
    quote: "信息越具体，寻找越有方向。",
    symbol: "失物清单",
    theme: "分类和具体记录能提高解决问题的效率",
    summaryAnswer: "志愿者通过分类和登记失物信息，提高了同学找回物品的效率。",
    detailAnswer: "物品类别、发现地点、发现时间",
  },
  {
    id: "information-3",
    topicKey: "information",
    title: "一份节水调查",
    genre: "说明文",
    difficulty: "挑战",
    setting: "综合实践课",
    character: "节水调查小组",
    event: "统计校园不同区域的用水情况",
    problem: "大家只知道要节水，却不清楚哪里浪费最多",
    action: "小组连续三天观察洗手池、饮水机和花坛水管",
    turn: "数据显示，午餐后洗手池排队时最容易忘关水龙头",
    result: "学校在洗手池旁贴上提示，并安排学生轮流提醒",
    detail: "表格中午餐后的用水次数最高，备注栏写着“排队急，忘关闭”",
    quote: "找到浪费发生在哪里，节水才不是一句口号。",
    symbol: "调查表",
    theme: "调查数据能帮助我们发现问题并改进做法",
    summaryAnswer: "节水调查小组通过连续观察和统计，发现午餐后洗手池浪费较多，并推动学校改进提醒方式。",
    detailAnswer: "午餐后洗手池排队时最容易忘关水龙头",
  },
  {
    id: "life-1",
    topicKey: "life",
    title: "多带的一把伞",
    genre: "记叙文",
    difficulty: "基础",
    setting: "突降大雨的放学时间",
    character: "琪琪",
    event: "把多带的一把伞借给低年级同学",
    problem: "低年级同学站在门口不敢冲进雨里",
    action: "琪琪先问清对方班级，再陪她走到校门口",
    turn: "第二天，那位同学把伞擦干净还回来，还带来一张感谢卡",
    result: "琪琪开始在书包里常备一只轻便雨披",
    detail: "雨点砸在伞面上很响，她却把伞柄往小同学那边又推了推",
    quote: "多带一点准备，也许就能帮别人少淋一点雨。",
    symbol: "多带的一把伞",
    theme: "生活中的小准备可以成为帮助别人的机会",
    summaryAnswer: "琪琪把多带的伞借给低年级同学，并从中体会到主动帮助别人的意义。",
    detailAnswer: "她陪低年级同学走到校门口",
  },
  {
    id: "life-2",
    topicKey: "life",
    title: "不响的闹钟",
    genre: "记叙文",
    difficulty: "提高",
    setting: "期末复习的早晨",
    character: "昊然",
    event: "因为闹钟没响而迟到",
    problem: "他把迟到原因全怪在闹钟上，不愿承认自己睡前没有检查",
    action: "老师让他写下前一晚能做的三件准备",
    turn: "他发现提前整理书包、确认电量、早睡都能避免迟到",
    result: "之后他把准备清单贴在床头，迟到次数明显减少",
    detail: "那只不响的闹钟静静躺在桌上，像在提醒他别把责任推给别人",
    quote: "工具会出错，习惯不能总缺席。",
    symbol: "不响的闹钟",
    theme: "遇到问题要从自己能改进的地方做起",
    summaryAnswer: "昊然因闹钟没响迟到，后来通过反思和准备清单改掉依赖借口的习惯。",
    detailAnswer: "提前整理书包、确认电量、早睡",
  },
  {
    id: "life-3",
    topicKey: "life",
    title: "被退回的海报",
    genre: "记叙文",
    difficulty: "挑战",
    setting: "班级环保宣传活动",
    character: "宣传委员若溪",
    event: "第一次设计的海报被同学们退回修改",
    problem: "海报颜色漂亮，但文字太多，重点不清楚",
    action: "她没有生气，而是采访同学想知道什么，再重新排版",
    turn: "第二版只保留三个行动建议，配上清晰图标",
    result: "海报贴出后，班级回收箱使用率提高了",
    detail: "她把删掉的句子一条条划去，才发现少一点反而更有力量",
    quote: "宣传不是把我知道的全写上去，而是让别人愿意照着做。",
    symbol: "被退回的海报",
    theme: "接受建议并改进表达，能让想法真正发挥作用",
    summaryAnswer: "若溪接受同学建议修改环保海报，使内容更清楚、更有行动效果。",
    detailAnswer: "第二版只保留三个行动建议并配上图标",
  },
  {
    id: "noncontinuous-1",
    topicKey: "noncontinuous",
    title: "班级阅读周统计",
    genre: "非连续性文本",
    difficulty: "基础",
    setting: "班级阅读周结束后",
    character: "学习委员",
    event: "整理一周阅读记录",
    problem: "同学们想知道哪类书最受欢迎",
    action: "学习委员把小说、科普、历史、诗歌四类阅读人数列成表格",
    turn: "数据发现科普书增长最快，但小说人数仍最多",
    result: "下周图书角准备增加科普类图书",
    detail: "统计表显示：小说18人，科普15人，历史9人，诗歌6人",
    quote: "数据会告诉我们下一步该补什么书。",
    symbol: "阅读统计表",
    theme: "图表能帮助我们比较信息、作出决定",
    summaryAnswer: "学习委员根据阅读周统计发现小说人数最多、科普增长快，于是建议增加科普类图书。",
    detailAnswer: "小说18人，科普15人，历史9人，诗歌6人",
  },
  {
    id: "noncontinuous-2",
    topicKey: "noncontinuous",
    title: "春游通知和路线图",
    genre: "非连续性文本",
    difficulty: "提高",
    setting: "五年级春游前",
    character: "班主任",
    event: "发布春游通知和简易路线图",
    problem: "部分同学只看集合时间，忽略了携带物品和路线要求",
    action: "班主任让大家根据通知核对清单，再读路线图找集合点",
    turn: "同学们发现集合点不是校门口，而是操场南侧",
    result: "春游当天队伍集合更快，遗漏物品也少了",
    detail: "通知写着：7:40操场南侧集合；带水壶、雨衣、垃圾袋；不带玻璃瓶",
    quote: "通知不是看一眼时间，还要看清地点和要求。",
    symbol: "春游通知",
    theme: "读通知要抓时间、地点、物品和注意事项",
    summaryAnswer: "班主任通过通知和路线图提醒同学核对春游时间、地点、物品和注意事项。",
    detailAnswer: "7:40操场南侧集合；带水壶、雨衣、垃圾袋；不带玻璃瓶",
  },
  {
    id: "noncontinuous-3",
    topicKey: "noncontinuous",
    title: "午餐满意度调查",
    genre: "非连续性文本",
    difficulty: "挑战",
    setting: "学校食堂改进午餐",
    character: "少先队调查员",
    event: "收集五年级午餐满意度问卷",
    problem: "大家对午餐意见不同，需要找出主要问题",
    action: "调查员把口味、温度、排队时间、蔬菜种类四项统计成图表",
    turn: "结果显示排队时间得分最低，蔬菜种类意见也较多",
    result: "食堂调整窗口分流，并增加两种时令蔬菜",
    detail: "四项满分5分，口味4.2，温度4.0，排队时间3.1，蔬菜种类3.4",
    quote: "一张表不能解决问题，但能让问题被看清楚。",
    symbol: "满意度图表",
    theme: "多项数据对比能帮助我们找到最需要改进的地方",
    summaryAnswer: "调查员通过满意度图表发现排队时间和蔬菜种类是主要问题，推动食堂改进。",
    detailAnswer: "排队时间得分最低，蔬菜种类得分也较低",
  },
];

function choiceQuestion(
  id: string,
  prompt: string,
  answer: string,
  options: string[],
  scoringPoints: string[],
  explanation: string,
  tags: string[]
): ChineseReadingQuestion {
  return {
    id,
    type: "choice",
    prompt,
    options,
    answer,
    scoringPoints,
    template: "先排除与原文不符或只说局部的选项，再选择最完整的一项。",
    explanation,
    mistakeTags: tags,
  };
}

function fillQuestion(
  id: string,
  prompt: string,
  answer: string,
  scoringPoints: string[],
  tags: string[]
): ChineseReadingQuestion {
  return {
    id,
    type: "fill",
    prompt,
    answer,
    acceptedAnswers: [answer],
    scoringPoints,
    template: "回到原文找关键词，答案要具体，不能只写很笼统的话。",
    explanation: `答案要抓住“${answer}”这一关键信息。`,
    mistakeTags: tags,
  };
}

function shortQuestion(
  id: string,
  prompt: string,
  answer: string,
  scoringPoints: string[],
  template: string,
  explanation: string,
  tags: string[]
): ChineseReadingQuestion {
  return {
    id,
    type: "short",
    prompt,
    answer,
    scoringPoints,
    template,
    explanation,
    mistakeTags: tags,
  };
}

function topicQuestion(blueprint: PassageBlueprint): ChineseReadingQuestion {
  const id = `${blueprint.id}-q3`;

  if (blueprint.topicKey === "summary") {
    return shortQuestion(
      id,
      "请用一句话概括文章的主要内容。",
      blueprint.summaryAnswer,
      ["说清主要人物或对象", "说清关键事件", "补出结果或启示"],
      "谁 + 做了什么 + 结果怎样。",
      "概括题不能只抄开头或结尾，要把事件过程和结果合在一起说。",
      ["概括不完整", "只抄原文"]
    );
  }

  if (blueprint.topicKey === "character") {
    return shortQuestion(
      id,
      `你觉得${blueprint.character}是一个怎样的人？请结合文章内容说明。`,
      `${blueprint.character}是一个认真负责、愿意为别人着想的人。依据是：${blueprint.action}，并且${blueprint.detail}。`,
      ["写出人物特点", "引用或概括原文依据", "说明细节表现出的品质"],
      "人物特点 + 原文依据 + 表现了什么。",
      "人物分析题一定要有依据，不能只写“很好”“很棒”。",
      ["缺少依据", "特点空泛"]
    );
  }

  if (blueprint.topicKey === "sentence") {
    return shortQuestion(
      id,
      `联系上下文，说说“${blueprint.quote}”这句话的含义。`,
      `这句话表面上写${blueprint.symbol}，实际上说明${blueprint.theme}。`,
      ["解释表层意思", "联系上下文", "说出深层情感或道理"],
      "表面意思 + 深层意思 + 中心。",
      "句子含义题要联系前后文，不能只把句子换个说法。",
      ["只解释字面", "没有联系中心"]
    );
  }

  if (blueprint.topicKey === "expression") {
    return shortQuestion(
      id,
      `赏析文中这句话：“${blueprint.detail}”`,
      `这句话运用了生动的描写，把${blueprint.symbol}写得具体可感，表现了${blueprint.theme}。`,
      ["指出表达方法或描写特点", "说清写出了什么", "说明表达效果"],
      "方法 + 内容 + 效果。",
      "赏析题不能只说“写得好”，要说明好在哪里。",
      ["赏析空泛", "表达作用不清"]
    );
  }

  if (blueprint.topicKey === "title") {
    return shortQuestion(
      id,
      `你认为题目“${blueprint.title}”有什么作用？`,
      `题目点出了文章中的重要事物“${blueprint.symbol}”，贯穿事件发展，也暗示了文章中心：${blueprint.theme}。`,
      ["点明重要事物", "概括或串联内容", "暗示中心"],
      "标题内容作用 + 结构作用 + 中心作用。",
      "标题作用通常不止一个角度，要结合文章内容判断。",
      ["标题作用漏点", "没有结合文章"]
    );
  }

  if (blueprint.topicKey === "theme") {
    return shortQuestion(
      id,
      "这篇文章表达了怎样的中心思想？",
      blueprint.theme,
      ["说清文章赞美或说明的品质", "联系人物行为", "表达完整"],
      "通过什么事 + 表现什么品质/道理。",
      "中心思想题要从全文看，不能只说某一个细节。",
      ["中心偏离", "表达不完整"]
    );
  }

  if (blueprint.topicKey === "information") {
    return shortQuestion(
      id,
      "根据文章，解决问题时最关键的信息是什么？请写清楚。",
      blueprint.detailAnswer,
      ["找到原文对应信息", "写完整具体", "不加入无关猜测"],
      "题干关键词 + 原文定位 + 简洁作答。",
      "信息提取题重在准确定位，不能凭印象回答。",
      ["信息遗漏", "凭印象作答"]
    );
  }

  if (blueprint.topicKey === "life") {
    return shortQuestion(
      id,
      "读了这篇文章，你得到什么启示？请联系自己的生活说一说。",
      `文章告诉我们：${blueprint.theme}。生活中我也应该先反思自己能做什么，再主动改进或帮助别人。`,
      ["写出文章启示", "联系生活例子", "写出今后做法"],
      "文章启示 + 生活例子 + 今后做法。",
      "联系生活题不能只喊口号，要有自己的具体例子或做法。",
      ["联系生活空泛", "缺少做法"]
    );
  }

  return shortQuestion(
    id,
    "阅读材料中的数据或要求，最应该关注哪一项？为什么？",
    blueprint.detailAnswer,
    ["找准关键数据或要求", "说明判断原因", "整合多处信息"],
    "先看标题，再看项目和数据，最后说明结论。",
    "非连续性文本要比较信息，不能只看一个数字。",
    ["数据比较错误", "信息整合不足"]
  );
}

function makeBody(blueprint: PassageBlueprint) {
  const topic = topicByKey[blueprint.topicKey];

  if (blueprint.genre === "非连续性文本") {
    return [
      `【材料一】${blueprint.setting}，${blueprint.character}${blueprint.event}。他们发现，${blueprint.problem}。为了让同学们更容易看懂，大家把信息整理成表格，并在旁边写下简短说明。`,
      `【材料二】表格中的关键信息是：${blueprint.detail}。${blueprint.character}提醒大家，读这类材料时不能只看最大的数字，还要看项目名称、时间地点和备注说明。`,
      `【材料三】根据这些信息，班级采取了新的做法：${blueprint.action}。后来，${blueprint.turn}，于是${blueprint.result}。`,
      `这次整理让同学们明白：“${blueprint.quote}”${topic.method}这类文本看起来不像普通文章，却同样有中心和依据。只要抓住标题、项目、数据和结论，就能把分散的信息连成完整判断。`,
    ].join("\n\n");
  }

  if (blueprint.genre === "说明文") {
    return [
      `${blueprint.setting}，${blueprint.character}${blueprint.event}。一开始，大家只凭感觉判断，后来发现：${blueprint.problem}。老师提醒他们，说明一件事不能只说“差不多”，要有观察、有记录，也要能解释原因。`,
      `于是，${blueprint.action}。记录过程中，最让大家印象深的是：${blueprint.detail}。这个细节说明，平时看似普通的现象，只要认真观察，就能找到规律。`,
      `几天后，${blueprint.turn}。同学们把前后的变化放在一起比较，发现原来的问题并不是偶然出现的，而是和方法、环境、习惯都有关系。`,
      `最后，${blueprint.result}。有人说：“${blueprint.quote}”这句话把本次活动的意义说得很清楚：${blueprint.theme}。说明文阅读时，要抓说明对象、关键信息和做法结果，不能只记零散词语。`,
    ].join("\n\n");
  }

  return [
    `${blueprint.setting}，${blueprint.character}${blueprint.event}。事情开始并不顺利，因为${blueprint.problem}。有的同学急着下结论，有的同学想放弃，气氛一度变得沉闷。`,
    `这时，${blueprint.character}${blueprint.action}。文中写道：${blueprint.detail}。这个细节不是随便写的，它让人物的态度和当时的情景都变得具体起来。`,
    `后来，${blueprint.turn}。${blueprint.character}说：“${blueprint.quote}”这句话让大家安静下来，也让事情有了新的方向。`,
    `最终，${blueprint.result}。回头看，${blueprint.symbol}不只是一个普通事物，它串起了事情的发展，也提示了文章想表达的意思：${blueprint.theme}。读这样的文章，要一边找事件线索，一边体会人物变化和作者情感。`,
  ].join("\n\n");
}

function buildQuestions(blueprint: PassageBlueprint): ChineseReadingQuestion[] {
  const distractors = [
    "文章主要写大家参加比赛并获得第一名。",
    "文章主要写老师批评同学不认真。",
    "文章主要写同学们只顾玩耍，没有解决问题。",
  ];

  return [
    choiceQuestion(
      `${blueprint.id}-q1`,
      "下列哪一项最能概括文章主要内容？",
      blueprint.summaryAnswer,
      [blueprint.summaryAnswer, ...distractors].slice(0, 4),
      ["选择能覆盖起因、经过、结果的一项", "排除只说局部或与原文不符的选项"],
      "正确选项既写出主要人物或对象，也写出关键事件和结果。",
      ["概括题"]
    ),
    fillQuestion(
      `${blueprint.id}-q2`,
      "文中事情发生变化的关键原因是什么？",
      blueprint.detailAnswer,
      ["定位原文关键细节", "答案具体完整"],
      ["信息提取"]
    ),
    topicQuestion(blueprint),
    choiceQuestion(
      `${blueprint.id}-q4`,
      `文中“${blueprint.symbol}”最主要的作用是什么？`,
      "串联内容，并提示文章中心",
      ["串联内容，并提示文章中心", "只说明故事发生的地点", "只为了让文章字数更多", "与人物变化完全无关"],
      ["理解物象或线索作用", "联系文章中心判断"],
      "文章反复写到的重要事物，通常和线索、人物变化或中心有关。",
      ["标题线索"]
    ),
    shortQuestion(
      `${blueprint.id}-q5`,
      "请从文中找出一个能表现中心的细节，并说明理由。",
      `示例：${blueprint.detail}。理由：这个细节表现了${blueprint.theme}。`,
      ["找出具体细节", "说明细节表现的内容", "联系中心"],
      "细节 + 表现了什么 + 与中心的关系。",
      "这类题要用原文细节作依据，不能只写自己的感受。",
      ["依据不足"]
    ),
    shortQuestion(
      `${blueprint.id}-q6`,
      "如果让你给文中的人物写一句评价，你会怎么写？",
      `${blueprint.character}能在问题面前主动行动，说明${blueprint.theme}。`,
      ["评价紧扣人物行为", "语言完整", "能联系文章主题"],
      "人物行为 + 品质评价。",
      "评价人物时要扣住文章中真实发生的事。",
      ["人物评价"]
    ),
  ];
}

export const CHINESE_READING_PASSAGES: ChineseReadingPassage[] = BLUEPRINTS.map((blueprint) => ({
  id: blueprint.id,
  topicKey: blueprint.topicKey,
  title: blueprint.title,
  genre: blueprint.genre,
  difficulty: blueprint.difficulty,
  estimatedMinutes: 20,
  focus: topicByKey[blueprint.topicKey].goal,
  body: makeBody(blueprint),
  questions: buildQuestions(blueprint),
}));

export function getChineseReadingTopic(key: ChineseReadingTopicKey) {
  return topicByKey[key];
}

export function getChineseReadingPassage(id: string) {
  return CHINESE_READING_PASSAGES.find((passage) => passage.id === id);
}

export function getChineseReadingPassagesByTopic(topicKey: ChineseReadingTopicKey) {
  return CHINESE_READING_PASSAGES.filter((passage) => passage.topicKey === topicKey);
}

export function normalizeChineseAnswer(value: string) {
  return value.replace(/\s+/g, "").replace(/[，。！？、；：“”‘’（）()]/g, "").toLowerCase();
}

export function gradeChineseReadingQuestion(question: ChineseReadingQuestion, value: string) {
  if (question.type === "short") return null;
  const normalized = normalizeChineseAnswer(value);
  const accepted = question.acceptedAnswers?.length ? question.acceptedAnswers : [question.answer];
  return accepted.some((answer) => normalizeChineseAnswer(answer) === normalized);
}
