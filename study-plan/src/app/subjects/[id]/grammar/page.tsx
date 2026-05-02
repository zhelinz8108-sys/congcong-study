"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import {
  ENGLISH_GRAMMAR_CHAPTERS,
  type GrammarExample,
  type GrammarUnit,
  countGrammarUnits,
} from "@/lib/english-grammar";

type GrammarFormCard = {
  label: string;
  value: string;
  hint: string;
};

type GrammarPracticeCard = {
  label: string;
  task: string;
  sample: string;
  hint: string;
};

function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();

  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

function ex(english: string, chinese: string): GrammarExample {
  return { english, chinese };
}

function dedupeExamples(examples: GrammarExample[]): GrammarExample[] {
  const seen = new Set<string>();

  return examples.filter((example) => {
    const key = example.english.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildFormCards(unit: GrammarUnit): GrammarFormCard[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();
  const formCards: GrammarFormCard[] = unit.patterns.slice(0, 3).map((pattern, index) => ({
    label: index === 0 ? "基础式" : index === 1 ? "扩展式" : "应用式",
    value: pattern,
    hint: "先按这个句型说一遍，再把主语、地点或时间换成自己的内容。",
  }));

  if (/疑问|question|\?/.test(normalized)) {
    formCards.push({
      label: "回答式",
      value: "Yes, ... / No, ...",
      hint: "先用 Yes 或 No，再补完整回答。",
    });
  } else if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|mustn't|can't/.test(normalized)) {
    formCards.push({
      label: "否定式",
      value: "主语 + not / don't / doesn't + ...",
      hint: "先确定主语，再选对否定形式。",
    });
  } else if (/比较|than|older|more|less|as\.\.\.as/.test(normalized)) {
    formCards.push({
      label: "比较式",
      value: "A + be / 动词 + 比较结构 + than + B",
      hint: "比较两样东西时，要把两边都说完整。",
    });
  } else if (/there /.test(normalized)) {
    formCards.push({
      label: "地点式",
      value: "There is / are ... + 地点",
      hint: "先说“有”，再补地点。",
    });
  } else if (/a\/an|some|any|every|both|either|neither|none|much|many|few|little/.test(normalized)) {
    formCards.push({
      label: "数量式",
      value: "限定词 + 名词 / 代词",
      hint: "先想名词能不能数，再选对应形式。",
    });
  } else if (/介词|at |in |on |from|until|since|with|about|behind|under|through/.test(normalized)) {
    formCards.push({
      label: "搭配式",
      value: "动词 / 时间 / 地点 + 介词短语",
      hint: "介词常和固定时间、地点、动作搭配出现。",
    });
  } else if (/phrasal|短语动词|put on|run away|go in|fall off/.test(normalized)) {
    formCards.push({
      label: "连用式",
      value: "动词 + 小词 + 宾语",
      hint: "先看宾语是名词还是代词，再决定放在中间还是后面。",
    });
  } else {
    formCards.push({
      label: "替换式",
      value: "换主语 / 时间 / 地点再造句",
      hint: "保持语法结构不变，只换内容。",
    });
  }

  formCards.push({
    label: "口头练习",
    value: "照读一句，再换一个信息说第二句",
    hint: "优先替换人物、地点、时间或数量，让句型真正用起来。",
  });

  return formCards.slice(0, 5);
}

function buildExtraExamples(unit: GrammarUnit): GrammarExample[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (normalized.includes("am / is / are（疑问句）")) {
    return [
      ex("Is your teacher in the office now?", "你们老师现在在办公室吗？"),
      ex("Are your books on the desk?", "你的书在桌子上吗？"),
    ];
  }

  if (normalized.includes("am / is / are")) {
    return [
      ex("My little cousin is very funny.", "我的小表弟很有趣。"),
      ex("We are in the computer room this afternoon.", "今天下午我们在电脑教室。"),
    ];
  }

  if (normalized.includes("现在进行时") && normalized.includes("疑问")) {
    return [
      ex("Is the baby sleeping now?", "宝宝现在在睡觉吗？"),
      ex("What are your classmates writing?", "你的同学们正在写什么？"),
    ];
  }

  if (normalized.includes("现在进行时") && normalized.includes("比较")) {
    return [
      ex("I am wearing my sports shoes today, but I usually wear black shoes.", "我今天穿的是运动鞋，但我平时穿黑鞋。"),
      ex("They are eating outside now, but they usually eat in the dining room.", "他们现在在外面吃，但平时在餐厅吃。"),
    ];
  }

  if (normalized.includes("现在进行时")) {
    return [
      ex("My brother is washing his bike in the yard.", "我哥哥正在院子里洗自行车。"),
      ex("The ducks are swimming across the pond.", "鸭子们正在游过池塘。"),
    ];
  }

  if (normalized.includes("一般现在时") && normalized.includes("疑问")) {
    return [
      ex("Do your parents read with you at night?", "你父母晚上会陪你一起读书吗？"),
      ex("Does this bus stop near the museum?", "这辆公交车会在博物馆附近停吗？"),
    ];
  }

  if (normalized.includes("一般现在时") && normalized.includes("否定")) {
    return [
      ex("My father doesn't drink coffee at night.", "我爸爸晚上不喝咖啡。"),
      ex("We don't stay out late on school days.", "上学日我们不在外面待到很晚。"),
    ];
  }

  if (normalized.includes("一般现在时")) {
    return [
      ex("My uncle drives to work every weekday.", "我叔叔每个工作日都开车上班。"),
      ex("The sun rises in the east.", "太阳从东方升起。"),
    ];
  }

  if (normalized.includes("i have.../i've got")) {
    return [
      ex("I have got a warm coat for winter.", "我有一件过冬的厚外套。"),
      ex("She has a pet turtle in a small tank.", "她有一只养在小缸里的宠物乌龟。"),
    ];
  }

  if (normalized.includes("was / were") || normalized.includes("was/were")) {
    return [
      ex("The streets were quiet early in the morning.", "清晨街道很安静。"),
      ex("I was nervous before the speech.", "演讲前我有点紧张。"),
    ];
  }

  if (normalized.includes("didn't") || normalized.includes("did you")) {
    return [
      ex("We didn't hear the bell because it was noisy.", "因为太吵，我们没听见铃声。"),
      ex("Did your team win the match yesterday?", "你们队昨天赢了比赛吗？"),
    ];
  }

  if (normalized.includes("过去进行时") && normalized.includes("比较")) {
    return [
      ex("I was taking notes when the teacher asked a question.", "老师提问时，我正在记笔记。"),
      ex("They were cleaning the room when the guests arrived.", "客人到时，他们正在打扫房间。"),
    ];
  }

  if (normalized.includes("过去进行时")) {
    return [
      ex("She was making a card at seven o'clock.", "七点时她正在做卡片。"),
      ex("We were waiting under the tree for the bus.", "我们当时正在树下等公交车。"),
    ];
  }

  if (normalized.includes("一般过去时")) {
    return [
      ex("The class visited the farm last month.", "全班上个月参观了农场。"),
      ex("I found an old photo in the drawer.", "我在抽屉里发现了一张旧照片。"),
    ];
  }

  if (normalized.includes("present perfect") || normalized.includes("现在完成时") || normalized.includes("have done")) {
    if (normalized.includes("ever")) {
      return [
        ex("Have you ever ridden in a hot-air balloon?", "你坐过热气球吗？"),
        ex("She has never spoken to a TV reporter.", "她从没跟电视记者说过话。"),
      ];
    }

    if (normalized.includes("for / since / ago") || normalized.includes("for since ago")) {
      return [
        ex("We have waited here for half an hour.", "我们已经在这里等了半个小时。"),
        ex("He joined the club two years ago.", "他两年前加入了这个俱乐部。"),
      ];
    }

    return [
      ex("I have already packed my schoolbag for tomorrow.", "我已经把明天的书包收拾好了。"),
      ex("She hasn't called her grandma yet.", "她还没有给奶奶打电话。"),
    ];
  }

  if (normalized.includes("被动语态")) {
    return [
      ex("The library door is opened at eight every day.", "图书馆的门每天八点打开。"),
      ex("The sports field has been cleaned for the event.", "为了活动，操场已经被清扫过了。"),
    ];
  }

  if (normalized.includes("规则动词") || normalized.includes("不规则动词")) {
    return [
      ex("We studied for the test and then went to bed early.", "我们复习了考试，然后早早睡了。"),
      ex("She took the book and wrote her name on it.", "她拿起书并在上面写下名字。"),
    ];
  }

  if (normalized.includes("going to")) {
    return [
      ex("They are going to build a kite after lunch.", "他们午饭后要做风筝。"),
      ex("I am going to call my cousin this evening.", "我今晚要给表哥打电话。"),
    ];
  }

  if (normalized.includes("what are you doing tomorrow")) {
    return [
      ex("We are having a music lesson tomorrow morning.", "我们明天上午要上音乐课。"),
      ex("My aunt is visiting us this weekend.", "我阿姨这个周末要来看我们。"),
    ];
  }

  if (normalized.includes("will") || normalized.includes("shall")) {
    return [
      ex("I think our class will enjoy the science show.", "我觉得我们班会喜欢这场科学表演。"),
      ex("Shall we finish the poster before dinner?", "我们晚饭前把海报做完好吗？"),
    ];
  }

  if (normalized.includes("might")) {
    return [
      ex("The train might be late because of the rain.", "因为下雨，火车可能会晚点。"),
      ex("We might see stars if the sky gets clear.", "如果天空放晴，我们也许能看到星星。"),
    ];
  }

  if (normalized.includes("can") || normalized.includes("could")) {
    return [
      ex("Can your sister skate on the ice now?", "你姐姐现在会在冰上滑冰吗？"),
      ex("Could you hold this box for a minute?", "你能帮我拿一下这个箱子吗？"),
    ];
  }

  if (normalized.includes("must") || normalized.includes("need to")) {
    return [
      ex("You must keep your hands clean before lunch.", "午饭前你必须把手洗干净。"),
      ex("We don't need to leave so early today.", "我们今天不用那么早出发。"),
    ];
  }

  if (normalized.includes("should")) {
    return [
      ex("You should check your answer again.", "你应该再检查一遍答案。"),
      ex("Children should be kind to animals.", "孩子们应该善待动物。"),
    ];
  }

  if (normalized.includes("have to")) {
    return [
      ex("I have to wear my school uniform on Monday.", "星期一我必须穿校服。"),
      ex("She has to finish the poster before lunch.", "她必须在午饭前完成海报。"),
    ];
  }

  if (normalized.includes("would you like") || normalized.includes("i'd like")) {
    return [
      ex("Would you like to join our reading club?", "你想加入我们的阅读俱乐部吗？"),
      ex("I'd like a bowl of rice and some vegetables.", "我想要一碗米饭和一些蔬菜。"),
    ];
  }

  if (normalized.includes("let's") || normalized.includes("don't do")) {
    return [
      ex("Please keep the door closed when the heater is on.", "开暖气时请把门关上。"),
      ex("Let's finish the hard part first.", "我们先把难的部分做完吧。"),
    ];
  }

  if (normalized.includes("used to")) {
    return [
      ex("We used to play under that tree after school.", "我们以前放学后常在那棵树下玩。"),
      ex("My grandmother used to work in a bookstore.", "我奶奶以前在书店工作。"),
    ];
  }

  if (normalized.includes("there is") || normalized.includes("there are")) {
    return [
      ex("There is a long line outside the bakery.", "面包店外面排着长队。"),
      ex("There are three lamps in our living room.", "我们客厅里有三盏灯。"),
    ];
  }

  if (normalized.includes("there was") || normalized.includes("there will be") || normalized.includes("there has")) {
    return [
      ex("There will be a parent meeting next Friday.", "下周五会有家长会。"),
      ex("There has been heavy traffic near the bridge.", "桥附近一直很堵。"),
    ];
  }

  if (normalized.startsWith("it") || normalized.includes("it...")) {
    return [
      ex("It is a long way to the station from here.", "从这里到车站有很长一段路。"),
      ex("It is fun to build things with your hands.", "自己动手做东西很有趣。"),
    ];
  }

  if (normalized.includes("too/either") || normalized.includes("so am i") || normalized.includes("neither")) {
    return [
      ex("I like drawing, and my cousin does too.", "我喜欢画画，我表哥也喜欢。"),
      ex("She can't skate, and I can't either.", "她不会滑冰，我也不会。"),
    ];
  }

  if (normalized.includes("who") || normalized.includes("what") || normalized.includes("which") || normalized.includes("how")) {
    return [
      ex("Who is carrying that big box?", "谁在搬那个大箱子？"),
      ex("How did your team get to the stadium?", "你们队怎么到体育场的？"),
    ];
  }

  if (normalized.includes("said that") || normalized.includes("told me that")) {
    return [
      ex("My brother said that he would help me later.", "我哥哥说他晚一点会帮我。"),
      ex("Our coach told us that practice would start early.", "教练告诉我们训练会提前开始。"),
    ];
  }

  if (normalized.includes("to do") || normalized.includes("doing") || normalized.includes("want you to")) {
    return [
      ex("I want to learn how to make dumplings.", "我想学怎么包饺子。"),
      ex("My teacher wants us to speak more clearly.", "老师想让我们说得更清楚。"),
    ];
  }

  if (normalized.includes("go to") || normalized.includes("go on") || normalized.includes("go for") || normalized.includes("go-ing")) {
    return [
      ex("We go for a bike ride on cool evenings.", "天气凉快的傍晚我们会骑车兜风。"),
      ex("My brother goes fishing with Grandpa in summer.", "我哥哥夏天和爷爷去钓鱼。"),
    ];
  }

  if (normalized.includes("get")) {
    return [
      ex("I get nervous before a big game.", "大比赛前我会紧张。"),
      ex("We usually get to the station by seven.", "我们通常七点前到车站。"),
    ];
  }

  if (normalized.includes("do 与 make") || normalized.includes("do and make") || normalized.includes("make")) {
    return [
      ex("I make my bed before I go downstairs.", "我下楼前会整理床铺。"),
      ex("We do the cleaning together every Saturday.", "我们每周六一起大扫除。"),
    ];
  }

  if (normalized.includes("have")) {
    return [
      ex("We have a short class meeting every Monday.", "我们每周一都有一个简短班会。"),
      ex("She had a cold drink after the race.", "比赛后她喝了一杯冷饮。"),
    ];
  }

  if (normalized.includes("my / his / their") || normalized.includes("mine") || normalized.includes("myself") || normalized.includes("kate’s")) {
    return [
      ex("Their new house has a yellow door.", "他们的新房子有一扇黄色的门。"),
      ex("I fixed the model plane myself.", "模型飞机是我自己修好的。"),
    ];
  }

  if (normalized.includes("a / an") || normalized.includes("a/an")) {
    return [
      ex("She saw an eagle high in the sky.", "她看见一只鹰高高飞在天上。"),
      ex("I bought a useful map for the trip.", "我为这次旅行买了一张有用的地图。"),
    ];
  }

  if (normalized.includes("single") || normalized.includes("plural") || normalized.includes("单数") || normalized.includes("复数")) {
    return [
      ex("One child was waiting, but two parents arrived.", "原来只有一个孩子在等，后来来了两位家长。"),
      ex("These buses stop near the sports center.", "这些公交车在体育中心附近停。"),
    ];
  }

  if (normalized.includes("可数") || normalized.includes("不可数")) {
    return [
      ex("We need some paper and two boxes.", "我们需要一些纸和两个盒子。"),
      ex("There isn't much cheese in the fridge.", "冰箱里没有多少奶酪了。"),
    ];
  }

  if (normalized.includes("the") || normalized.includes("冠词") || normalized.includes("music") || normalized.includes("地名")) {
    return [
      ex("The playground is behind the new building.", "操场在新楼后面。"),
      ex("We often listen to music in the art room.", "我们常在美术教室听音乐。"),
    ];
  }

  if (normalized.includes("this/that") || normalized.includes("one/ones") || normalized.includes("some 与 any") || normalized.includes("both") || normalized.includes("much") || normalized.includes("few")) {
    return [
      ex("These gloves are mine, but those ones are my sister's.", "这些手套是我的，那些是我妹妹的。"),
      ex("We still have a few oranges and a little juice.", "我们还剩几个橙子和一点果汁。"),
    ];
  }

  if (normalized.includes("形容词") || normalized.includes("副词") || normalized.includes("比较级") || normalized.includes("最高级") || normalized.includes("enough") || normalized.includes("too")) {
    return [
      ex("This backpack is light enough for my little brother.", "这个背包对我弟弟来说够轻。"),
      ex("The red train is much faster than the old one.", "红色那列火车比旧的快得多。"),
    ];
  }

  if (normalized.includes("词序") || normalized.includes("always") || normalized.includes("still") || normalized.includes("give me")) {
    return [
      ex("She usually finishes her reading before eight.", "她通常八点前读完书。"),
      ex("Please send the photo to me after dinner.", "请在晚饭后把照片发给我。"),
    ];
  }

  if (normalized.includes("because") || normalized.includes("when") || normalized.includes("if") || normalized.includes("定语从句")) {
    return [
      ex("If you save your work now, you won't lose it.", "如果你现在保存文件，就不会丢。"),
      ex("The girl who sits by the window is our monitor.", "坐在窗边的那个女孩是我们的班长。"),
    ];
  }

  if (normalized.includes("at 8 o'clock") || normalized.includes("on monday") || normalized.includes("in april") || normalized.includes("before") || normalized.includes("after") || normalized.includes("during") || normalized.includes("while")) {
    return [
      ex("We usually leave home at a quarter past seven.", "我们通常七点一刻离开家。"),
      ex("During the holiday, I read two chapter books.", "假期里我读了两本章节书。"),
    ];
  }

  if (normalized.includes("behind") || normalized.includes("under") || normalized.includes("opposite") || normalized.includes("through") || normalized.includes("by") || normalized.includes("with") || normalized.includes("look at") || normalized.includes("listen to")) {
    return [
      ex("The small shop is opposite the library gate.", "那家小店在图书馆门口对面。"),
      ex("We walked through the tunnel with our flashlights on.", "我们打着手电穿过了隧道。"),
    ];
  }

  if (normalized.includes("短语动词") || normalized.includes("put on") || normalized.includes("run away")) {
    return [
      ex("Please turn off the fan before you leave.", "你离开前请把风扇关掉。"),
      ex("He picked up the coin and put it in his pocket.", "他捡起硬币，把它放进口袋。"),
    ];
  }

  return [
    ex("Try this pattern with your own school life example.", "试着把这个句型换成你自己的校园场景。"),
    ex("Say the same idea again with a different person or place.", "把同一个意思换一个人物或地点再说一次。"),
  ];
}

function buildScenarioExamples(unit: GrammarUnit): GrammarExample[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (/疑问|question|\?/.test(normalized)) {
    return [
      ex("Is the school gate still open now?", "学校大门现在还开着吗？"),
      ex("Do your friends play table tennis after class?", "你的朋友们下课后打乒乓球吗？"),
    ];
  }

  if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|can't|mustn't/.test(normalized)) {
    return [
      ex("My little brother can't tie his shoes by himself yet.", "我弟弟还不会自己系鞋带。"),
      ex("We didn't carry umbrellas, so we got wet.", "我们没带伞，所以淋湿了。"),
    ];
  }

  if (normalized.includes("一般现在时")) {
    return [
      ex("Our music teacher starts class with a short song.", "我们的音乐老师上课总会先唱一首短歌。"),
      ex("My best friend finishes her homework before dinner.", "我最好的朋友总在晚饭前写完作业。"),
    ];
  }

  if (normalized.includes("现在进行时")) {
    return [
      ex("Two boys are carrying sports mats into the hall.", "两个男孩正把体操垫搬进礼堂。"),
      ex("My mother is cutting fruit in the kitchen now.", "我妈妈现在正在厨房切水果。"),
    ];
  }

  if (normalized.includes("一般过去时") || normalized.includes("过去进行时")) {
    return [
      ex("I dropped my pencil case on the stairs this morning.", "今天早上我在楼梯上掉了铅笔盒。"),
      ex("We were talking softly when the lights went out.", "灯灭的时候，我们正在小声说话。"),
    ];
  }

  if (normalized.includes("现在完成时") || normalized.includes("have done")) {
    return [
      ex("I have finished my reading record for this week.", "我已经完成这周的阅读记录了。"),
      ex("She has just put the clean cups back on the shelf.", "她刚把洗好的杯子放回架子上。"),
    ];
  }

  if (/will|shall|going to|might/.test(normalized)) {
    return [
      ex("We will plant small trees on Friday afternoon.", "我们周五下午会种小树。"),
      ex("My cousin is going to join the basketball tryout.", "我表哥打算参加篮球选拔。"),
    ];
  }

  if (/can|could|should|must|have to|need to/.test(normalized)) {
    return [
      ex("You should bring a notebook for the science show.", "你应该给科学展示带一本笔记本。"),
      ex("We have to stay inside because the wind is too strong.", "因为风太大，我们必须待在室内。"),
    ];
  }

  if (/there is|there are|there was|there will be/.test(normalized)) {
    return [
      ex("There are several quiet corners in our new library.", "我们新图书馆里有几个安静的角落。"),
      ex("There will be a short art talk after lunch.", "午饭后会有一个简短的美术分享。"),
    ];
  }

  if (/形容词|副词|比较级|最高级|enough|too/.test(normalized)) {
    return [
      ex("This question is harder than the last one, but it is still fair.", "这道题比上一道难，但还是合理的。"),
      ex("The blue bottle is the lightest one in the box.", "蓝色水瓶是箱子里最轻的那个。"),
    ];
  }

  if (/because|when|if|who|which|that|定语从句/.test(normalized)) {
    return [
      ex("When the rain stops, we can finish the game outside.", "雨停了以后，我们就能到外面把比赛踢完。"),
      ex("The boy who helped me yesterday is in Grade Five.", "昨天帮我的那个男孩上五年级。"),
    ];
  }

  if (/介词|behind|under|through|by|with|look at|listen to/.test(normalized)) {
    return [
      ex("The art box is under the long table near the window.", "美术盒在窗边那张长桌子下面。"),
      ex("We walked by the lake with our teacher after lunch.", "午饭后我们和老师沿着湖边走。"),
    ];
  }

  return [
    ex("Try one more sentence about your family, class, or weekend plan.", "再用你的家人、班级或周末计划说一句。"),
    ex("Keep the grammar the same and change only one key word.", "保持语法不变，只替换一个关键信息。"),
  ];
}

function buildChallengeExamples(unit: GrammarUnit): GrammarExample[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();

  if (normalized.includes("am / is / are（疑问句）")) {
    return [
      ex("Is your father in his room, or is he still talking on the phone downstairs?", "你爸爸是在房间里，还是还在楼下打电话？"),
      ex("Are these shoes dry enough to wear after the heavy rain this morning?", "今天早上下过大雨后，这双鞋已经干到可以穿了吗？"),
      ex("Why is your little brother so quiet when the other children are still playing?", "别的孩子还在玩，你弟弟为什么这么安静？"),
    ];
  }

  if (normalized.includes("am / is / are")) {
    return [
      ex("My little sister is usually quiet, but she is very excited today because her team won.", "我妹妹平时很安静，但今天她非常兴奋，因为她的队赢了。"),
      ex("The walls in our classroom are clean now, although they were very dirty last week.", "我们教室的墙现在很干净，虽然上周还很脏。"),
      ex("I am ready for the talk, but my partner is still checking the last card.", "我已经准备好做分享了，但我的搭档还在检查最后一张卡片。"),
    ];
  }

  if (normalized.includes("i have.../i've got")) {
    return [
      ex("I have got two things to finish before dinner, so I can't go out yet.", "晚饭前我还有两件事要完成，所以现在还不能出去。"),
      ex("She has got a good ear for music, which is why she learns songs so quickly.", "她的乐感很好，所以学歌特别快。"),
      ex("We have got enough chairs for the parents, but we still need more cups.", "我们给家长准备的椅子够了，但杯子还需要更多。"),
    ];
  }

  if (normalized.includes("was / were") || normalized.includes("was/were")) {
    return [
      ex("The room was so hot that we opened every window before class began.", "房间太热了，所以我们在上课前把所有窗户都打开了。"),
      ex("My grandparents were tired after the long trip, but they still smiled all evening.", "我爷爷奶奶长途旅行后很累，但整个晚上还是一直在笑。"),
      ex("I was only seven when I first stayed at school for a full day.", "我第一次在学校待满一整天时，才七岁。"),
    ];
  }

  if (/疑问|question|\?/.test(normalized)) {
    return [
      ex("When you get home after school, do you start your homework at once?", "你放学回家后，会马上开始写作业吗？"),
      ex("Is your little brother still awake, or has he gone to bed already?", "你弟弟现在还醒着，还是已经上床睡觉了？"),
      ex("Why are the two boys standing near the gate when class has already started?", "既然已经上课了，那两个男孩为什么还站在门口？"),
    ];
  }

  if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|can't|mustn't/.test(normalized)) {
    return [
      ex("She doesn't join the game when she feels tired after a long class.", "上一节长课以后，如果她觉得累，就不会参加游戏。"),
      ex("We aren't ready to leave because Dad hasn't come back with the car yet.", "爸爸还没把车开回来，所以我们还不能出发。"),
      ex("I can't finish the last part tonight unless you help me check it first.", "除非你先帮我检查一下，不然我今晚完成不了最后一部分。"),
    ];
  }

  if (normalized.includes("一般现在时")) {
    return [
      ex("My sister usually reads for half an hour before she goes to sleep.", "我姐姐通常在睡前读半小时书。"),
      ex("The school bus leaves at seven, so we never eat breakfast too slowly.", "校车七点开，所以我们吃早饭从不太慢。"),
      ex("Our teacher often gives us a short quiz after we review the new words.", "老师常常在我们复习完新单词后，给我们一个小测验。"),
    ];
  }

  if (normalized.includes("现在进行时")) {
    return [
      ex("The children are waiting in the hall because the rain is too heavy outside.", "因为外面雨太大，孩子们正在礼堂里等。"),
      ex("Two girls are cleaning the board while the rest of the class is packing up.", "当班里其他同学在收拾东西时，两个女孩正在擦黑板。"),
      ex("My mother is cutting fruit in the kitchen while I am setting the table.", "我妈妈正在厨房切水果，而我正在摆桌子。"),
    ];
  }

  if (normalized.includes("一般过去时") || normalized.includes("过去进行时") || normalized.includes("used to")) {
    return [
      ex("I dropped my cup when I ran across the kitchen for the phone.", "我为了去接电话跑过厨房时，把杯子掉了。"),
      ex("We were walking home when the sky suddenly turned dark.", "我们正在走回家时，天空突然变暗了。"),
      ex("My brother forgot his bag, so I took it to his classroom after lunch.", "我哥哥忘了带书包，所以我午饭后把书包送到他的教室。"),
    ];
  }

  if (normalized.includes("现在完成时") || normalized.includes("have done")) {
    return [
      ex("I have finished the hard part, but I still need to check the last page.", "我已经完成了最难的部分，但最后一页还需要检查。"),
      ex("She has never seen the sea, although she has read many books about it.", "虽然她读过很多关于大海的书，但她从没见过海。"),
      ex("We have lived in this area since my sister started primary school.", "从我姐姐上小学开始，我们就一直住在这个区。"),
    ];
  }

  if (/will|shall|going to|might/.test(normalized)) {
    return [
      ex("If the weather stays fine, we will practice outside after the second class.", "如果天气一直好，我们会在第二节课后到外面练习。"),
      ex("My uncle is going to fix the old bike when he has time this weekend.", "我叔叔这个周末有空时，打算把那辆旧自行车修好。"),
      ex("The train might be late, so we should leave home a little earlier.", "火车可能会晚点，所以我们应该稍微早一点出门。"),
    ];
  }

  if (/can|could|should|must|have to|need to/.test(normalized)) {
    return [
      ex("You should wash the fruit before you cut it for the class picnic.", "你给班级野餐切水果前，应该先把水果洗干净。"),
      ex("We must stay quiet while the younger children are having a test.", "低年级孩子考试的时候，我们必须保持安静。"),
      ex("I can carry the light box, but I can't lift the one by the door.", "我能搬那个轻箱子，但搬不动门边那个。"),
    ];
  }

  if (/there is|there are|there was|there will be/.test(normalized)) {
    return [
      ex("There is a long list of books that we still need for the new term.", "新学期我们还需要一长串书单上的书。"),
      ex("There are only two chairs left, so we may have to stand for a while.", "只剩两把椅子了，所以我们可能得站一会儿。"),
      ex("There will be a short meeting in the library after the last lesson.", "最后一节课后，图书馆里会有一个简短会议。"),
    ];
  }

  if (normalized.includes("被动语态")) {
    return [
      ex("The class photo was taken after the rain stopped, so everyone looked relaxed again.", "雨停后才拍了班级合影，所以大家看起来又放松了。"),
      ex("The room has been cleaned well enough for the parents to come in now.", "房间已经打扫得够干净了，家长现在可以进来了。"),
      ex("A short note will be sent home if any student leaves early today.", "如果今天有学生提前离开，学校会发一张简短通知回家。"),
    ];
  }

  if (/形容词|副词|比较级|最高级|enough|too/.test(normalized)) {
    return [
      ex("This road is much safer than the one behind the market when it gets dark.", "天一黑，这条路比市场后面的那条安全得多。"),
      ex("The second plan is more useful because it saves both time and paper.", "第二个方案更有用，因为它既省时间又省纸。"),
      ex("Of the three boys, Ben was the most careful when he checked the answers.", "三个男孩里，Ben 检查答案时最仔细。"),
    ];
  }

  if (/because|when|if|who|which|that|定语从句/.test(normalized)) {
    return [
      ex("If you speak too fast, the younger children may not understand your idea.", "如果你说得太快，低年级孩子可能听不懂你的意思。"),
      ex("The girl who won the first prize also helped me with the poster.", "拿了一等奖的那个女孩也帮我做了海报。"),
      ex("We stayed indoors because the wind was so strong that the windows shook.", "因为风太大，连窗户都在晃，我们只好待在屋里。"),
    ];
  }

  if (normalized.includes("said that") || normalized.includes("told me that")) {
    return [
      ex("My mother said that I should rest first because my face looked very tired.", "我妈妈说我应该先休息，因为我的脸看起来很累。"),
      ex("Our teacher told us that the meeting would start early if the parents arrived on time.", "老师告诉我们，如果家长准时到，会议就会提前开始。"),
      ex("He said that he could help later, but only after he finished his own work.", "他说他晚点可以帮忙，但得先做完自己的事。"),
    ];
  }

  if (normalized.includes("to do") || normalized.includes("doing") || normalized.includes("want you to")) {
    return [
      ex("I enjoy reading by the window when the house is quiet in the afternoon.", "下午家里很安静时，我喜欢坐在窗边看书。"),
      ex("My teacher wants us to explain our answers instead of only giving the result.", "老师希望我们解释答案，而不是只报结果。"),
      ex("It is hard to stay calm when everyone around you is speaking at once.", "当周围所有人同时说话时，很难保持冷静。"),
    ];
  }

  if (/介词|behind|under|through|by|with|look at|listen to/.test(normalized)) {
    return [
      ex("Please put the clean cups on the top shelf above the small sink.", "请把干净的杯子放到小水池上方最上层的架子上。"),
      ex("A tall man with a blue bag was waiting outside the shop near our school.", "一个背蓝色包的高个子男人正在我们学校附近那家店外等。"),
      ex("After lunch we walked through the park and across the bridge to the museum.", "午饭后我们穿过公园，又过了桥，走到了博物馆。"),
    ];
  }

  if (normalized.includes("a / an") || normalized.includes("a/an")) {
    return [
      ex("A young doctor gave us a talk about sleep, and an older teacher wrote the key points down.", "一位年轻医生给我们做了睡眠讲座，一位年长老师把重点记了下来。"),
      ex("I saw a small dog under the chair and an orange bag beside the door.", "我看见椅子下有一只小狗，门边还有一个橙色的包。"),
      ex("She bought a useful map and an extra pen before the class trip began.", "班级出行开始前，她买了一张有用的地图和一支备用笔。"),
    ];
  }

  if (normalized.includes("可数") || normalized.includes("不可数")) {
    return [
      ex("We still need some paper, a little glue, and three clean boxes for the art task.", "美术任务里，我们还需要一些纸、一点胶水和三个干净盒子。"),
      ex("There isn't much milk left, but there are enough eggs for breakfast.", "牛奶剩得不多了，但做早饭的鸡蛋还够。"),
      ex("How much time do we have, and how many pages do we need to read tonight?", "我们还有多少时间？今晚还要读多少页？"),
    ];
  }

  if (normalized.includes("this/that") || normalized.includes("one/ones") || normalized.includes("some 与 any") || normalized.includes("both") || normalized.includes("much") || normalized.includes("few")) {
    return [
      ex("These gloves are warmer than those, but the black ones fit me better when I ride home.", "这些手套比那些更暖，但我骑车回家时黑色那副更合手。"),
      ex("We have a few clean cups left, but we do not have any large plates.", "我们还剩几个干净杯子，但已经没有大盘子了。"),
      ex("Both answers look possible at first, yet only this one matches the whole story.", "这两个答案乍看都像对的，但只有这个和整段意思一致。"),
    ];
  }

  if (normalized.includes("词序") || normalized.includes("always") || normalized.includes("still") || normalized.includes("give me")) {
    return [
      ex("She almost always finishes the hard questions first, and then she checks the easy ones again.", "她几乎总是先做完难题，然后再把简单题检查一遍。"),
      ex("Please send me the photo after dinner, because I still need it for the class board.", "晚饭后请把照片发给我，因为我还要把它用在班级展示板上。"),
      ex("My father still gets up early, even when he goes to bed very late.", "即使睡得很晚，我爸爸还是会早起。"),
    ];
  }

  if (normalized.includes("短语动词") || normalized.includes("put on") || normalized.includes("run away")) {
    return [
      ex("Please take off your wet shoes before you walk into the hall, and then hang up your coat.", "进礼堂前请先脱下湿鞋，然后把外套挂起来。"),
      ex("He picked up the note, looked at it twice, and then put it back on the desk.", "他捡起纸条，看了两遍，然后又放回桌上。"),
      ex("The little dog ran away at first, but it came back when the boy called softly.", "那只小狗一开始跑开了，但男孩轻声叫它时，它又回来了。"),
    ];
  }

  return [
    ex("Use this grammar in a longer sentence about school, home, or a weekend plan.", "把这个语法放进一个更长的句子里，场景可以是学校、家里或周末计划。"),
    ex("Say the same idea again, but change both the person and the time.", "把同一个意思再说一遍，但人物和时间都换掉。"),
    ex("Try one sentence with because or when so the idea becomes more complete.", "试着加上 because 或 when，让句子意思更完整。"),
  ];
}

