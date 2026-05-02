export type GrammarExample = {
  english: string;
  chinese: string;
};

export type GrammarUnit = {
  id: number;
  title: string;
  summary: string;
  patterns: string[];
  examples: GrammarExample[];
};

export type GrammarChapter = {
  key: string;
  name: string;
  subtitle: string;
  units: GrammarUnit[];
};

const ex = (english: string, chinese: string): GrammarExample => ({
  english,
  chinese,
});

const unit = (
  id: number,
  title: string,
  summary: string,
  patterns: string[],
  examples: GrammarExample[]
): GrammarUnit => ({
  id,
  title,
  summary,
  patterns,
  examples,
});

const chapter = (
  key: string,
  name: string,
  subtitle: string,
  units: GrammarUnit[]
): GrammarChapter => ({
  key,
  name,
  subtitle,
  units,
});

export const ENGLISH_GRAMMAR_CHAPTERS: GrammarChapter[] = [
  chapter("present", "现在时", "9 个 unit · be 动词、现在进行时、一般现在时", [
    unit(
      1,
      "am / is / are",
      "用 be 动词说明身份、状态、地点、年龄等。I 用 am，he/she/it 用 is，you/we/they 用 are。",
      ["I am ...", "He / She / It is ...", "You / We / They are ..."],
      [
        ex("I am ten years old.", "我十岁。"),
        ex("She is in the classroom.", "她在教室里。"),
        ex("They are good friends.", "他们是好朋友。"),
      ]
    ),
    unit(
      2,
      "am / is / are（疑问句）",
      "be 动词放到主语前面就能构成一般疑问句，回答时也用 be 动词。",
      ["Am I ...?", "Is he / she ...?", "Are you / they ...?"],
      [
        ex("Are you ready for class?", "你准备好上课了吗？"),
        ex("Is your brother at home?", "你哥哥在家吗？"),
        ex("Are they hungry now?", "他们现在饿吗？"),
      ]
    ),
    unit(
      3,
      "I am doing（现在进行时）",
      "现在进行时表示“此刻正在发生”的动作，结构是 be + 动词 ing。",
      ["I am reading.", "She is running.", "They are playing."],
      [
        ex("I am doing my homework now.", "我现在正在做作业。"),
        ex("Tom is drawing a robot.", "汤姆正在画一个机器人。"),
        ex("The girls are singing in the music room.", "女孩们正在音乐教室唱歌。"),
      ]
    ),
    unit(
      4,
      "Are you doing...?（现在进行时疑问句）",
      "现在进行时的疑问句把 be 动词提前，常用来问“现在正在做什么”。",
      ["Are you ...ing?", "Is he / she ...ing?", "What are they ...ing?"],
      [
        ex("Are you listening to me?", "你现在在听我说吗？"),
        ex("Is your mother cooking dinner?", "你妈妈正在做晚饭吗？"),
        ex("What are the boys playing?", "男孩们正在玩什么？"),
      ]
    ),
    unit(
      5,
      "I do / work / like（一般现在时）",
      "一般现在时表示习惯、事实和经常发生的事情。",
      ["I play football after school.", "She likes music.", "Birds fly."],
      [
        ex("I walk to school every day.", "我每天走路去学校。"),
        ex("My father works in a hospital.", "我爸爸在医院工作。"),
        ex("Cats like warm places.", "猫喜欢暖和的地方。"),
      ]
    ),
    unit(
      6,
      "I don't...（一般现在时否定）",
      "一般现在时的否定句常用 do not / does not。第三人称单数要用 does not。",
      ["I don't like milk.", "He doesn't get up late.", "We don't watch TV on school nights."],
      [
        ex("I don't eat ice cream in winter.", "我冬天不吃冰激凌。"),
        ex("Lucy doesn't play basketball.", "露西不打篮球。"),
        ex("We don't go out on rainy days.", "下雨天我们不出门。"),
      ]
    ),
    unit(
      7,
      "Do you...?（一般现在时疑问）",
      "一般现在时的一般疑问句用 do / does 开头。",
      ["Do you ...?", "Does he / she ...?", "Where do they ...?"],
      [
        ex("Do you help your parents at home?", "你在家会帮父母吗？"),
        ex("Does Amy like science?", "艾米喜欢科学吗？"),
        ex("Where do your grandparents live?", "你的祖父母住在哪里？"),
      ]
    ),
    unit(
      8,
      "I am doing 与 I do",
      "现在进行时强调“现在正在做”，一般现在时强调“平时常做”或“事实”。",
      ["I am reading now.", "I read every evening.", "She is wearing a blue dress today."],
      [
        ex("I am washing my hands now, but I usually wash them after lunch.", "我现在正在洗手，但我通常在午饭后洗手。"),
        ex("Sam is riding a bike today, but he usually walks to school.", "山姆今天骑车，但他平时走路上学。"),
        ex("It is raining now, but it often rains here in spring.", "现在在下雨，但这里春天经常下雨。"),
      ]
    ),
    unit(
      9,
      "I have... / I've got...",
      "have 和 have got 都能表示“有”，日常口语里 I've got 很常见。",
      ["I have a new bag.", "I've got two pencils.", "She has a small dog."],
      [
        ex("I have a map of China.", "我有一张中国地图。"),
        ex("We've got a big yard.", "我们有一个大院子。"),
        ex("She has a music class on Friday.", "她星期五有音乐课。"),
      ]
    ),
  ]),
  chapter("past", "过去时", "5 个 unit · 过去状态、过去动作、过去进行时", [
    unit(
      10,
      "was / were",
      "was 和 were 是 am / is / are 的过去式，用来表示过去的状态和情况。",
      ["I was ...", "He / She was ...", "You / We / They were ..."],
      [
        ex("I was tired after the game.", "比赛后我很累。"),
        ex("The movie was interesting.", "那部电影很有趣。"),
        ex("They were in the library yesterday.", "他们昨天在图书馆。"),
      ]
    ),
    unit(
      11,
      "worked / got / went（一般过去时）",
      "一般过去时表示过去发生并结束的动作，规则动词常加 -ed，不规则动词形式要记。",
      ["I played.", "She watched.", "He went."],
      [
        ex("We visited the zoo last Sunday.", "上周日我们去了动物园。"),
        ex("My sister finished her book last night.", "我妹妹昨晚看完了她的书。"),
        ex("Dad went to Shanghai two days ago.", "爸爸两天前去了上海。"),
      ]
    ),
    unit(
      12,
      "I didn't... / Did you...?",
      "一般过去时的否定句和疑问句用 did。用了 did 以后，动词回到原形。",
      ["I didn't see him.", "Did you call me?", "She didn't finish it."],
      [
        ex("I didn't bring my ruler today.", "我今天没有带尺子。"),
        ex("Did you watch the game last night?", "你昨晚看比赛了吗？"),
        ex("They didn't go out because it was windy.", "因为风大，他们没有出去。"),
      ]
    ),
    unit(
      13,
      "I was doing（过去进行时）",
      "过去进行时表示过去某一时刻正在进行的动作，结构是 was / were + 动词 ing。",
      ["I was reading at eight.", "She was cooking then.", "They were waiting outside."],
      [
        ex("I was brushing my teeth when you called.", "你打电话时，我正在刷牙。"),
        ex("Ben was sleeping at nine o'clock.", "九点时本正在睡觉。"),
        ex("We were having lunch at that time.", "那时我们正在吃午饭。"),
      ]
    ),
    unit(
      14,
      "I was doing 与 I did",
      "过去进行时强调“那时正在做”，一般过去时强调“做了并结束了”。",
      ["I was walking home when it started to rain.", "I walked home after school."],
      [
        ex("I was taking a shower when the lights went out.", "灯灭时我正在洗澡。"),
        ex("She was reading, then she closed the book.", "她当时正在读书，后来把书合上了。"),
        ex("We were playing in the yard when Mum called us.", "妈妈叫我们时，我们正在院子里玩。"),
      ]
    ),
  ]),
  chapter("present-perfect", "现在完成时", "6 个 unit · have done、just、already、yet、for、since", [
    unit(
      15,
      "I have done（现在完成时 1）",
      "现在完成时表示过去发生的事对现在还有结果，结构是 have / has + 过去分词。",
      ["I have finished.", "She has lost her key.", "We have cleaned the room."],
      [
        ex("I have done my homework, so I can play now.", "我已经做完作业了，所以现在可以玩了。"),
        ex("She has broken her pencil.", "她把铅笔弄断了。"),
        ex("We have washed the dishes.", "我们已经洗好碗了。"),
      ]
    ),
    unit(
      16,
      "I've just / already / yet",
      "just 表示“刚刚”，already 表示“已经”，yet 常用在否定句和疑问句里，表示“还、已经”。",
      ["I've just arrived.", "She has already eaten.", "Have you finished yet?"],
      [
        ex("I have just opened the window.", "我刚刚把窗户打开。"),
        ex("Tom has already fed the fish.", "汤姆已经喂过鱼了。"),
        ex("We haven't started yet.", "我们还没有开始。"),
      ]
    ),
    unit(
      17,
      "Have you ever...?",
      "ever 表示“曾经”，常和现在完成时一起用来谈经验。",
      ["Have you ever been to Beijing?", "Has she ever ridden a horse?"],
      [
        ex("Have you ever seen snow?", "你曾经见过雪吗？"),
        ex("Has your brother ever climbed a hill?", "你哥哥爬过山吗？"),
        ex("I have never eaten that fruit.", "我从来没有吃过那种水果。"),
      ]
    ),
    unit(
      18,
      "How long have you...?",
      "问“做某事多久了”时，常用 How long + have / has + 主语 + 过去分词。",
      ["How long have you lived here?", "How long has she known him?"],
      [
        ex("How long have you studied English?", "你学英语多久了？"),
        ex("She has stayed in this school for three years.", "她在这所学校待了三年。"),
        ex("We have known our teacher since September.", "从九月起我们就认识老师了。"),
      ]
    ),
    unit(
      19,
      "for / since / ago",
      "for 后面接一段时间，since 后面接起点，ago 常和一般过去时一起表示“多久以前”。",
      ["for two days", "since Monday", "three years ago"],
      [
        ex("I have had this bike for two years.", "我有这辆自行车两年了。"),
        ex("She has been busy since this morning.", "她从今天早上起就很忙。"),
        ex("We moved here three months ago.", "我们三个月前搬到这里。"),
      ]
    ),
    unit(
      20,
      "I have done 与 I did",
      "现在完成时看结果和现在的关系，一般过去时看过去发生的时间。",
      ["I have lost my watch.", "I lost my watch yesterday."],
      [
        ex("I have eaten lunch, so I'm not hungry.", "我已经吃过午饭了，所以不饿。"),
        ex("I ate lunch at twelve o'clock.", "我十二点吃的午饭。"),
        ex("She has gone home. She went home at five.", "她已经回家了。她五点回的家。"),
      ]
    ),
  ]),
  chapter("passive", "被动语态", "2 个 unit · is done、is being done、has been done", [
    unit(
      21,
      "is done / was done",
      "被动语态强调“事情被做了”，而不是“谁做的”。结构是 be + 过去分词。",
      ["The room is cleaned every day.", "The cake was made by Mum."],
      [
        ex("English is spoken in many countries.", "英语在很多国家被使用。"),
        ex("Our classroom was painted last summer.", "我们的教室去年夏天被粉刷过。"),
        ex("The homework is checked every morning.", "作业每天早上都会被检查。"),
      ]
    ),
    unit(
      22,
      "is being done / has been done",
      "is being done 表示“正在被做”，has been done 表示“已经被做完”。",
      ["The bridge is being built.", "The work has been finished."],
      [
        ex("The lunch is being prepared now.", "午饭现在正在被准备。"),
        ex("The windows have been cleaned.", "窗户已经被擦干净了。"),
        ex("A new playground is being built behind the school.", "学校后面正在建一个新操场。"),
      ]
    ),
  ]),
  chapter("verb-forms", "动词形式", "2 个 unit · be / have / do、规则与不规则动词", [
    unit(
      23,
      "现在时与过去时中的 be / have / do",
      "be、have、do 都有现在式和过去式，常用来组成句子、疑问句和否定句。",
      ["am / is / are -> was / were", "have / has -> had", "do / does -> did"],
      [
        ex("I am ready now, but I was late yesterday.", "我现在准备好了，但我昨天迟到了。"),
        ex("She has a kite, and she had one last year too.", "她有一只风筝，去年她也有一只。"),
        ex("We do our homework after dinner, and we did it early yesterday.", "我们晚饭后做作业，昨天我们也很早做了。"),
      ]
    ),
    unit(
      24,
      "规则动词与不规则动词",
      "规则动词过去式常加 -ed，不规则动词需要单独记忆。",
      ["play -> played", "watch -> watched", "go -> went"],
      [
        ex("I played chess after school.", "我放学后下了国际象棋。"),
        ex("He watched a short movie last night.", "他昨晚看了一部短电影。"),
        ex("They went to the museum on Saturday.", "他们星期六去了博物馆。"),
      ]
    ),
  ]),
  chapter("future", "将来时", "4 个 unit · 计划、打算、意愿与预测", [
    unit(
      25,
      "What are you doing tomorrow?",
      "现在进行时也可以表示已经安排好的将来计划。",
      ["I'm meeting my teacher tomorrow.", "We are visiting Grandma on Sunday."],
      [
        ex("I am playing table tennis after class tomorrow.", "我明天下课后要打乒乓球。"),
        ex("Dad is taking us to the science museum this weekend.", "爸爸这个周末要带我们去科技馆。"),
        ex("What are you doing this evening?", "你今晚打算做什么？"),
      ]
    ),
    unit(
      26,
      "I'm going to...",
      "be going to 常表示打算、计划，或者根据眼前情况做出的判断。",
      ["I'm going to read.", "She is going to buy a dictionary."],
      [
        ex("I am going to clean my desk after lunch.", "我午饭后要整理书桌。"),
        ex("They are going to plant trees on Friday.", "他们星期五要种树。"),
        ex("Look at the dark clouds. It is going to rain.", "看那些乌云。要下雨了。"),
      ]
    ),
    unit(
      27,
      "will / shall（1）",
      "will 常表示临时决定、预测和将来会发生的事。",
      ["I'll help you.", "It will be sunny tomorrow.", "We will win."],
      [
        ex("Your bag is heavy. I will carry it.", "你的包很重。我来帮你拿。"),
        ex("I think our team will play well.", "我觉得我们队会打得很好。"),
        ex("The bus will arrive in five minutes.", "公交车五分钟后到。"),
      ]
    ),
    unit(
      28,
      "will / shall（2）",
      "shall 常见于建议和提议中，如 Shall we...?；will 还可表示承诺和请求。",
      ["Shall we start?", "Will you open the door?", "I won't forget."],
      [
        ex("Shall we draw the map first?", "我们先画地图好吗？"),
        ex("Will you pass me the tape?", "你把胶带递给我好吗？"),
        ex("I will call you after school.", "我放学后会给你打电话。"),
      ]
    ),
  ]),
  chapter("modals", "情态动词与祈使句", "7 个 unit · might、can、must、should、have to、would like、祈使句", [
    unit(
      29,
      "might",
      "might 表示“也许、可能”，语气比 will 更不确定。",
      ["It might rain.", "She might come later."],
      [
        ex("We might go to the park after dinner.", "我们晚饭后也许会去公园。"),
        ex("He might be busy this afternoon.", "他今天下午可能很忙。"),
        ex("The answer might be on the next page.", "答案可能在下一页。"),
      ]
    ),
    unit(
      30,
      "can 与 could",
      "can 表示现在的能力或许可；could 常表示过去的能力，也可更礼貌地请求。",
      ["I can swim.", "Could you help me?", "When I was six, I could read simple books."],
      [
        ex("My sister can play the piano.", "我妹妹会弹钢琴。"),
        ex("Could you close the window, please?", "请你把窗户关上，好吗？"),
        ex("Grandpa could run very fast when he was young.", "爷爷年轻时跑得很快。"),
      ]
    ),
    unit(
      31,
      "must / mustn't / don't need to",
      "must 表示“必须”，mustn't 表示“禁止”，don't need to 表示“没必要”。",
      ["You must finish it.", "You mustn't run here.", "You don't need to come early."],
      [
        ex("We must wear sports shoes in PE class.", "体育课我们必须穿运动鞋。"),
        ex("You mustn't touch the hot pan.", "你不可以碰热锅。"),
        ex("You don't need to bring your lunch today.", "你今天不用带午饭。"),
      ]
    ),
    unit(
      32,
      "should",
      "should 表示建议、应该做的事。",
      ["You should sleep early.", "He should say sorry."],
      [
        ex("You should drink more water after running.", "跑步后你应该多喝水。"),
        ex("We should listen carefully in class.", "我们上课应该认真听讲。"),
        ex("She should finish her project before Friday.", "她应该在周五前完成项目。"),
      ]
    ),
    unit(
      33,
      "I have to...",
      "have to 表示因为规则、时间或情况而“不得不”。",
      ["I have to get up at six.", "She has to wear glasses."],
      [
        ex("I have to take the bus because it is far.", "因为路远，我不得不坐公交车。"),
        ex("Tom has to stay at home today.", "汤姆今天不得不待在家里。"),
        ex("We have to hand in the work before lunch.", "我们必须在午饭前交作业。"),
      ]
    ),
    unit(
      34,
      "Would you like...? / I'd like...",
      "Would you like...? 用来礼貌邀请或提议；I'd like... 表示“我想要……”。",
      ["Would you like some juice?", "I'd like a small cake."],
      [
        ex("Would you like to sit by the window?", "你想坐在窗边吗？"),
        ex("I'd like some noodles, please.", "我想要一些面条。"),
        ex("Would they like to join our game?", "他们想加入我们的游戏吗？"),
      ]
    ),
    unit(
      35,
      "Do this! Don't do that! Let's...",
      "祈使句用来发出指令、提醒或邀请。动词原形开头。",
      ["Open your book.", "Don't be late.", "Let's start now."],
      [
        ex("Put your name on the paper.", "把你的名字写在纸上。"),
        ex("Don't talk in the library.", "不要在图书馆讲话。"),
        ex("Let's make a poster together.", "我们一起做海报吧。"),
      ]
    ),
  ]),
  chapter("used-to-there-it", "used to / there / it", "4 个 unit · 过去习惯、there 句型与 it", [
    unit(
      36,
      "I used to...",
      "used to 表示过去常常做、现在不一定还做的事。",
      ["I used to play here.", "She used to be shy."],
      [
        ex("I used to sleep with the light on.", "我以前常开着灯睡觉。"),
        ex("My dad used to live near the sea.", "我爸爸以前住在海边。"),
        ex("This street used to be very quiet.", "这条街以前很安静。"),
      ]
    ),
    unit(
      37,
      "there is / there are",
      "there is / there are 表示“某处有某物 / 某人”。",
      ["There is a book on the desk.", "There are two cats outside."],
      [
        ex("There is some milk in the fridge.", "冰箱里有一些牛奶。"),
        ex("There are many trees behind our school.", "我们学校后面有很多树。"),
        ex("Is there a post office near here?", "这附近有邮局吗？"),
      ]
    ),
    unit(
      38,
      "there was / were / has been / will be",
      "there 句型也可以放在过去、现在完成和将来时里。",
      ["There was a storm last night.", "There has been an accident.", "There will be a show."],
      [
        ex("There were ten children in the room.", "房间里有十个孩子。"),
        ex("There has been a big change in our town.", "我们小镇已经有了很大变化。"),
        ex("There will be a football game tomorrow.", "明天会有一场足球赛。"),
      ]
    ),
    unit(
      39,
      "It...",
      "it 可以指天气、时间、距离，也可以先占位置，再说明真正内容。",
      ["It is cold.", "It is seven o'clock.", "It is fun to read."],
      [
        ex("It is windy today.", "今天有风。"),
        ex("It is not far from my home to school.", "从我家到学校不远。"),
        ex("It is easy to carry this box.", "搬这个箱子很容易。"),
      ]
    ),
  ]),
  chapter("auxiliaries", "助动词", "4 个 unit · be、have、do、too、either、so、neither", [
    unit(
      40,
      "I am, I don't 等",
      "英语里常用 be、have、do 来帮助构成句子、疑问句、否定句和简短回答。",
      ["I am ready.", "I don't know.", "Have you finished?"],
      [
        ex("I am not tired yet.", "我还不累。"),
        ex("We don't need more paper.", "我们不需要更多纸了。"),
        ex("Has she cleaned her desk?", "她整理好书桌了吗？"),
      ]
    ),
    unit(
      41,
      "have you? / are you? / don't you? 等",
      "简短附加部分常跟在句子后面，用来确认、提醒或表示惊讶。",
      ["It's cold, isn't it?", "You can swim, can't you?"],
      [
        ex("You are in Grade Five, aren't you?", "你上五年级了，对吗？"),
        ex("She doesn't eat meat, does she?", "她不吃肉，是吗？"),
        ex("We have met before, haven't we?", "我们以前见过，对吧？"),
      ]
    ),
    unit(
      42,
      "too / either / so am I / neither do I",
      "too 表示“也”，either 常用于否定句；so / neither 可以表示“我也是 / 我也不是”。",
      ["I like tea too.", "I don't like coffee either.", "So do I."],
      [
        ex("I can ride a bike, and my brother can too.", "我会骑自行车，我哥哥也会。"),
        ex("She isn't busy, and I am not busy either.", "她不忙，我也不忙。"),
        ex("I love stories. So do we.", "我喜欢故事，我们也喜欢。"),
      ]
    ),
    unit(
      43,
      "isn't / haven't / don't 等否定",
      "不同句型要选对否定形式：be 用 not，have / has 和 do / does 也有自己的否定形式。",
      ["isn't", "haven't", "don't / doesn't"],
      [
        ex("He isn't at school today.", "他今天没来学校。"),
        ex("I haven't finished my poster.", "我还没有做完海报。"),
        ex("They don't understand this word.", "他们不懂这个单词。"),
      ]
    ),
  ]),
  chapter("questions", "疑问句", "6 个 unit · 一般疑问句、特殊疑问句、间接问句", [
    unit(
      44,
      "Is it...? / Have you...? / Do they...?",
      "一般疑问句通常把助动词或 be 动词放在主语前面。",
      ["Is it...?", "Have you...?", "Do they...?"],
      [
        ex("Is it your notebook?", "这是你的笔记本吗？"),
        ex("Have you seen my ruler?", "你看到我的尺子了吗？"),
        ex("Do they live near the river?", "他们住在河边吗？"),
      ]
    ),
    unit(
      45,
      "Who saw you? / Who did you see?",
      "问主语和问宾语时，句子结构不同。问主语通常不用 do / did。",
      ["Who came?", "Who did you meet?"],
      [
        ex("Who opened the door?", "谁开的门？"),
        ex("Who did you ask for help?", "你向谁求助了？"),
        ex("Who called you last night?", "昨晚谁给你打电话了？"),
      ]
    ),
    unit(
      46,
      "Who is she talking to? / What is it like?",
      "疑问词后面跟正常疑问句结构；like 在这里常表示“是什么样”。",
      ["Who are you waiting for?", "What is it like?"],
      [
        ex("Who is your sister playing with?", "你妹妹在和谁玩？"),
        ex("What is the new teacher like?", "新老师是什么样的人？"),
        ex("Who were they speaking to?", "他们刚才在和谁说话？"),
      ]
    ),
    unit(
      47,
      "What...? / Which...? / How...?",
      "what 问事物，which 在有限范围内选择，how 问方式、状态和程度。",
      ["What do you want?", "Which bag is yours?", "How do you go home?"],
      [
        ex("What time do you get up?", "你几点起床？"),
        ex("Which picture do you like best?", "你最喜欢哪张图片？"),
        ex("How does your mother go to work?", "你妈妈怎么去上班？"),
      ]
    ),
    unit(
      48,
      "How long does it take...?",
      "How long can问时间长度，也常问“做某事要花多久”。",
      ["How long does it take to get there?", "How long is the movie?"],
      [
        ex("How long does it take to walk to school?", "走路去学校要多久？"),
        ex("It takes me fifteen minutes to clean my room.", "我打扫房间要十五分钟。"),
        ex("How long was your trip?", "你的旅行有多久？"),
      ]
    ),
    unit(
      49,
      "Do you know where...? / I don't know what...",
      "把问句放进更长的句子里时，语序通常要改回陈述句语序。",
      ["Do you know where he lives?", "I don't know what she wants."],
      [
        ex("Can you tell me when the class starts?", "你能告诉我课什么时候开始吗？"),
        ex("I don't know why he is sad.", "我不知道他为什么难过。"),
        ex("Do you remember where we put the key?", "你记得我们把钥匙放哪儿了吗？"),
      ]
    ),
  ]),
  chapter("reported", "间接引语", "1 个 unit · 转述别人说的话", [
    unit(
      50,
      "She said that... / He told me that...",
      "转述别人说的话时，常用 say 或 tell，不一定要完全重复原句。",
      ["She said that she was busy.", "He told me that the shop was closed."],
      [
        ex("Mum said that dinner was ready.", "妈妈说晚饭准备好了。"),
        ex("Our teacher told us that the test was easy.", "老师告诉我们测试不难。"),
        ex("Tom said that he could help us tomorrow.", "汤姆说他明天可以帮我们。"),
      ]
    ),
  ]),
  chapter("ing-infinitive", "动词 -ing 与不定式", "4 个 unit · doing、to do、want somebody to do", [
    unit(
      51,
      "work / working, go / going, do / doing",
      "动词加 -ing 后可以当作名词或和其他动词搭配使用。",
      ["Swimming is fun.", "I like reading.", "She is good at drawing."],
      [
        ex("Running in the morning makes me happy.", "早上跑步让我开心。"),
        ex("My brother enjoys making paper planes.", "我哥哥喜欢做纸飞机。"),
        ex("Reading before bed helps me relax.", "睡前阅读能让我放松。"),
      ]
    ),
    unit(
      52,
      "to do 与 doing",
      "有些动词后面接 to do，有些接 doing，还有些两种都可以，但意思可能不同。",
      ["want to go", "enjoy reading", "like playing"],
      [
        ex("I want to learn French one day.", "我以后想学法语。"),
        ex("She enjoys painting flowers.", "她喜欢画花。"),
        ex("We like to play outside after lunch.", "我们喜欢午饭后在外面玩。"),
      ]
    ),
    unit(
      53,
      "I want you to...",
      "want somebody to do something 表示“想让某人做某事”。",
      ["I want you to listen carefully.", "She wants him to wait."],
      [
        ex("My mother wants me to wash my hands first.", "我妈妈想让我先洗手。"),
        ex("The coach wants us to run faster.", "教练想让我们跑得更快。"),
        ex("I want my little brother to be careful.", "我想让我弟弟小心一点。"),
      ]
    ),
    unit(
      54,
      "I went to the shop to...",
      "to do 还可以表示目的，说明“去做某事是为了什么”。",
      ["I went there to buy milk.", "She opened the box to look inside."],
      [
        ex("I came early to help the teacher.", "我早点来是为了帮老师。"),
        ex("They went to the library to borrow books.", "他们去图书馆是为了借书。"),
        ex("He stood up to see the screen better.", "他站起来是为了更清楚地看屏幕。"),
      ]
    ),
  ]),
  chapter("go-get-do-make-have", "go / get / do / make / have", "4 个 unit · 常见高频动词搭配", [
    unit(
      55,
      "go to... / go on... / go for... / go -ing",
      "go 常和地点、活动、散步、购物等搭配，意思很多，要成组记。",
      ["go to school", "go for a walk", "go swimming"],
      [
        ex("We go to school at seven thirty.", "我们七点半去上学。"),
        ex("My parents go for a walk after dinner.", "我父母晚饭后去散步。"),
        ex("The children go skating in winter.", "孩子们冬天去滑冰。"),
      ]
    ),
    unit(
      56,
      "get",
      "get 常表示“得到、变得、到达、拿到”等，意思要看搭配。",
      ["get a gift", "get tired", "get home"],
      [
        ex("I get many emails from my cousin.", "我收到很多表哥的邮件。"),
        ex("She gets tired after long games.", "长时间比赛后她会累。"),
        ex("We usually get home before six.", "我们通常六点前到家。"),
      ]
    ),
    unit(
      57,
      "do 与 make",
      "do 常表示做事情、作业、工作；make 常表示制作、制造、使某事发生。",
      ["do homework", "make a cake", "do the washing-up"],
      [
        ex("I do my homework in the study.", "我在书房做作业。"),
        ex("Grandma makes delicious soup.", "奶奶会做很好喝的汤。"),
        ex("Let's make a list before shopping.", "购物前我们先列个清单吧。"),
      ]
    ),
    unit(
      58,
      "have",
      "have 可以表示“有”，也常和吃饭、上课、休息等活动连用。",
      ["have a sister", "have breakfast", "have a lesson"],
      [
        ex("We have breakfast at home.", "我们在家吃早饭。"),
        ex("She has two art classes every week.", "她每周有两节美术课。"),
        ex("Let's have a short break.", "我们休息一下吧。"),
      ]
    ),
  ]),
  chapter("pronouns", "人称代词与所有格", "6 个 unit · I/me、my/his、mine、反身代词、's", [
    unit(
      59,
      "I / me, he / him, they / them",
      "主格常作主语，宾格常作宾语或跟在介词后面。",
      ["I know him.", "They can help us.", "She saw me."],
      [
        ex("I gave him my pencil.", "我把铅笔给了他。"),
        ex("They asked us a question.", "他们问了我们一个问题。"),
        ex("She called me after class.", "她下课后给我打了电话。"),
      ]
    ),
    unit(
      60,
      "my / his / their 等",
      "形容词性物主代词后面必须接名词，用来表示“谁的”。",
      ["my book", "his bike", "their classroom"],
      [
        ex("This is my new notebook.", "这是我的新笔记本。"),
        ex("His shoes are under the chair.", "他的鞋在椅子下面。"),
        ex("Their teacher is very kind.", "他们的老师很和蔼。"),
      ]
    ),
    unit(
      61,
      "Whose is this? It's mine / yours / hers",
      "名词性物主代词可以单独使用，不需要再跟名词。",
      ["It's mine.", "Is this yours?", "The red bag is hers."],
      [
        ex("Whose cap is this? It's mine.", "这是谁的帽子？是我的。"),
        ex("The long ruler isn't ours.", "那把长尺子不是我们的。"),
        ex("This seat is yours.", "这个座位是你的。"),
      ]
    ),
    unit(
      62,
      "I / me / my / mine",
      "同一个人称在句中位置不同，形式也不同：I, me, my, mine。",
      ["I am ready.", "Please help me.", "My bag is here.", "The blue bag is mine."],
      [
        ex("I can't find my watch.", "我找不到我的手表。"),
        ex("Can you wait for me?", "你能等等我吗？"),
        ex("That green cup is mine.", "那个绿色杯子是我的。"),
      ]
    ),
    unit(
      63,
      "myself / yourself / themselves",
      "反身代词表示“自己”，常在动作回到自己身上时使用。",
      ["I taught myself.", "She looked at herself.", "They enjoyed themselves."],
      [
        ex("I made this card myself.", "这张卡片是我自己做的。"),
        ex("He hurt himself while climbing.", "他爬的时候弄伤了自己。"),
        ex("The children enjoyed themselves at the party.", "孩子们在聚会上玩得很开心。"),
      ]
    ),
    unit(
      64,
      "-'s（Kate's camera）",
      "在人或动物名词后加 's，可以表示所属关系。",
      ["Kate's camera", "my brother's bike", "the dog's tail"],
      [
        ex("This is Lily's pencil case.", "这是莉莉的笔袋。"),
        ex("My father's office is near the station.", "我爸爸的办公室在车站附近。"),
        ex("The cat's food is in the bowl.", "猫的食物在碗里。"),
      ]
    ),
  ]),
  chapter("articles", "a / an / the 与名词", "9 个 unit · 冠词、单复数、可数不可数名词", [
    unit(
      65,
      "a / an",
      "a 用在辅音音素前，an 用在元音音素前。它们都表示“一个”。",
      ["a book", "a uniform", "an apple", "an hour"],
      [
        ex("I need a pencil and an eraser.", "我需要一支铅笔和一块橡皮。"),
        ex("She has an umbrella in her bag.", "她包里有一把伞。"),
        ex("We saw a rabbit in the garden.", "我们在花园里看到一只兔子。"),
      ]
    ),
    unit(
      66,
      "train / trains, bus / buses",
      "可数名词有单数和复数。多数复数加 -s，有些要加 -es。",
      ["one train / two trains", "one bus / three buses"],
      [
        ex("There is one bus at the stop.", "车站有一辆公交车。"),
        ex("I can see three birds in the tree.", "我能看见树上有三只鸟。"),
        ex("These boxes are heavy.", "这些箱子很重。"),
      ]
    ),
    unit(
      67,
      "a bottle / some water（可数与不可数 1）",
      "可数名词能一个一个数，不可数名词通常不能直接数，要借助容器或单位。",
      ["a bottle of water", "some rice", "two cups of tea"],
      [
        ex("There is some milk on the table.", "桌上有一些牛奶。"),
        ex("I bought a bottle of juice.", "我买了一瓶果汁。"),
        ex("We need some bread for lunch.", "我们午饭需要一些面包。"),
      ]
    ),
    unit(
      68,
      "a cake / some cake / some cakes（可数与不可数 2）",
      "有些名词既可以作可数名词，也可以作不可数名词，意思会稍有不同。",
      ["a cake", "some cake", "some cakes"],
      [
        ex("There is a cake on the plate.", "盘子里有一个蛋糕。"),
        ex("Would you like some cake?", "你想来一点蛋糕吗？"),
        ex("The shop sells many small cakes.", "那家店卖很多小蛋糕。"),
      ]
    ),
    unit(
      69,
      "a / an 与 the 比较",
      "第一次提到某物常用 a / an；说双方都知道的那个时常用 the。",
      ["I saw a dog. The dog was black."],
      [
        ex("We bought a kite. The kite is yellow.", "我们买了一只风筝。那只风筝是黄色的。"),
        ex("I opened a box. The box was full of cards.", "我打开了一个盒子。那个盒子里全是卡片。"),
        ex("She found a coin. The coin was very old.", "她发现了一枚硬币。那枚硬币很旧。"),
      ]
    ),
    unit(
      70,
      "the...",
      "the 常用于特指、独一无二的事物，或前面已经说过的人和东西。",
      ["the sun", "the door", "the answer"],
      [
        ex("Please close the window.", "请把窗户关上。"),
        ex("The moon looks very bright tonight.", "今晚月亮看起来很亮。"),
        ex("I don't know the answer to this question.", "我不知道这道题的答案。"),
      ]
    ),
    unit(
      71,
      "go to work / go home / go to the cinema",
      "有些地点搭配前面不用 the，有些要加 the，要按固定搭配记忆。",
      ["go home", "go to school", "go to the cinema"],
      [
        ex("My father goes to work by bike.", "我爸爸骑车去上班。"),
        ex("We go home at five o'clock.", "我们五点回家。"),
        ex("They went to the cinema on Saturday.", "他们星期六去了电影院。"),
      ]
    ),
    unit(
      72,
      "I like music. I hate exams.",
      "谈论整体概念时，像 music、life、food 这样的名词前面常不用冠词。",
      ["I like music.", "She loves chocolate.", "We hate noise."],
      [
        ex("I enjoy reading before bed.", "我喜欢睡前阅读。"),
        ex("My brother hates cold weather.", "我哥哥讨厌冷天气。"),
        ex("Children need sleep and fresh air.", "孩子需要睡眠和新鲜空气。"),
      ]
    ),
    unit(
      73,
      "the...（地名）",
      "国家、城市、街道很多时候不用 the；河流、海洋、群岛等常用 the。",
      ["China", "Beijing", "the Yangtze", "the Pacific"],
      [
        ex("My aunt lives in Beijing.", "我阿姨住在北京。"),
        ex("The Nile is a famous river.", "尼罗河是一条著名的河流。"),
        ex("They traveled across the Pacific by ship long ago.", "很久以前他们乘船横渡了太平洋。"),
      ]
    ),
  ]),
  chapter("determiners", "限定词与代词", "11 个 unit · this、some、any、all、both、much、many 等", [
    unit(
      74,
      "this / that / these / those",
      "this / these 指近处，that / those 指远处；this / that 单数，these / those 复数。",
      ["this pen", "that tree", "these books", "those birds"],
      [
        ex("This apple is sweet.", "这个苹果很甜。"),
        ex("That mountain looks high.", "那座山看起来很高。"),
        ex("Those shoes are too big for me.", "那双鞋对我来说太大了。"),
      ]
    ),
    unit(
      75,
      "one / ones",
      "one 可以代替前面提到的单数名词，ones 代替复数名词，避免重复。",
      ["the red one", "the blue ones"],
      [
        ex("I don't like the small bag. I want the big one.", "我不喜欢小包。我想要大的那个。"),
        ex("These pencils are short. Those ones are longer.", "这些铅笔短，那些更长。"),
        ex("Which cake would you like? The chocolate one.", "你想要哪块蛋糕？巧克力那块。"),
      ]
    ),
    unit(
      76,
      "some 与 any",
      "some 常用于肯定句；any 常用于否定句和疑问句，但表示请求时也可用 some。",
      ["some water", "any questions", "Would you like some tea?"],
      [
        ex("I have some new stickers.", "我有一些新贴纸。"),
        ex("Do you have any ideas?", "你有任何想法吗？"),
        ex("We don't need any more chairs.", "我们不需要更多椅子了。"),
      ]
    ),
    unit(
      77,
      "not + any / no / none",
      "not any、no、none 都和“没有”有关，但句子位置和搭配不同。",
      ["I don't have any money.", "There is no milk.", "None of us is late."],
      [
        ex("There are no apples in the basket.", "篮子里没有苹果。"),
        ex("I don't have any free time today.", "我今天没有空。"),
        ex("None of the answers is correct.", "这些答案里没有一个是对的。"),
      ]
    ),
    unit(
      78,
      "not + anybody / anything / anywhere",
      "nobody、nothing、nowhere 本身就带否定意思，所以前面不用再加 not。",
      ["I didn't see anybody.", "Nobody came.", "There is nothing here."],
      [
        ex("I can't hear anything.", "我什么也听不见。"),
        ex("Nobody knows the full story.", "没有人知道全部经过。"),
        ex("We have nowhere to sit.", "我们没有地方坐。"),
      ]
    ),
    unit(
      79,
      "somebody / anything / nowhere 等",
      "some-, any-, no-, every- 开头的不定代词和不定副词常用来表达不确定的人、物和地点。",
      ["somebody", "anyone", "everything", "somewhere"],
      [
        ex("Somebody is waiting outside.", "有人在外面等。"),
        ex("Did you buy anything at the market?", "你在市场买了什么东西吗？"),
        ex("We looked everywhere for the cat.", "我们到处找那只猫。"),
      ]
    ),
    unit(
      80,
      "every 与 all",
      "every 强调“每一个”，all 强调整体“全部”。",
      ["every student", "all the students"],
      [
        ex("Every child got a small gift.", "每个孩子都收到了一份小礼物。"),
        ex("All the windows are open.", "所有窗户都开着。"),
        ex("I read a little every night.", "我每天晚上都读一点。"),
      ]
    ),
    unit(
      81,
      "all / most / some / any / no / none",
      "这些词表示数量范围，从“全部”到“没有”不等。",
      ["all of them", "most students", "some water", "none of us"],
      [
        ex("Most birds can fly.", "大多数鸟会飞。"),
        ex("Some of the cookies are still warm.", "有些饼干还是热的。"),
        ex("None of my friends likes spicy food.", "我的朋友里没有人喜欢辣的食物。"),
      ]
    ),
    unit(
      82,
      "both / either / neither",
      "both 表示“两者都”，either 表示“两个中的任意一个”，neither 表示“两者都不”。",
      ["both hands", "either answer", "neither side"],
      [
        ex("Both of my sisters can swim.", "我的两个姐姐都会游泳。"),
        ex("You can take either seat.", "你可以坐任意一个座位。"),
        ex("Neither picture is mine.", "两张图片都不是我的。"),
      ]
    ),
    unit(
      83,
      "a lot / much / many",
      "a lot of 既可接可数也可接不可数；many 接可数复数，much 接不可数名词。",
      ["a lot of books", "many students", "much water"],
      [
        ex("We have a lot of homework today.", "我们今天有很多作业。"),
        ex("Many children like robots.", "很多孩子喜欢机器人。"),
        ex("There isn't much sugar left.", "剩下的糖不多了。"),
      ]
    ),
    unit(
      84,
      "(a) little / (a) few",
      "few / a few 用于可数复数；little / a little 用于不可数。a few / a little 表示“有一些”。",
      ["a few books", "few chairs", "a little water", "little time"],
      [
        ex("I have a few questions.", "我有几个问题。"),
        ex("There is a little soup in the pot.", "锅里还有一点汤。"),
        ex("We have little time, so let's hurry.", "我们时间不多了，所以快点吧。"),
      ]
    ),
  ]),
  chapter("adjectives-adverbs", "形容词与副词", "8 个 unit · 形容词、副词、比较级、最高级、enough、too", [
    unit(
      85,
      "old / nice / interesting（形容词）",
      "形容词用来说明人或物是什么样，常放在 be 动词后或名词前。",
      ["a nice book", "The room is clean.", "an interesting lesson"],
      [
        ex("This puzzle is difficult.", "这个拼图很难。"),
        ex("We live in a quiet street.", "我们住在一条安静的街上。"),
        ex("Her new dress is beautiful.", "她的新裙子很漂亮。"),
      ]
    ),
    unit(
      86,
      "quickly / badly / suddenly（副词）",
      "副词常用来说明动作怎样发生，很多副词由形容词加 -ly 变来。",
      ["run quickly", "speak softly", "write carefully"],
      [
        ex("Please listen carefully.", "请认真听。"),
        ex("The rabbit moved quickly.", "兔子移动得很快。"),
        ex("He answered the question slowly.", "他慢慢地回答了问题。"),
      ]
    ),
    unit(
      87,
      "older / more expensive（比较级形式）",
      "短词常加 -er 构成比较级，长词常用 more + 形容词。",
      ["old -> older", "small -> smaller", "expensive -> more expensive"],
      [
        ex("My brother is older than me.", "我哥哥比我大。"),
        ex("This box is heavier than that one.", "这个箱子比那个重。"),
        ex("A train ticket is more expensive than a bus ticket.", "火车票比公交票贵。"),
      ]
    ),
    unit(
      88,
      "older than... / more expensive than...",
      "比较两个人或两样东西时，常用比较级 + than。",
      ["taller than", "faster than", "more useful than"],
      [
        ex("A giraffe is taller than a horse.", "长颈鹿比马高。"),
        ex("Math is easier for him than English.", "对他来说数学比英语容易。"),
        ex("This map is more useful than that photo.", "这张地图比那张照片更有用。"),
      ]
    ),
    unit(
      89,
      "not as...as",
      "not as ... as 表示“不如……那样……”。",
      ["not as tall as", "not as easy as", "not as fast as"],
      [
        ex("This road is not as wide as that one.", "这条路没有那条宽。"),
        ex("My bike is not as new as yours.", "我的自行车没有你的新。"),
        ex("Winter here is not as cold as in the north.", "这里的冬天没有北方那么冷。"),
      ]
    ),
    unit(
      90,
      "the oldest / the most expensive",
      "最高级用于三者或以上比较，表示“最……”。",
      ["the tallest", "the shortest", "the most careful"],
      [
        ex("Sam is the tallest boy in our class.", "山姆是我们班最高的男孩。"),
        ex("This is the most interesting story in the book.", "这是书里最有趣的故事。"),
        ex("Today is the hottest day this week.", "今天是这周最热的一天。"),
      ]
    ),
    unit(
      91,
      "enough",
      "enough 表示“足够”，可放在名词前，也可放在形容词或副词后面。",
      ["enough time", "big enough", "run fast enough"],
      [
        ex("We have enough chairs for everyone.", "我们的椅子够大家坐。"),
        ex("The room is warm enough now.", "现在房间够暖和了。"),
        ex("He didn't speak loudly enough.", "他说得不够大声。"),
      ]
    ),
    unit(
      92,
      "too",
      "too 表示“太……”，常带有“不好、不合适”的意思。",
      ["too heavy", "too late", "too quickly"],
      [
        ex("This bag is too heavy for me.", "这个包对我来说太重了。"),
        ex("You are walking too fast.", "你走得太快了。"),
        ex("It is too late to start a new game.", "现在开始新游戏太晚了。"),
      ]
    ),
  ]),
  chapter("word-order", "词序", "4 个 unit · 句子里单词的自然顺序", [
    unit(
      93,
      "He speaks English very well",
      "英语句子里常见顺序是：主语 + 动词 + 宾语 + 方式 + 地点 + 时间。",
      ["He speaks English well.", "She plays the piano beautifully."],
      [
        ex("My sister reads stories quietly in bed.", "我妹妹在床上安静地读故事。"),
        ex("We play football in the park every Sunday.", "我们每周日都在公园踢足球。"),
        ex("Dad drives to work early in the morning.", "爸爸清晨很早开车去上班。"),
      ]
    ),
    unit(
      94,
      "always / usually / often 等",
      "频率副词常放在 be 动词后，实义动词前。",
      ["I always get up early.", "She is usually busy."],
      [
        ex("We often eat noodles on Friday.", "我们星期五经常吃面。"),
        ex("Tom is never late for class.", "汤姆上课从不迟到。"),
        ex("My dog usually sleeps by the door.", "我的狗通常睡在门边。"),
      ]
    ),
    unit(
      95,
      "still / yet / already",
      "still 表示“仍然”，already 表示“已经”，yet 常用于疑问和否定。",
      ["I still live here.", "She has already left.", "Have you finished yet?"],
      [
        ex("It is still raining outside.", "外面还在下雨。"),
        ex("I have already packed my bag.", "我已经收拾好书包了。"),
        ex("They haven't arrived yet.", "他们还没到。"),
      ]
    ),
    unit(
      96,
      "Give me that book! / Give it to me!",
      "人称代词作宾语时，位置和完整名词短语有时不同，要特别注意 give / show / send 等结构。",
      ["Give me the book.", "Give it to me.", "Show her the photo."],
      [
        ex("Please pass me the glue.", "请把胶水递给我。"),
        ex("Can you send it to her tonight?", "你今晚能把它发给她吗？"),
        ex("Show us your picture after class.", "下课后给我们看看你的画。"),
      ]
    ),
  ]),
  chapter("clauses", "连词与从句", "6 个 unit · and、but、when、if、定语从句", [
    unit(
      97,
      "and / but / or / so / because",
      "这些连词把两个意思连接起来，表示并列、转折、选择、结果和原因。",
      ["and", "but", "or", "so", "because"],
      [
        ex("I was tired, so I went to bed early.", "我累了，所以早早睡了。"),
        ex("She wanted to go out, but it was raining.", "她想出去，但是正在下雨。"),
        ex("We stayed inside because the wind was strong.", "因为风很大，我们待在屋里。"),
      ]
    ),
    unit(
      98,
      "when...",
      "when 可以表示“当……时候”，引出时间从句。",
      ["When I got home, ...", "Call me when you arrive."],
      [
        ex("When the bell rings, the students stand up.", "铃响时，学生们站起来。"),
        ex("I was reading when my friend knocked on the door.", "朋友敲门时，我正在读书。"),
        ex("Please turn off the light when you leave.", "你离开时请关灯。"),
      ]
    ),
    unit(
      99,
      "if we go... / if you see...",
      "真实条件句表示“如果……就……”，if 从句常用一般现在时，主句可表示将来或建议。",
      ["If it rains, we will stay home.", "If you see him, tell him."],
      [
        ex("If you finish early, you can help me.", "如果你早做完，就可以帮我。"),
        ex("If it is sunny tomorrow, we will have a picnic.", "如果明天天晴，我们就去野餐。"),
        ex("If you need a pen, take mine.", "如果你需要笔，就拿我的。"),
      ]
    ),
    unit(
      100,
      "if I had... / if we went...",
      "与现在事实相反的假设，常用 if + 过去式，主句常用 would。",
      ["If I had more time, I would read more.", "If we went by bike, it would be fun."],
      [
        ex("If I were taller, I would join the team.", "如果我更高一些，我就会加入校队。"),
        ex("If we had a garden, we would grow tomatoes.", "如果我们有院子，我们就会种番茄。"),
        ex("If she knew the answer, she would tell us.", "如果她知道答案，她会告诉我们。"),
      ]
    ),
    unit(
      101,
      "a person who... / a thing that / which...",
      "定语从句可以用 who 指人，用 that / which 指物，来补充说明名词。",
      ["the boy who lives next door", "the toy that I bought"],
      [
        ex("This is the girl who won the race.", "这就是赢得比赛的那个女孩。"),
        ex("I found the book that you wanted.", "我找到了你想要的那本书。"),
        ex("The robot which can dance is mine.", "会跳舞的那个机器人是我的。"),
      ]
    ),
    unit(
      102,
      "the people we met / the hotel you stayed at",
      "有时定语从句里的关系词可以省略，特别是它作宾语的时候。",
      ["the cake we made", "the town she lives in"],
      [
        ex("The boy we saw in the park is my cousin.", "我们在公园看到的那个男孩是我表弟。"),
        ex("This is the song I told you about.", "这就是我跟你说过的那首歌。"),
        ex("The room they stayed in was very small.", "他们住的那个房间很小。"),
      ]
    ),
  ]),
  chapter("prepositions", "介词", "11 个 unit · 时间、地点、方向与固定搭配", [
    unit(
      103,
      "at 8 o'clock / on Monday / in April",
      "谈时间时，at 常用于具体时刻，on 常用于星期和具体日期，in 常用于月份、年份、季节。",
      ["at six o'clock", "on Tuesday", "in summer"],
      [
        ex("Our class starts at eight thirty.", "我们的课八点半开始。"),
        ex("I have piano on Wednesday.", "我星期三上钢琴课。"),
        ex("Flowers bloom in spring.", "花在春天开放。"),
      ]
    ),
    unit(
      104,
      "from...to / until / since / for",
      "这些介词常用来表达时间的起点、终点和持续时间。",
      ["from Monday to Friday", "until noon", "since 2022", "for two hours"],
      [
        ex("The store is open from nine to six.", "商店从九点营业到六点。"),
        ex("Please wait here until Dad comes.", "请在这里等到爸爸来。"),
        ex("She has lived here for five years.", "她在这里住了五年。"),
      ]
    ),
    unit(
      105,
      "before / after / during / while",
      "这些词都和时间有关，但 before / after 常接名词或从句，during 后常接名词，while 常接从句。",
      ["before class", "after dinner", "during the trip", "while I was reading"],
      [
        ex("Wash your hands before lunch.", "午饭前洗手。"),
        ex("We talked during the break.", "休息期间我们聊了天。"),
        ex("Don't shout while the baby is sleeping.", "宝宝睡觉时不要喊。"),
      ]
    ),
    unit(
      106,
      "in / at / on（地点 1）",
      "in 表示在里面，on 表示在表面上，at 表示在某一点或某个活动地点。",
      ["in the box", "on the table", "at the bus stop"],
      [
        ex("Your socks are in the drawer.", "你的袜子在抽屉里。"),
        ex("There is a cup on the desk.", "桌子上有一个杯子。"),
        ex("I will meet you at the gate.", "我会在门口见你。"),
      ]
    ),
    unit(
      107,
      "in / at / on（地点 2）",
      "这些介词还会和 town、school、station、farm 等地点名词形成固定搭配。",
      ["in a town", "at school", "on a farm"],
      [
        ex("My uncle works on a farm.", "我叔叔在农场工作。"),
        ex("The children are at school now.", "孩子们现在在学校。"),
        ex("They live in a small town.", "他们住在一个小镇。"),
      ]
    ),
    unit(
      108,
      "to / in / at（地点 3）",
      "to 表示方向“去某地”，in / at 表示“在某地”。",
      ["go to the park", "be in the park", "arrive at the station"],
      [
        ex("We are going to the museum this afternoon.", "今天下午我们要去博物馆。"),
        ex("She is still in the library.", "她还在图书馆里。"),
        ex("The train arrived at the station on time.", "火车准时到站。"),
      ]
    ),
    unit(
      109,
      "under / behind / opposite 等",
      "这些介词用来说明位置关系。",
      ["under the chair", "behind the tree", "opposite the bank"],
      [
        ex("The cat is under the bed.", "猫在床底下。"),
        ex("There is a playground behind our building.", "我们楼后面有个操场。"),
        ex("The bakery is opposite the post office.", "面包店在邮局对面。"),
      ]
    ),
    unit(
      110,
      "up / over / through 等",
      "这些介词和副词常描述移动方向和路线。",
      ["walk up the hill", "jump over the box", "go through the tunnel"],
      [
        ex("The boy ran up the stairs.", "男孩跑上了楼梯。"),
        ex("The dog jumped over the log.", "狗跳过了木头。"),
        ex("We walked through the forest slowly.", "我们慢慢穿过了森林。"),
      ]
    ),
    unit(
      111,
      "on / at / by / with / about",
      "这些介词搭配很多，要结合具体短语来记忆。",
      ["on television", "at home", "by bus", "with friends", "talk about"],
      [
        ex("I go to school by bus in winter.", "冬天我坐公交去上学。"),
        ex("She wrote the note with a blue pen.", "她用蓝色钢笔写了便条。"),
        ex("We talked about our trip after dinner.", "我们晚饭后聊了旅行。"),
      ]
    ),
    unit(
      112,
      "afraid of / good at... + -ing",
      "很多形容词和介词搭配后，后面要接名词或动词 -ing 形式。",
      ["good at drawing", "afraid of flying", "interested in reading"],
      [
        ex("My sister is good at painting animals.", "我妹妹擅长画动物。"),
        ex("He is afraid of speaking in front of many people.", "他害怕在很多人面前讲话。"),
        ex("We are interested in making models.", "我们对做模型很感兴趣。"),
      ]
    ),
    unit(
      113,
      "listen to / look at...（动词 + 介词）",
      "有些动词必须和固定介词搭配，意思才完整。",
      ["listen to music", "look at the board", "wait for the bus"],
      [
        ex("Please listen to the teacher.", "请听老师讲。"),
        ex("Don't look at your phone in class.", "上课不要看手机。"),
        ex("We waited for the bus in the rain.", "我们在雨里等公交车。"),
      ]
    ),
  ]),
  chapter("phrasal-verbs", "短语动词", "2 个 unit · 动词和小词连用", [
    unit(
      114,
      "go in / fall off / run away 等",
      "短语动词由动词加小词组成，整体意思常和单独的动词不一样。",
      ["go in", "sit down", "run away", "fall off"],
      [
        ex("Please come in and sit down.", "请进来坐下。"),
        ex("The little bird fell off the branch.", "小鸟从树枝上掉下来了。"),
        ex("The dog ran away when the gate opened.", "门一开，狗就跑掉了。"),
      ]
    ),
    unit(
      115,
      "put on your shoes / put your shoes on",
      "有些短语动词可以把宾语放中间或后面；如果宾语是代词，通常要放在中间。",
      ["put on your coat", "put it on", "turn off the light"],
      [
        ex("Please put on your hat before you go out.", "出门前请戴上帽子。"),
        ex("It is noisy here. Turn it down.", "这里太吵了。把它调小一点。"),
        ex("She took off her shoes at the door.", "她在门口脱下了鞋。"),
      ]
    ),
  ]),
];

export const countGrammarUnits = (chapter?: GrammarChapter): number =>
  chapter
    ? chapter.units.length
    : ENGLISH_GRAMMAR_CHAPTERS.reduce(
        (sum, currentChapter) => sum + currentChapter.units.length,
        0
      );

export const countGrammarExamples = (chapter?: GrammarChapter): number =>
  chapter
    ? chapter.units.reduce((sum, currentUnit) => sum + currentUnit.examples.length, 0)
    : ENGLISH_GRAMMAR_CHAPTERS.reduce(
        (sum, currentChapter) => sum + countGrammarExamples(currentChapter),
        0
      );
