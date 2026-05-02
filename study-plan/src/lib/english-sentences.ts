export type SentenceExample = {
  english: string;
  chinese: string;
  focus: string;
};

export type SentenceDrill = {
  prompt: string;
  model: string;
  tip: string;
};

export type SentenceUnit = {
  id: string;
  title: string;
  summary: string;
  goal: string;
  patterns: string[];
  chunks: string[];
  examples: SentenceExample[];
  substitutionDrills: SentenceDrill[];
  translationDrills: SentenceDrill[];
  outputTask: string;
  teacherTips: string[];
};

export type SentenceChapter = {
  key: string;
  name: string;
  subtitle: string;
  vocabularyBand: string;
  units: SentenceUnit[];
};

const example = (
  english: string,
  chinese: string,
  focus: string
): SentenceExample => ({
  english,
  chinese,
  focus,
});

const drill = (
  prompt: string,
  model: string,
  tip: string
): SentenceDrill => ({
  prompt,
  model,
  tip,
});

const unit = (
  id: string,
  title: string,
  summary: string,
  goal: string,
  patterns: string[],
  chunks: string[],
  examples: SentenceExample[],
  substitutionDrills: SentenceDrill[],
  translationDrills: SentenceDrill[],
  outputTask: string,
  teacherTips: string[]
): SentenceUnit => ({
  id,
  title,
  summary,
  goal,
  patterns,
  chunks,
  examples,
  substitutionDrills,
  translationDrills,
  outputTask,
  teacherTips,
});

const chapter = (
  key: string,
  name: string,
  subtitle: string,
  vocabularyBand: string,
  units: SentenceUnit[]
): SentenceChapter => ({
  key,
  name,
  subtitle,
  vocabularyBand,
  units,
});