function buildPracticeCards(unit: GrammarUnit): GrammarPracticeCard[] {
  const normalized = `${unit.title} ${unit.summary} ${unit.patterns.join(" ")}`.toLowerCase();
  const firstPattern = unit.patterns[0] ?? "Make one more sentence with this grammar.";
  const cards: GrammarPracticeCard[] = [
    {
      label: "换内容",
      task: "保持句型不变，只换人物、地点、时间或数量。",
      sample: firstPattern,
      hint: "先照着说一遍，再改一个信息重新说。",
    },
  ];

  if (/疑问|question|\?/.test(normalized)) {
    cards.push({
      label: "问答配对",
      task: "先自己提问，再用完整句回答。",
      sample: "Is he ready? Yes, he is. / No, he isn't.",
      hint: "回答别只停在 Yes 或 No。",
    });
  }

  if (/否定|don't|doesn't|didn't|isn't|aren't|haven't|can't|mustn't/.test(normalized)) {
    cards.push({
      label: "肯否转换",
      task: "把肯定句改成否定句，再说回肯定句。",
      sample: "She likes math. -> She doesn't like math.",
      hint: "注意 not 和助动词的位置。",
    });
  }

  if (normalized.includes("一般现在时")) {
    cards.push({
      label: "三单训练",
      task: "把 I / we 句换成 he / she 句。",
      sample: "I walk home. -> He walks home.",
      hint: "第三人称单数常要加 -s 或 -es。",
    });
  }

  if (normalized.includes("现在进行时")) {
    cards.push({
      label: "看图描述",
      task: "用 be + doing 说眼前正在发生的动作。",
      sample: "The girls are drawing on the board.",
      hint: "先看谁在做，再说正在做什么。",
    });
  }

  if (normalized.includes("一般过去时") || normalized.includes("过去进行时") || normalized.includes("used to")) {
    cards.push({
      label: "时间替换",
      task: "把 today / now 换成 yesterday / last night 再造句。",
      sample: "We play outside. -> We played outside yesterday.",
      hint: "过去时间要和过去形式一起出现。",
    });
  }

  if (/比较|than|as\.\.\.as|最高级/.test(normalized)) {
    cards.push({
      label: "比较扩展",
      task: "换两样新的东西做比较。",
      sample: "My bag is heavier than yours.",
      hint: "比较对象两边都要说清楚。",
    });
  }

  if (/can|could|should|must|have to|need to|will|might/.test(normalized)) {
    cards.push({
      label: "建议表达",
      task: "把规则、建议或计划说成一整句。",
      sample: "We should line up quietly before class.",
      hint: "先想“该做什么”，再补场景。",
    });
  }

  if (/because|when|if|who|which|that|定语从句/.test(normalized)) {
    cards.push({
      label: "连句练习",
      task: "把两个短句连成一个长句。",
      sample: "I stayed inside because it was raining.",
      hint: "先想清楚两句之间的关系。",
    });
  }

  cards.push({
    label: "口头复述",
    task: "把第一条例句换成你自己的校园或家庭场景。",
    sample: unit.examples[0]?.english ?? "Use the first example and change the scene.",
    hint: "不必全换，只改最重要的 1 到 2 个信息。",
  });

  return cards.slice(0, 4);
}

