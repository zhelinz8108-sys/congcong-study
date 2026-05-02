export type PhraseItem = {
  english: string;
  chinese: string;
};

export type PhraseCategory = {
  title: string;
  items: PhraseItem[];
};

export type PhraseModule = {
  title: string;
  categories: PhraseCategory[];
};

export type PhraseLevel = {
  key: string;
  name: string;
  subtitle: string;
  modules: PhraseModule[];
};

const phrase = (english: string, chinese: string): PhraseItem => ({ english, chinese });

export const ENGLISH_PHRASE_LEVELS: PhraseLevel[] = [
  {
    key: "primary",
    name: "小学",
    subtitle: "2 个模块 · 核心套语与高频词组",
    modules: [
      {
        title: "一、先掌握的 50 个核心套语",
        categories: [
          {
            title: "1. 问候与礼貌",
            items: [
              phrase("Hello./Hi.", "你好。"),
              phrase("Good morning.", "早上好。"),
              phrase("Good afternoon.", "下午好。"),
              phrase("Good evening.", "晚上好。"),
              phrase("Goodbye./Bye.", "再见。"),
              phrase("See you.", "回头见。"),
              phrase("See you tomorrow.", "明天见。"),
              phrase("Thank you.", "谢谢你。"),
              phrase("Thanks a lot.", "非常感谢。"),
              phrase("You’re welcome.", "不客气。"),
              phrase("Excuse me.", "打扰一下。"),
              phrase("I’m sorry.", "对不起。"),
              phrase("That’s OK.", "没关系。"),
              phrase("Never mind.", "不要紧。"),
              phrase("Nice to meet you.", "很高兴认识你。"),
            ],
          },
          {
            title: "2. 自我表达",
            items: [
              phrase("How are you?", "你好吗？"),
              phrase("I’m fine, thank you.", "我很好，谢谢你。"),
              phrase("What’s your name?", "你叫什么名字？"),
              phrase("My name is ...", "我的名字是……"),
              phrase("How old are you?", "你几岁了？"),
              phrase("I’m ... years old.", "我……岁。"),
              phrase("I like ...", "我喜欢……"),
              phrase("I don’t like ...", "我不喜欢……"),
              phrase("Can I ...?", "我可以……吗？"),
              phrase("May I come in?", "我可以进来吗？"),
            ],
          },
          {
            title: "3. 课堂用语",
            items: [
              phrase("Come in, please.", "请进。"),
              phrase("Sit down, please.", "请坐下。"),
              phrase("Stand up, please.", "请起立。"),
              phrase("Open your books.", "打开你们的书。"),
              phrase("Close your books.", "合上你们的书。"),
              phrase("Listen carefully.", "认真听。"),
              phrase("Look at the blackboard.", "看黑板。"),
              phrase("Read after me.", "跟我读。"),
              phrase("Can you help me?", "你能帮我吗？"),
              phrase("Let me help you.", "让我来帮你。"),
            ],
          },
          {
            title: "4. 常见交际",
            items: [
              phrase("Here you are.", "给你。"),
              phrase("This is for you.", "这是给你的。"),
              phrase("What is this?", "这是什么？"),
              phrase("What colour is it?", "它是什么颜色？"),
              phrase("How many ...?", "有多少……？"),
              phrase("Where is ...?", "……在哪里？"),
              phrase("Would you like ...?", "你想要……吗？"),
              phrase("Yes, please.", "好的，请。"),
              phrase("No, thanks.", "不用了，谢谢。"),
              phrase("Let’s ...", "让我们……吧。"),
              phrase("Welcome!", "欢迎！"),
              phrase("Good luck!", "祝你好运！"),
              phrase("Happy birthday!", "生日快乐！"),
              phrase("Happy New Year!", "新年快乐！"),
              phrase("Happy Children’s Day!", "儿童节快乐！"),
            ],
          },
        ],
      },
      {
        title: "二、建议掌握的高频词组",
        categories: [
          {
            title: "1. 家庭与人物",
            items: [
              phrase("family photo", "全家福"),
              phrase("family member", "家庭成员"),
              phrase("good friend", "好朋友"),
              phrase("little brother", "弟弟"),
              phrase("little sister", "妹妹"),
              phrase("with my parents", "和我的父母一起"),
              phrase("at home", "在家"),
              phrase("visit grandparents", "看望爷爷奶奶/外公外婆"),
            ],
          },
          {
            title: "2. 学校与课堂",
            items: [
              phrase("go to school", "去上学"),
              phrase("after school", "放学后"),
              phrase("in class", "在课堂上"),
              phrase("have English class", "上英语课"),
              phrase("do homework", "做作业"),
              phrase("on the playground", "在操场上"),
              phrase("in the library", "在图书馆里"),
              phrase("school bag", "书包"),
            ],
          },
          {
            title: "3. 日常作息",
            items: [
              phrase("get up", "起床"),
              phrase("go home", "回家"),
              phrase("go to bed", "上床睡觉"),
              phrase("in the morning", "在早上"),
              phrase("in the afternoon", "在下午"),
              phrase("in the evening", "在晚上"),
              phrase("at night", "在夜里"),
              phrase("every day", "每天"),
            ],
          },
          {
            title: "4. 食物与健康",
            items: [
              phrase("have breakfast", "吃早餐"),
              phrase("have lunch", "吃午饭"),
              phrase("have dinner", "吃晚饭"),
              phrase("drink water", "喝水"),
              phrase("eat fruit", "吃水果"),
              phrase("a glass of milk", "一杯牛奶"),
              phrase("brush teeth", "刷牙"),
              phrase("wash hands", "洗手"),
            ],
          },
          {
            title: "5. 兴趣与活动",
            items: [
              phrase("play football", "踢足球"),
              phrase("play basketball", "打篮球"),
              phrase("play ping-pong", "打乒乓球"),
              phrase("ride a bike", "骑自行车"),
              phrase("read books", "读书"),
              phrase("listen to music", "听音乐"),
              phrase("fly a kite", "放风筝"),
              phrase("make a snowman", "堆雪人"),
            ],
          },
          {
            title: "6. 时间与日期",
            items: [
              phrase("what time", "几点"),
              phrase("what day", "星期几"),
              phrase("this week", "这周"),
              phrase("next week", "下周"),
              phrase("on Monday", "在星期一"),
              phrase("on Sunday", "在星期天"),
              phrase("at seven o’clock", "在七点钟"),
              phrase("after class", "下课后"),
            ],
          },
          {
            title: "7. 位置与方向",
            items: [
              phrase("next to", "紧挨着"),
              phrase("in front of", "在……前面"),
              phrase("behind", "在……后面"),
              phrase("on the left", "在左边"),
              phrase("on the right", "在右边"),
              phrase("go straight", "直走"),
              phrase("turn left", "向左转"),
              phrase("turn right", "向右转"),
            ],
          },
          {
            title: "8. 天气与季节",
            items: [
              phrase("sunny day", "晴天"),
              phrase("rainy day", "雨天"),
              phrase("cloudy day", "阴天"),
              phrase("snowy day", "下雪天"),
              phrase("in spring", "在春天"),
              phrase("in summer", "在夏天"),
              phrase("in autumn", "在秋天"),
              phrase("in winter", "在冬天"),
            ],
          },
          {
            title: "9. 感受与状态",
            items: [
              phrase("be happy", "开心"),
              phrase("be sad", "难过"),
              phrase("be tired", "累"),
              phrase("be hungry", "饿"),
              phrase("be thirsty", "渴"),
              phrase("be late", "迟到"),
              phrase("be careful", "小心"),
              phrase("be ready", "准备好了"),
            ],
          },
          {
            title: "10. 购物与出行",
            items: [
              phrase("how much", "多少钱"),
              phrase("go shopping", "去购物"),
              phrase("shopping list", "购物清单"),
              phrase("by bus", "乘公交车"),
              phrase("on foot", "步行"),
              phrase("bus stop", "公交车站"),
              phrase("get on", "上车"),
              phrase("get off", "下车"),
            ],
          },
          {
            title: "11. 节日与文化",
            items: [
              phrase("birthday party", "生日聚会"),
              phrase("Spring Festival", "春节"),
              phrase("Mid-Autumn Festival", "中秋节"),
              phrase("New Year’s Day", "元旦"),
              phrase("Children’s Day", "儿童节"),
              phrase("Teachers’ Day", "教师节"),
              phrase("National Day", "国庆节"),
              phrase("make dumplings", "包饺子"),
            ],
          },
          {
            title: "12. 安全与环保",
            items: [
              phrase("traffic lights", "红绿灯"),
              phrase("cross the road", "过马路"),
              phrase("wait for", "等待"),
              phrase("keep quiet", "保持安静"),
              phrase("keep clean", "保持整洁"),
              phrase("save water", "节约用水"),
              phrase("turn off", "关闭"),
              phrase("pick up", "捡起"),
            ],
          },
        ],
      },
    ],
  },
  {
    key: "middle",
    name: "初中",
    subtitle: "内容待补充",
    modules: [],
  },
  {
    key: "high",
    name: "高中",
    subtitle: "内容待补充",
    modules: [],
  },
];

export function countPhraseItems(level: PhraseLevel): number {
  return level.modules.reduce(
    (sum, module) =>
      sum + module.categories.reduce((count, category) => count + category.items.length, 0),
    0
  );
}