export const ENGLISH_SENTENCE_CHAPTERS: SentenceChapter[] = [
  chapter(
    "primary",
    "小学 1200 词基础句子训练",
    "先把句子说完整，再把信息说清楚。",
    "词汇范围：0 - 1200",
    [
      unit(
        "p1",
        "自我介绍与个人信息",
        "把姓名、年龄、年级、喜好和能力连成完整句，不再只说单个词。",
        "学会用 4 到 5 句完成一段自然的自我介绍，句子里至少带上年龄、年级、喜好和一项能力。",
        [
          "My name is ..., and I am ... years old.",
          "I am in Grade ..., and I study at ... School.",
          "My favorite ... is ... because ...",
          "I can ..., but I am still learning to ...",
        ],
        [
          "years old",
          "in Grade Three",
          "favorite subject",
          "after school",
          "be good at",
        ],
        [
          example(
            "My name is Tina, and I am nine years old.",
            "我叫 Tina，我九岁了。",
            "姓名 + 年龄"
          ),
          example(
            "I am in Grade Three, and I study at Sunrise Primary School.",
            "我上三年级，就读于 Sunrise 小学。",
            "年级 + 学校"
          ),
          example(
            "My favorite subject is English because I enjoy speaking in class.",
            "我最喜欢的科目是英语，因为我喜欢在课堂上开口说。",
            "喜好 + because"
          ),
          example(
            "I can ride a bike well, but I am still learning to swim.",
            "我骑自行车骑得很好，但我还在学游泳。",
            "能力 + 转折"
          ),
        ],
        [
          drill(
            "把 Tina 换成你自己的名字，再补上年龄。",
            "My name is Leo, and I am ten years old.",
            "先说名字，再接年龄，两个信息要放在同一句里。"
          ),
          drill(
            "把 favorite subject 改成 PE / music / math，并加一个 because。",
            "My favorite subject is PE because I like running with my classmates.",
            "because 后面最好说出具体原因，不要只说 good。"
          ),
          drill(
            "把 can ride a bike 改成你会做的一件事，再补一个还在学的内容。",
            "I can play the piano, but I am still learning to draw animals.",
            "前半句说已经会，后半句说还在学。"
          ),
        ],
        [
          drill(
            "我三年级，我最喜欢英语。",
            "I am in Grade Three, and English is my favorite subject.",
            "翻译时把两个信息连起来，不要拆成两个很短的句子。"
          ),
          drill(
            "我会打篮球，但我还在学跳绳。",
            "I can play basketball, but I am still learning to skip rope.",
            "注意 can 后面和 learn to 后面都接动词原形。"
          ),
        ],
        "写一段 5 句个人名片：姓名、年龄、年级、最喜欢的科目、放学后的一个习惯。",
        [
          "自我介绍最怕一条一条往外蹦词，训练时一定要求孩子说完整句。",
          "如果孩子一开始说不长，就先固定句型，再慢慢把 because 和 but 加进去。",
        ]
      ),
      unit(
        "p2",
        "家庭成员与日常作息",
        "围绕家庭成员和一天作息说句子，练会频率副词和时间表达。",
        "能用完整句介绍家人做什么、自己几点做什么，并说出每天或经常的习惯。",
        [
          "My mother usually ... in the morning.",
          "I get up at ..., and I ... before school.",
          "After school, we often ... together.",
          "My father is busy, but he always ...",
        ],
        [
          "usually",
          "every morning",
          "after school",
          "have dinner",
          "go to bed",
        ],
        [
          example(
            "My mother usually makes breakfast before seven o'clock.",
            "我妈妈通常在七点前做早餐。",
            "频率 + 时间"
          ),
          example(
            "I get up at six thirty, and I read English for ten minutes before school.",
            "我六点半起床，上学前读十分钟英语。",
            "作息顺序"
          ),
          example(
            "After school, my brother and I often do our homework at the same table.",
            "放学后，我和哥哥常常在同一张桌子上做作业。",
            "after school"
          ),
          example(
            "My father is busy, but he always tells me a story before bed.",
            "我爸爸很忙，但他睡前总会给我讲一个故事。",
            "转折 + 固定习惯"
          ),
        ],
        [
          drill(
            "把六点半改成你的起床时间，再换一个上学前的小活动。",
            "I get up at six forty, and I water the plants before school.",
            "时间和动作都要一起换，句型保持不变。"
          ),
          drill(
            "把 mother 换成 grandmother，并改一个早晨活动。",
            "My grandmother usually waters the flowers in the morning.",
            "第三人称单数动词别忘记加变化。"
          ),
          drill(
            "把 after school 的活动改成一家人一起做的事。",
            "After school, we often take a walk in the park together.",
            "together 很适合帮助孩子把画面说完整。"
          ),
        ],
        [
          drill(
            "我妈妈每天早上六点做早饭。",
            "My mother makes breakfast at six every morning.",
            "每天早上是 every morning，不要漏 every。"
          ),
          drill(
            "我爸爸很忙，但是他总陪我读书。",
            "My father is busy, but he always reads with me.",
            "陪我读书不要直译成 accompany me read books。"
          ),
        ],
        "写一段“我家晚上七点到九点”的家庭作息，至少写 4 句，包含 2 个时间点。",
        [
          "作息句最容易只剩动作，老师要提醒孩子把时间和人物一起带上。",
          "遇到第三人称单数时，要反复强调 usually 后面的动词形式。"
        ]
      ),
      unit(
        "p3",
        "学校一天与课堂表达",
        "把进校、上课、完成任务和课堂礼貌语言放到一个学习场景里。",
        "能够描述自己在学校的一天，并会用礼貌表达完成课堂互动。",
        [
          "We have ... in the first class.",
          "Our teacher asks us to ..., so we ...",
          "I do not understand ..., so I say ...",
          "At the end of the lesson, we ...",
        ],
        [
          "in the first class",
          "listen carefully",
          "raise my hand",
          "work in pairs",
          "at the end of the lesson",
        ],
        [
          example(
            "We have Chinese in the first class, and our teacher asks us to read aloud.",
            "第一节课我们上语文，老师让我们大声朗读。",
            "课程 + 任务"
          ),
          example(
            "When I do not understand a word, I raise my hand and ask for help.",
            "当我不明白一个单词时，我会举手求助。",
            "课堂求助"
          ),
          example(
            "In group work, my partner writes the answers and I check them carefully.",
            "小组活动时，我的搭档写答案，我认真检查。",
            "分工表达"
          ),
          example(
            "At the end of the lesson, we put our books away and clean our desks.",
            "下课前，我们收好书本并整理桌面。",
            "结尾动作"
          ),
        ],
        [
          drill(
            "把 Chinese 改成另一门课，再换一个老师布置的任务。",
            "We have science in the first class, and our teacher asks us to watch a short experiment.",
            "课程名和课堂动作要搭配自然。"
          ),
          drill(
            "把 ask for help 改成 ask a question / answer a question。",
            "When I do not understand the picture, I raise my hand and ask a question.",
            "先说遇到的问题，再说课堂动作。"
          ),
          drill(
            "把 end of the lesson 改成 lunch break 或 after school。",
            "At lunch break, we wash our hands and line up quietly.",
            "注意时间短语变了，后面动作也要跟着变。"
          ),
        ],
        [
          drill(
            "我听不懂这个句子时，会举手问老师。",
            "When I do not understand this sentence, I raise my hand and ask the teacher.",
            "问老师可以直接用 ask the teacher。"
          ),
          drill(
            "下课时，我们把椅子放好并排队离开。",
            "At the end of the lesson, we put our chairs back and leave in a line.",
            "两个动作都要交代清楚。"
          ),
        ],
        "写一个“我最喜欢的一节课”小片段：上什么课、老师让做什么、你怎么参与、下课前做什么。",
        [
          "课堂句训练的重点不是词多，而是让孩子把动作顺序说清楚。",
          "如果孩子老是只说 We have English. 要继续追问：老师让你们做什么？你做了什么？"
        ]
      ),
      unit(
        "p4",
        "兴趣爱好与周末安排",
        "学会把喜欢做的事、和谁一起做、在哪里做以及为什么喜欢连起来。",
        "能围绕兴趣和周末活动说出连续 4 句以上的内容，并带上原因或感受。",
        [
          "I enjoy ... because ...",
          "On weekends, I usually ... with ...",
          "When the weather is ..., we ...",
          "I like ..., but my friend prefers ...",
        ],
        [
          "on weekends",
          "play football",
          "listen to music",
          "go to the park",
          "prefer",
        ],
        [
          example(
            "I enjoy drawing animals because I can use many bright colors.",
            "我喜欢画动物，因为我可以用很多明亮的颜色。",
            "爱好 + because"
          ),
          example(
            "On weekends, I usually play badminton with my cousin in the park.",
            "周末我通常和表哥在公园打羽毛球。",
            "时间 + 同伴 + 地点"
          ),
          example(
            "When the weather is sunny, we ride our bikes along the river.",
            "天气晴朗时，我们沿着河边骑车。",
            "条件 + 活动"
          ),
          example(
            "I like reading storybooks, but my friend prefers building model cars.",
            "我喜欢读故事书，但我的朋友更喜欢拼模型车。",
            "喜好比较"
          ),
        ],
        [
          drill(
            "把 drawing animals 改成你的一个爱好，并补充一个 because。",
            "I enjoy taking photos because I can keep beautiful moments.",
            "because 后面说具体好处，句子会更像写作。"
          ),
          drill(
            "把 with my cousin 改成 with my parents / with my classmates。",
            "On weekends, I usually visit the museum with my parents.",
            "换同伴时，活动也要合理。"
          ),
          drill(
            "把 sunny 改成 rainy，再换成下雨天适合做的活动。",
            "When the weather is rainy, we read books and play board games at home.",
            "天气变化后，地点通常也要跟着变。"
          ),
        ],
        [
          drill(
            "周末我常和朋友去公园踢足球。",
            "On weekends, I often go to the park and play football with my friends.",
            "地点和活动可以并列放在一起。"
          ),
          drill(
            "我喜欢听音乐，但是我妹妹更喜欢跳舞。",
            "I like listening to music, but my sister prefers dancing.",
            "prefer 后面也可以接动名词。"
          ),
        ],
        "写一个“我的理想周末”训练卡：天气、同伴、活动、原因、结束后的感受。",
        [
          "兴趣类句子一定要多练 because，不然内容容易空。",
          "周末安排最适合训练“时间 + 人物 + 地点 + 活动 + 感受”的完整表达。"
        ]
      ),
      unit(
        "p5",
        "购物、问路与礼貌请求",
        "把买东西、问路和礼貌请求放进真实生活场景里说完整。",
        "能在简单生活场景中提出请求、说明需要什么，并听起来礼貌自然。",
        [
          "Can I have ...?",
          "How much is ...?",
          "Excuse me, how can I get to ...?",
          "Could you please ...?",
        ],
        [
          "a bottle of water",
          "turn left",
          "go straight",
          "next to",
          "Could you please",
        ],
        [
          example(
            "Can I have a bottle of water and two sandwiches, please?",
            "请给我一瓶水和两个三明治，好吗？",
            "购物请求"
          ),
          example(
            "How much is this blue notebook beside the schoolbag?",
            "书包旁边这个蓝色笔记本多少钱？",
            "询价 + 位置"
          ),
          example(
            "Excuse me, how can I get to the library from the bus stop?",
            "打扰一下，从公交站怎么去图书馆？",
            "问路起句"
          ),
          example(
            "Could you please show me the way to the art room?",
            "您能告诉我去美术教室的路吗？",
            "更礼貌的请求"
          ),
        ],
        [
          drill(
            "把 a bottle of water 改成你真正想买的东西。",
            "Can I have a small cake and a glass of milk, please?",
            "购物句里数量词和食物要搭配。"
          ),
          drill(
            "把 library 改成 playground / museum / station。",
            "Excuse me, how can I get to the museum from here?",
            "问路时最好把起点也带上。"
          ),
          drill(
            "把 show me the way 改成 open the door / check this box / help me carry this bag。",
            "Could you please help me carry this bag?",
            "Could you please 后面接动词原形。"
          ),
        ],
        [
          drill(
            "打扰一下，去医院怎么走？",
            "Excuse me, how can I get to the hospital?",
            "问路时先用 Excuse me 开头更自然。"
          ),
          drill(
            "你能帮我打开这个盒子吗？",
            "Could you please help me open this box?",
            "help me 后面接动词原形。"
          ),
        ],
        "设计一个小对话：一共 4 句，包含 1 个购物句和 1 个问路句。",
        [
          "礼貌请求训练的关键是请孩子把 please、excuse me、could you please 说顺。",
          "如果孩子只是会背句型，要马上换场景，看看能不能把内容替换出来。"
        ]
      ),
    ]
  ),
  chapter(
    "junior",
    "初中 2000 词进阶句子训练",
    "让句子开始带原因、比较、计划和解决问题的意识。",
    "词汇范围：1200 - 2000",
    [
      unit(
        "j1",
        "过去经历与周末回顾",
        "把过去做了什么、在哪里、和谁一起、结果如何说完整。",
        "能够用连续句回顾一次周末或一次活动，句子里带时间、动作和结果。",
        [
          "Last ..., I ... with ...",
          "We first ..., and then ...",
          "I was ..., so I ...",
          "In the end, ...",
        ],
        [
          "last weekend",
          "at the museum",
          "on the way home",
          "in the end",
          "had a great time",
        ],
        [
          example(
            "Last Saturday, I visited the science museum with my classmates.",
            "上周六，我和同学去了科学博物馆。",
            "过去时间 + 同伴"
          ),
          example(
            "We first watched a robot show, and then we made a small paper bridge.",
            "我们先看了机器人表演，然后做了一座小纸桥。",
            "动作顺序"
          ),
          example(
            "I was tired on the way home, so I fell asleep on the bus.",
            "回家路上我很累，所以在公交车上睡着了。",
            "感受 + 结果"
          ),
          example(
            "In the end, I brought home a photo and many new ideas.",
            "最后，我带回了一张照片和很多新的想法。",
            "结尾收束"
          ),
        ],
        [
          drill(
            "把 science museum 改成你去过的地方，再换一个同伴。",
            "Last Sunday, I visited the city library with my cousin.",
            "过去经历句一定要先定时间，再定地点和人物。"
          ),
          drill(
            "把 watched a robot show 改成两个你真正做过的动作。",
            "We first fed the ducks, and then we rode a boat on the lake.",
            "first 和 then 可以帮助孩子自然展开两句内容。"
          ),
          drill(
            "把 tired 改成 excited / nervous / hungry，再换一个结果。",
            "I was excited, so I took many photos and asked many questions.",
            "so 后面要写看得见的结果。"
          ),
        ],
        [
          drill(
            "上周日我和爸爸去了书店。",
            "Last Sunday, I went to the bookstore with my father.",
            "went to 比 visit 更适合去书店这样的地点。"
          ),
          drill(
            "最后我们很晚才回家，但是玩得很开心。",
            "In the end, we went home late, but we had a great time.",
            "结尾句很适合放结果和感受。"
          ),
        ],
        "写一段 5 句的周末回顾：时间、地点、同伴、两个动作、一个结果。",
        [
          "过去时训练不要只盯动词变化，还要训练事件顺序。",
          "如果孩子只会写 I went there. 继续追问：和谁？先做什么？后来发生什么？"
        ]
      ),
      unit(
        "j2",
        "原因、结果与情绪表达",
        "练会 because、so、when 等连接，让句子开始有逻辑。",
        "能把一件事发生的原因、结果和感受连接起来，不再只写简单判断句。",
        [
          "I felt ... because ...",
          "..., so ...",
          "When ..., I ...",
          "Although ..., ...",
        ],
        [
          "feel nervous",
          "be proud of",
          "make a mistake",
          "as a result",
          "although",
        ],
        [
          example(
            "I felt nervous because I had to speak in front of the whole class.",
            "我感到紧张，因为我必须在全班面前发言。",
            "感受 + 原因"
          ),
          example(
            "My brother missed the bus, so he arrived at school late.",
            "我哥哥错过了公交车，所以他上学迟到了。",
            "结果句"
          ),
          example(
            "When I made a mistake, my teacher smiled and asked me to try again.",
            "当我犯错时，老师微笑着让我再试一次。",
            "when 从句"
          ),
          example(
            "Although the task was difficult, our group finished it on time.",
            "虽然任务很难，但我们小组还是按时完成了。",
            "让步表达"
          ),
        ],
        [
          drill(
            "把 nervous 改成 proud / worried / excited，并换一个 because。",
            "I felt proud because my picture was on the classroom wall.",
            "because 后面最好给出具体事件。"
          ),
          drill(
            "把 missed the bus 改成 forgot his homework / got up late / lost her key。",
            "Lucy forgot her homework, so she borrowed a notebook from her friend.",
            "so 后面的结果要合理。"
          ),
          drill(
            "把 task was difficult 改成 weather was cold / room was small，再补一个结果。",
            "Although the weather was cold, the players kept running on the field.",
            "although 之后要保留对比感。"
          ),
        ],
        [
          drill(
            "我很开心，因为我的妈妈来看我的比赛了。",
            "I felt happy because my mother came to watch my game.",
            "come to watch 是很自然的表达。"
          ),
          drill(
            "虽然我很累，但是我还是写完了作业。",
            "Although I was tired, I still finished my homework.",
            "still 很适合放在主句中加强语气。"
          ),
        ],
        "围绕一次“紧张后来变自信”的经历写 4 句，必须用 because 和 although 各一次。",
        [
          "句子训练到了这个阶段，要开始让孩子意识到“为什么”和“结果是什么”。",
          "如果 because 和 so 总是乱用，就让孩子先用中文说清逻辑，再翻成英文。"
        ]
      ),
      unit(
        "j3",
        "比较、选择与建议",
        "会用比较级、prefer、had better 等结构表达更清楚的选择。",
        "能比较两个对象、说明自己更喜欢哪一个，并给出简单建议。",
        [
          "A is ... than B.",
          "I prefer ... to ... because ...",
          "If I were you, I would ...",
          "You had better ...",
        ],
        [
          "more interesting than",
          "prefer tea to coffee",
          "had better",
          "be better for",
          "save time",
        ],
        [
          example(
            "Reading on paper is more relaxing than reading on a screen.",
            "读纸质书比看屏幕更让人放松。",
            "比较级"
          ),
          example(
            "I prefer taking the subway to driving because it saves time in the morning.",
            "我更喜欢坐地铁而不是开车，因为早上更省时间。",
            "prefer ... to ..."
          ),
          example(
            "If I were you, I would talk to the teacher after class.",
            "如果我是你，我会课后和老师谈一谈。",
            "建议句"
          ),
          example(
            "You had better finish the hard part first and check it later.",
            "你最好先完成难的部分，再回头检查。",
            "较强建议"
          ),
        ],
        [
          drill(
            "把 reading on paper 改成两个你能比较的东西。",
            "Jogging in the park is healthier than staying inside all day.",
            "比较句要比较同一类事物。"
          ),
          drill(
            "把 taking the subway 改成 walking / riding a bike / taking a bus。",
            "I prefer riding a bike to taking a bus because I can enjoy the fresh air.",
            "prefer 后面尽量保持两个动作形式一致。"
          ),
          drill(
            "把 talk to the teacher 改成一个你想给朋友的建议。",
            "If I were you, I would make a simple plan before starting the project.",
            "建议句要具体，不能只说 try harder。"
          ),
        ],
        [
          drill(
            "我更喜欢在家学习，因为那里更安静。",
            "I prefer studying at home because it is quieter there.",
            "prefer 后面如果不比较两项，也可以直接接动名词。"
          ),
          drill(
            "你最好先做最重要的事情。",
            "You had better do the most important thing first.",
            "had better 后面接动词原形。"
          ),
        ],
        "围绕“我更喜欢哪种学习方式”写 4 句，至少用 1 个比较句和 1 个建议句。",
        [
          "比较训练不是为了背 than，而是让孩子学会把理由说出来。",
          "建议句里尽量让孩子少用 should，多练 had better 和 If I were you。"
        ]
      ),
      unit(
        "j4",
        "计划安排与未来打算",
        "让句子从“想做什么”走向“什么时候、和谁、为什么做”。",
        "能表达短期计划和长期打算，并把时间、原因、准备工作说清楚。",
        [
          "I am going to ...",
          "I plan to ... so that ...",
          "Next ..., we will ...",
          "Before ..., I need to ...",
        ],
        [
          "next month",
          "be going to",
          "plan to",
          "so that",
          "get ready for",
        ],
        [
          example(
            "I am going to join the school reading club next term.",
            "下学期我打算加入学校阅读社团。",
            "be going to"
          ),
          example(
            "I plan to practice speaking every evening so that I can answer faster in class.",
            "我计划每天晚上练习口语，这样我在课堂上就能回答得更快。",
            "计划 + 目的"
          ),
          example(
            "Next month, our class will visit a farm and learn how vegetables grow.",
            "下个月，我们班要去农场参观，学习蔬菜是怎样生长的。",
            "未来安排"
          ),
          example(
            "Before the trip, I need to finish my report and pack a light jacket.",
            "旅行前，我需要完成报告并收好一件轻便外套。",
            "准备工作"
          ),
        ],
        [
          drill(
            "把 join the school reading club 改成一个你接下来想参加的活动。",
            "I am going to join the basketball team next term.",
            "活动后面最好加时间。"
          ),
          drill(
            "把 practice speaking 改成你真正要练的内容，再保留 so that。",
            "I plan to review new words every night so that I can remember them longer.",
            "so that 后面要写目标，不是重复前面的动作。"
          ),
          drill(
            "把 visit a farm 改成一个班级活动，再补一个学习目标。",
            "Next Friday, our class will go to the history museum and learn about old buildings.",
            "班级安排句适合同时带时间和目的。"
          ),
        ],
        [
          drill(
            "我打算这个周末和同学一起准备演讲。",
            "I am going to prepare for the speech with my classmates this weekend.",
            "prepare for 是高频搭配。"
          ),
          drill(
            "出发前，我需要检查地图并给妈妈打电话。",
            "Before we leave, I need to check the map and call my mother.",
            "两个准备动作可以用 and 连起来。"
          ),
        ],
        "写一个“下周学习计划”训练单：要做什么、什么时候做、为什么做、开始前准备什么。",
        [
          "未来计划句一定要追问“什么时候”“为了什么”，这样内容才不会空。",
          "如果孩子只会 I am going to study. 说明句子还没训练到位。"
        ]
      ),
      unit(
        "j5",
        "问题、规则与寻求帮助",
        "围绕校园和生活中的小问题，练会说明问题、提请求、给办法。",
        "能够说清自己遇到了什么问题，需要什么帮助，并提出一个可行的解决办法。",
        [
          "I cannot ... because ...",
          "Could you help me ...?",
          "We are not allowed to ..., so ...",
          "The best way to ... is to ...",
        ],
        [
          "ask for help",
          "be not allowed to",
          "solve the problem",
          "the best way",
          "instead of",
        ],
        [
          example(
            "I cannot finish the poster tonight because my printer is broken.",
            "我今晚没法完成海报，因为打印机坏了。",
            "问题 + 原因"
          ),
          example(
            "Could you help me check this chart before I hand it in?",
            "你能在我交之前帮我检查一下这张图表吗？",
            "请求帮助"
          ),
          example(
            "We are not allowed to run in the hallway, so we walk on the right side.",
            "我们不允许在走廊里奔跑，所以我们靠右走。",
            "规则 + 结果"
          ),
          example(
            "The best way to solve this problem is to talk calmly and listen first.",
            "解决这个问题最好的办法是先冷静地谈，再先听对方说。",
            "给办法"
          ),
        ],
        [
          drill(
            "把 printer is broken 改成一个真实的问题。",
            "I cannot send the file because the Internet is not working.",
            "问题句要尽量具体，不要总写 bad。"
          ),
          drill(
            "把 check this chart 改成老师或同学可能帮你的内容。",
            "Could you help me carry these books to the classroom?",
            "Could you help me 后面直接接动词原形。"
          ),
          drill(
            "把 run in the hallway 改成另一条规则，再写一个结果。",
            "We are not allowed to eat in the lab, so we finish our snacks outside.",
            "规则句最好配上 why 或 so。"
          ),
        ],
        [
          drill(
            "我不能按时到，因为自行车坏了。",
            "I cannot arrive on time because my bike is broken.",
            "arrive on time 是完整搭配。"
          ),
          drill(
            "解决这个问题最好的办法是先和他谈一谈。",
            "The best way to solve this problem is to talk to him first.",
            "solve this problem 是高频表达。"
          ),
        ],
        "写一段“我遇到的一个小问题”训练稿：问题是什么、原因是什么、你向谁求助、最后怎么解决。",
        [
          "问题类训练的核心是让孩子把“问题 - 请求 - 解决”三步说完整。",
          "如果只会写 I have a problem. 要继续追问：什么问题？为什么？怎么办？"
        ]
      ),
    ]
  ),
  chapter(
    "senior",
    "高中 7000 词拓展句子训练",
    "让句子更连贯、更有层次，开始具备输出观点和复述事件的能力。",
    "词汇范围：2000 - 7000",
    [
      unit(
        "s1",
        "学习方法与时间管理",
        "把学习习惯、效率问题和时间安排表达得更有逻辑。",
        "能围绕学习计划说明做法、原因、调整策略和预期结果。",
        [
          "I used to ..., but now I ...",
          "In order to ..., I ...",
          "If I want to ..., I need to ...",
          "As a result, ...",
        ],
        [
          "manage my time",
          "in order to",
          "review my notes",
          "stay focused",
          "as a result",
        ],
        [
          example(
            "I used to finish my homework very late, but now I make a simple plan before dinner.",
            "我过去总是很晚才写完作业，但现在我会在晚饭前先列一个简单计划。",
            "过去对比现在"
          ),
          example(
            "In order to stay focused, I put my phone in another room while I study.",
            "为了保持专注，我学习时把手机放在另一个房间。",
            "目的表达"
          ),
          example(
            "If I want to improve my writing, I need to read more good examples every week.",
            "如果我想提高写作，我每周都需要多读一些优秀范文。",
            "条件 + 需要"
          ),
          example(
            "As a result, I finish my tasks earlier and have more time to check them carefully.",
            "结果是，我更早完成任务，也有更多时间认真检查。",
            "结果句"
          ),
        ],
        [
          drill(
            "把 put my phone in another room 改成一个你自己的专注方法。",
            "In order to stay focused, I start with the hardest task and keep my desk clear.",
            "方法句里最好带上具体动作。"
          ),
          drill(
            "把 improve my writing 改成 improve my speaking / math / reading speed。",
            "If I want to improve my speaking, I need to practice short talks every day.",
            "if 和 need to 组合很适合表达学习计划。"
          ),
          drill(
            "把 finish my tasks earlier 改成另一个结果。",
            "As a result, I feel less stressed before exams.",
            "结果句可以写效率变化，也可以写感受变化。"
          ),
        ],
        [
          drill(
            "为了按时完成任务，我先做最难的部分。",
            "In order to finish the task on time, I do the hardest part first.",
            "目的状语最好放在句首，表达会更清楚。"
          ),
          drill(
            "如果我想提高阅读速度，我需要每天坚持练习。",
            "If I want to improve my reading speed, I need to practice every day.",
            "improve my reading speed 是一个完整搭配。"
          ),
        ],
        "写一个“我最近调整学习方法”的 5 句训练段：过去的问题、现在的做法、目的、结果、下一步打算。",
        [
          "这个阶段的句子训练要开始强调“策略”和“结果”，不能只停留在 I study hard。",
          "如果孩子能说出 used to 和 now 的对比，说明思维开始往完整表达走了。"
        ]
      ),
      unit(
        "s2",
        "团队合作与项目表达",
        "训练分工、合作、讨论和调整方案时的句子组织能力。",
        "能够清楚介绍一个小组任务中每个人做什么、问题出在哪里、后来如何改进。",
        [
          "Our group was responsible for ...",
          "While ..., I ...",
          "Instead of ..., we decided to ...",
          "By the end of ..., ...",
        ],
        [
          "be responsible for",
          "work as a team",
          "share ideas",
          "instead of",
          "by the end of",
        ],
        [
          example(
            "Our group was responsible for designing the poster and preparing the short talk.",
            "我们小组负责设计海报并准备简短发言。",
            "任务分工"
          ),
          example(
            "While my partner collected pictures, I organized the main points in order.",
            "我搭档收集图片时，我把主要观点按顺序整理出来。",
            "同时进行"
          ),
          example(
            "Instead of changing everything at the last minute, we decided to fix only the weak part.",
            "我们没有在最后一刻全部重做，而是决定只修改最薄弱的部分。",
            "方案调整"
          ),
          example(
            "By the end of the project, everyone understood the plan more clearly and worked faster.",
            "到项目结束时，每个人都更清楚计划，也合作得更快。",
            "结果总结"
          ),
        ],
        [
          drill(
            "把 designing the poster 改成一个你们做过的团队任务。",
            "Our group was responsible for recording a short science video and writing the script.",
            "责任句里用两个动作最容易把任务说完整。"
          ),
          drill(
            "把 collected pictures 改成你搭档做的另一项工作。",
            "While my partner checked the data, I wrote the opening paragraph.",
            "while 很适合训练同步发生的两个动作。"
          ),
          drill(
            "把 weak part 改成一个你们最后调整的内容。",
            "Instead of adding more pages, we decided to make the key ideas clearer.",
            "instead of 后面写没做的方案，后面写最终选择。"
          ),
        ],
        [
          drill(
            "我们小组负责做调查并展示结果。",
            "Our group was responsible for doing the survey and presenting the results.",
            "presenting the results 是自然搭配。"
          ),
          drill(
            "项目结束时，我们学会了怎样更好地分工。",
            "By the end of the project, we learned how to divide the work better.",
            "learned how to ... 很适合放在项目反思里。"
          ),
        ],
        "围绕一次小组合作写 5 句：任务是什么、你负责什么、别人负责什么、遇到什么调整、最后结果怎样。",
        [
          "团队合作句子很适合训练 while、instead of、by the end of 这类连接结构。",
          "如果孩子总写 We worked together. 说明还没有真正展开分工和过程。"
        ]
      ),
      unit(
        "s3",
        "环境责任与行动说明",
        "围绕校园环境、公共责任和实际行动表达清楚原因与建议。",
        "能就一个环境问题说明现象、影响、自己或集体的做法，以及建议。",
        [
          "More and more ..., which means ...",
          "If we continue to ..., ...",
          "One useful way to ... is to ...",
          "This small change can ...",
        ],
        [
          "save energy",
          "throw away",
          "use less paper",
          "take action",
          "make a difference",
        ],
        [
          example(
            "More and more students bring their own bottles, which means we use fewer plastic cups at school.",
            "越来越多的学生自带水杯，这意味着我们在学校里用更少的塑料杯。",
            "现象 + 结果"
          ),
          example(
            "If we continue to waste paper, the classroom bins will be full before noon.",
            "如果我们继续浪费纸张，教室垃圾桶中午前就会装满。",
            "条件后果"
          ),
          example(
            "One useful way to save energy is to turn off the lights as soon as we leave the room.",
            "节约能源的一个有效方法是我们一离开教室就关灯。",
            "做法表达"
          ),
          example(
            "This small change can make our school cleaner and remind others to do the same.",
            "这个小改变能让校园更整洁，也能提醒其他人这样做。",
            "影响表达"
          ),
        ],
        [
          drill(
            "把 bring their own bottles 改成另一个环保行为。",
            "More and more students take reusable lunch boxes, which means less rubbish after lunch.",
            "现象句后面最好解释意义。"
          ),
          drill(
            "把 waste paper 改成 leave the tap running / use too many plastic bags。",
            "If we continue to leave the tap running, we will waste a lot of clean water.",
            "if 句后面要写明确后果。"
          ),
          drill(
            "把 turn off the lights 改成一个你觉得可执行的校园行动。",
            "One useful way to keep the playground clean is to pick up rubbish after activities.",
            "建议一定要写得可操作。"
          ),
        ],
        [
          drill(
            "一个简单的办法是少用纸，多用电子资料。",
            "One simple way is to use less paper and more digital materials.",
            "less paper 和 more digital materials 构成很自然的对比。"
          ),
          drill(
            "这个小改变能提醒更多人关心环境。",
            "This small change can remind more people to care about the environment.",
            "care about 是高频搭配。"
          ),
        ],
        "围绕一个校园环保问题写 4 句：现象、后果、你的建议、这个建议的作用。",
        [
          "环保类句子不是为了堆词，而是为了练“现象 - 后果 - 行动 - 影响”的逻辑链。",
          "如果孩子总写 protect the environment，要继续问：怎么做？有什么具体效果？"
        ]
      ),
      unit(
        "s4",
        "观点表达与简单论证",
        "练会提出观点、给理由、举例子，再补一句回应不同意见。",
        "能够围绕一个熟悉话题写出带理由和例子的观点句，而不是只说 I think。",
        [
          "I believe ... because ...",
          "For example, ...",
          "Another reason is that ...",
          "Some people think ..., but I believe ...",
        ],
        [
          "in my opinion",
          "for example",
          "another reason",
          "be helpful for",
          "on the other hand",
        ],
        [
          example(
            "I believe students should learn basic cooking because it helps them take care of themselves.",
            "我认为学生应该学习基础烹饪，因为这能帮助他们照顾自己。",
            "观点 + 理由"
          ),
          example(
            "For example, a simple meal can save time and money when parents are busy.",
            "例如，当父母忙的时候，一顿简单的饭既省时间又省钱。",
            "举例支持"
          ),
          example(
            "Another reason is that cooking teaches us to plan the steps in the right order.",
            "另一个原因是做饭能教会我们按正确顺序安排步骤。",
            "补充理由"
          ),
          example(
            "Some people think it is enough to study from books, but I believe life skills are also important.",
            "有些人认为只学习书本知识就够了，但我认为生活技能也同样重要。",
            "回应不同观点"
          ),
        ],
        [
          drill(
            "把 basic cooking 改成一个你想表达看法的主题。",
            "I believe students should learn how to manage money because it helps them make wiser choices.",
            "观点句的主题要具体。"
          ),
          drill(
            "把 a simple meal can save time and money 改成一个新的例子。",
            "For example, students can prepare their schoolbags faster if they plan the night before.",
            "for example 后面最好放一件真实场景中的事。"
          ),
          drill(
            "把 it is enough to study from books 改成一个不同意见，再给出你的回应。",
            "Some people think homework should always be short, but I believe useful practice matters more than the length.",
            "but 后面要明确回到自己的观点。"
          ),
        ],
        [
          drill(
            "我认为学生应该学会管理时间，因为这会减少很多压力。",
            "I believe students should learn to manage their time because it can reduce a lot of stress.",
            "manage their time 是固定表达。"
          ),
          drill(
            "有些人觉得体育课不重要，但我认为它对健康和合作都很有帮助。",
            "Some people think PE is not important, but I believe it is helpful for both health and teamwork.",
            "be helpful for 是常用论证搭配。"
          ),
        ],
        "围绕“学生该不该学一项生活技能”写 5 句：观点、理由 1、例子、理由 2、回应不同看法。",
        [
          "观点类训练要把 because、for example、another reason 用顺，形成基本论证链。",
          "孩子一旦只会说 I think it is good. 老师就要继续追问 why、for example、but。"
        ]
      ),
      unit(
        "s5",
        "叙事顺序与事件复述",
        "把一件事讲得更完整，学会加入背景、转折、反应和结尾。",
        "能按顺序复述一次经历，并让句子之间有明显连接，不再像流水账。",
        [
          "At first, ...",
          "A few minutes later, ...",
          "Just when ..., ...",
          "Looking back, ...",
        ],
        [
          "at first",
          "a few minutes later",
          "just when",
          "to my surprise",
          "looking back",
        ],
        [
          example(
            "At first, everything went as planned, and we thought the activity would be easy.",
            "一开始，一切都按计划进行，我们以为这次活动会很轻松。",
            "背景铺垫"
          ),
          example(
            "A few minutes later, the wind became stronger and our papers started to fly away.",
            "几分钟后，风变得更大了，我们的纸张开始被吹走。",
            "情节推进"
          ),
          example(
            "Just when we were about to give up, our teacher showed us a better way to hold the board.",
            "就在我们快要放弃的时候，老师教了我们一个更好的拿板子的方法。",
            "关键转折"
          ),
          example(
            "Looking back, the problem helped us stay calm and work more carefully together.",
            "回头看，这个问题反而让我们学会更冷静、更认真地合作。",
            "结尾反思"
          ),
        ],
        [
          drill(
            "把 the wind became stronger 改成你故事里的一个变化。",
            "A few minutes later, the lights suddenly went out and the room became dark.",
            "中间变化最好能推动后面的情节。"
          ),
          drill(
            "把 our teacher showed us a better way 改成别人提供帮助的情节。",
            "Just when I felt lost, my friend pointed at the sign near the gate.",
            "just when 很适合写转折点。"
          ),
          drill(
            "把 the problem helped us ... 改成你最后得到的收获。",
            "Looking back, that small mistake taught me to prepare more carefully.",
            "结尾反思最好写 learned / realized / understood。"
          ),
        ],
        [
          drill(
            "刚开始，我们都觉得任务很简单。",
            "At first, we all thought the task was simple.",
            "thought 后面接完整从句。"
          ),
          drill(
            "回头看，那次经历让我更有耐心。",
            "Looking back, that experience made me more patient.",
            "make me more patient 是自然表达。"
          ),
        ],
        "用 5 句复述一件事：开始怎样、中间发生什么变化、转折点是什么、最后学到了什么。",
        [
          "复述训练最怕全是 then。要主动训练 at first、a few minutes later、just when、looking back。",
          "如果孩子能在结尾说出 learned 或 realized，说明叙事已经开始有深度。"
        ]
      ),
    ]
  ),
];

export function countSentenceUnits(): number {
  return ENGLISH_SENTENCE_CHAPTERS.reduce(
    (sum, chapterItem) => sum + chapterItem.units.length,
    0
  );
}

export function countSentenceExamples(): number {
  return ENGLISH_SENTENCE_CHAPTERS.reduce(
    (sum, chapterItem) =>
      sum + chapterItem.units.reduce((unitSum, unitItem) => unitSum + unitItem.examples.length, 0),
    0
  );
}

export function countSentenceDrills(): number {
  return ENGLISH_SENTENCE_CHAPTERS.reduce(
    (sum, chapterItem) =>
      sum +
      chapterItem.units.reduce(
        (unitSum, unitItem) =>
          unitSum +
          unitItem.substitutionDrills.length +
          unitItem.translationDrills.length,
        0
      ),
    0
  );
}