function buildDisplayExamples(unit: GrammarUnit): GrammarExample[] {
  return dedupeExamples([
    ...buildChallengeExamples(unit),
    ...buildExtraExamples(unit),
    ...buildScenarioExamples(unit),
  ]).slice(0, 7);
}

function countRichGrammarExamples(): number {
  return ENGLISH_GRAMMAR_CHAPTERS.reduce(
    (sum, chapter) =>
      sum +
      chapter.units.reduce(
        (chapterSum, unit) => chapterSum + buildDisplayExamples(unit).length,
        0
      ),
    0
  );
}

export default function GrammarPage() {
  const { id } = useParams<{ id: string }>();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(["present"])
  );
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(
    () => new Set([1])
  );
  const [query, setQuery] = useState("");
  const [playingExampleId, setPlayingExampleId] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const searchText = deferredQuery.trim().toLowerCase();
  const isSearching = searchText.length > 0;

  const filteredChapters = ENGLISH_GRAMMAR_CHAPTERS.map((chapter) => {
    if (!isSearching) {
      return chapter;
    }

    const units = chapter.units.filter((unit) => {
      const formCards = buildFormCards(unit);
      const practiceCards = buildPracticeCards(unit);
      const displayExamples = buildDisplayExamples(unit);
      const haystack = [
        unit.title,
        unit.summary,
        ...unit.patterns,
        ...formCards.flatMap((formCard) => [formCard.label, formCard.value, formCard.hint]),
        ...practiceCards.flatMap((practiceCard) => [
          practiceCard.label,
          practiceCard.task,
          practiceCard.sample,
          practiceCard.hint,
        ]),
        ...displayExamples.flatMap((example) => [example.english, example.chinese]),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchText);
    });

    return { ...chapter, units };
  }).filter((chapter) => chapter.units.length > 0);

  const toggleChapter = (chapterKey: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterKey)) {
        next.delete(chapterKey);
      } else {
        next.add(chapterKey);
      }
      return next;
    });
  };

  const toggleUnit = (unitId: number) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const playExampleAudio = (exampleId: string, sentence: string) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      return;
    }

    const synth = window.speechSynthesis;

    if (playingExampleId === exampleId) {
      synth.cancel();
      setPlayingExampleId(null);
      return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    const voice = getEnglishVoice();

    utterance.lang = "en-US";
    utterance.rate = 0.85;
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      setPlayingExampleId((current) => (current === exampleId ? null : current));
    };
    utterance.onerror = () => {
      setPlayingExampleId((current) => (current === exampleId ? null : current));
    };

    setPlayingExampleId(exampleId);
    window.setTimeout(() => {
      synth.speak(utterance);
    }, 0);
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setSpeechAvailable(false);
      return;
    }

    const synth = window.speechSynthesis;
    const handleVoicesChanged = () => {
      synth.getVoices();
    };

    setSpeechAvailable(true);
    synth.getVoices();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged);
    } else {
      synth.onvoiceschanged = handleVoicesChanged;
    }

    return () => {
      synth.cancel();
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      } else if (synth.onvoiceschanged === handleVoicesChanged) {
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/subjects/${id}`}
            className="text-sm font-medium text-amber-700 transition hover:text-amber-800"
          >
            ← 返回英语主页
          </Link>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700 shadow-sm ring-1 ring-amber-100">
            语法学习
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
            <p className="text-sm font-semibold text-amber-600">
              English Grammar Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              英语语法
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
              基于《剑桥初级英语语法》115 个 unit 的目录重组，内容改写成适合小学生的学习笔记。
              每个 unit 都补了更清楚的句型提示和中等偏难的进阶例句，便于自己复习，也便于家长带着学。
            </p>

            <div className="mt-6 rounded-[24px] border border-amber-100 bg-amber-50/60 p-4 text-sm leading-7 text-stone-700">
              词汇尽量控制在常见基础 1200 词范围内，句法难度整体提到中等偏难，
              更适合做“理解规则 + 放进真实场景”的训练。
            </div>

            <div className="mt-6">
              <label
                htmlFor="grammar-search"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"
              >
                搜索语法点
              </label>
              <input
                id="grammar-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如：一般现在时 / because / in on at"
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                Unit 总数
              </p>
              <p className="mt-3 text-3xl font-semibold text-amber-600">
                {countGrammarUnits()}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                章节数量
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {ENGLISH_GRAMMAR_CHAPTERS.length}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                例句总量
              </p>
              <p className="mt-3 text-3xl font-semibold text-emerald-600">
                {countRichGrammarExamples()}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                适用程度
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                小学进阶
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 space-y-4">
          {filteredChapters.length > 0 ? (
            filteredChapters.map((chapter) => {
              const isChapterOpen = isSearching || expandedChapters.has(chapter.key);

              return (
                <section
                  key={chapter.key}
                  className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]"
                >
                  <button
                    onClick={() => toggleChapter(chapter.key)}
                    className="flex w-full items-start justify-between gap-4 bg-white px-5 py-5 text-left transition hover:bg-stone-50 sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-base font-semibold text-amber-700">
                        {chapter.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold text-slate-900">
                            {chapter.name}
                          </h2>
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            {chapter.units.length} 个 unit
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-stone-500">
                          {chapter.subtitle}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                      {isChapterOpen ? "收起" : "展开"}
                    </span>
                  </button>

                  {isChapterOpen && (
                    <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
                      <div className="space-y-3">
                        {chapter.units.map((unit) => {
                          const isUnitOpen = isSearching || expandedUnits.has(unit.id);
                          const formCards = buildFormCards(unit);
                          const practiceCards = buildPracticeCards(unit);
                          const displayExamples = buildDisplayExamples(unit);

                          return (
                            <article
                              key={unit.id}
                              className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm"
                            >
                              <button
                                onClick={() => toggleUnit(unit.id)}
                                className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-stone-50 sm:px-5"
                              >
                                <div className="flex min-w-0 items-start gap-3">
                                  <span className="mt-0.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                                    {unit.id}
                                  </span>
                                  <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
                                      {unit.title}
                                    </h3>
                                    <p className="mt-1 text-sm leading-6 text-stone-500">
                                      {unit.summary}
                                    </p>
                                  </div>
                                </div>

                                <span className="shrink-0 text-sm font-medium text-stone-400">
                                  {isUnitOpen ? "收起" : "展开"}
                                </span>
                              </button>

                              {isUnitOpen && (
                                <div className="border-t border-stone-100 bg-white px-4 py-4 sm:px-5">
                                  <div className="space-y-4">
                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        常用句型
                                      </p>
                                      <div className="mt-3 space-y-2">
                                        {unit.patterns.map((pattern) => (
                                          <div
                                            key={pattern}
                                            className="rounded-2xl bg-white px-4 py-3 text-sm font-medium leading-7 text-slate-800 shadow-sm ring-1 ring-stone-200/80"
                                          >
                                            {pattern}
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        句型形式
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {formCards.map((formCard) => (
                                          <div
                                            key={`${unit.id}-${formCard.label}-${formCard.value}`}
                                            className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                          >
                                            <div className="space-y-3">
                                              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                                {formCard.label}
                                              </span>
                                              <p className="text-sm font-medium leading-7 text-slate-900">
                                                {formCard.value}
                                              </p>
                                              <p className="text-sm leading-7 text-stone-500">
                                                {formCard.hint}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        更多例句
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {displayExamples.map((example, index) => {
                                          const exampleId = `${unit.id}-${index}`;
                                          const isPlaying = playingExampleId === exampleId;

                                          return (
                                            <div
                                            key={exampleId}
                                            className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                          >
                                            <div className="space-y-3">
                                              <div className="flex items-start justify-between gap-3">
                                                <span
                                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                                  index < 4
                                                    ? "bg-sky-50 text-sky-700"
                                                    : "bg-emerald-50 text-emerald-700"
                                                }`}
                                              >
                                                {index < 4 ? `进阶 ${index + 1}` : `应用 ${index - 3}`}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  playExampleAudio(exampleId, example.english);
                                                }}
                                                disabled={!speechAvailable}
                                                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                                  isPlaying
                                                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                                } disabled:cursor-not-allowed disabled:opacity-50`}
                                                title={isPlaying ? "停止朗读" : `播放 ${example.english}`}
                                                aria-label={isPlaying ? "停止朗读例句" : `播放例句 ${index + 1}`}
                                              >
                                                {isPlaying ? "■" : "▶"}
                                              </button>
                                            </div>
                                            <p className="overflow-x-auto whitespace-nowrap text-sm font-medium leading-7 text-slate-900">
                                              {example.english}
                                              </p>
                                              <p className="overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                                {example.chinese}
                                              </p>
                                            </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="rounded-[24px] border border-stone-200 bg-stone-50/70 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                        变式练习
                                      </p>
                                      <div className="mt-3 space-y-3">
                                        {practiceCards.map((practiceCard) => (
                                          <div
                                            key={`${unit.id}-${practiceCard.label}-${practiceCard.sample}`}
                                            className="rounded-[22px] border border-stone-200 bg-white px-4 py-4 shadow-sm"
                                          >
                                            <div className="space-y-3">
                                              <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                                                {practiceCard.label}
                                              </span>
                                              <p className="text-sm font-medium leading-7 text-slate-900">
                                                {practiceCard.task}
                                              </p>
                                              <p className="overflow-x-auto whitespace-nowrap text-sm leading-7 text-stone-500">
                                                {practiceCard.sample}
                                              </p>
                                              <p className="text-xs leading-6 text-stone-400">
                                                {practiceCard.hint}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <div className="rounded-[32px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-sm">
              <p className="text-lg font-medium text-stone-500">没有找到匹配的语法点</p>
              <p className="mt-2 text-sm text-stone-400">
                试试搜索：一般过去时、because、介词、比较级、情态动词
              </p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_12px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 active:scale-90"
        title="回到顶部"
        aria-label="回到顶部"
      >
        ↑
      </button>
    </div>
  );
}
