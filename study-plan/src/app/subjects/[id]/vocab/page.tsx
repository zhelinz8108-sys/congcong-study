"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Subject, Unit, Material, Word } from "@/lib/types";

/* ── Helpers ── */
function fmtInterval(days: number): string {
  if (days === 0) return "新词";
  if (days === 1) return "1天后";
  if (days < 7) return `${days}天后`;
  if (days < 30) return `${Math.round(days / 7)}周后`;
  if (days < 365) return `${Math.round(days / 30)}个月后`;
  return `${Math.round(days / 365)}年后`;
}

const RATING_BUTTONS = [
  { quality: 0, label: "不会", sub: "1天", color: "bg-red-500 hover:bg-red-600" },
  { quality: 1, label: "困难", sub: "1天", color: "bg-orange-500 hover:bg-orange-600" },
  { quality: 2, label: "一般", sub: "", color: "bg-blue-500 hover:bg-blue-600" },
  { quality: 3, label: "简单", sub: "", color: "bg-emerald-500 hover:bg-emerald-600" },
];

/* ── Types ── */
interface SubjectWithUnits extends Subject {
  units: (Unit & { word_count?: number })[];
}

interface WordBook {
  groupName: string;
  units: (Unit & { word_count?: number })[];
  totalWords: number;
}

interface ChoiceQuestion {
  word: Word;
  answer: string;
  options: string[];
}

interface ChoiceAnswer {
  word: Word;
  selected: string;
  answer: string;
  correct: boolean;
}

const CHINESE_POS_WORDS = new Set([
  "名",
  "动",
  "形",
  "副",
  "介",
  "连",
  "代",
  "数",
  "冠",
  "叹",
  "助",
  "名词",
  "动词",
  "形容词",
  "副词",
  "介词",
  "连词",
  "代词",
  "数词",
  "冠词",
  "叹词",
  "助动词",
]);

function cleanMeaning(meaning: string | null | undefined): string {
  const text = (meaning ?? "")
    .replace(/\([^()\u4e00-\u9fff]*\)/g, " ")
    .replace(/\b(?:vt|vi|adj|adv|prep|pron|conj|aux|num|art|interj|modal|n|v|a|ad)\.?\b/gi, " ")
    .replace(/[\/]+/g, " ")
    .replace(/[；;，,、]+/g, "，")
    .replace(/\s+/g, " ")
    .trim();

  const seen = new Set<string>();
  const parts = text
    .split(/[，\s]+/)
    .map((part) => part.replace(/^[.。:：;；,，、\s]+|[.。:：;；,，、\s]+$/g, ""))
    .filter((part) => part && !CHINESE_POS_WORDS.has(part))
    .filter((part) => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    });

  return parts.join("，");
}

type VocabularyBand = "primary" | "junior" | "senior";
type WordKind = "noun" | "verb" | "adj" | "adv" | "prep" | "conj";

interface WordUsageExample {
  phrase: string;
  chinese: string;
}

interface SentenceInfo {
  english: string;
  chinese: string;
}

function getVocabularyBand(groupName?: string): VocabularyBand {
  const name = (groupName ?? "").toLowerCase();
  if (/高中|7000|senior|high/.test(name)) return "senior";
  if (/初中|2000|junior|middle/.test(name)) return "junior";
  return "primary";
}

function getMainMeaning(meaning: string | null | undefined): string {
  return cleanMeaning(meaning).split("，").find(Boolean) ?? "这个词";
}

function getWordKind(meaning: string | null | undefined): WordKind {
  const raw = meaning ?? "";
  const mainMeaning = getMainMeaning(raw);
  if (/\b(?:prep)\.?\b|介词|介\b/i.test(raw)) return "prep";
  if (/\b(?:conj)\.?\b|连词|连\b/i.test(raw)) return "conj";
  if (/\b(?:adv|ad)\.?\b|副词|副\b/i.test(raw)) return "adv";
  if (/\b(?:adj|a)\.?\b|形容词|形\b/i.test(raw)) return "adj";
  if (/\b(?:vt|vi|v)\.?\b|动词|动\b/i.test(raw)) return "verb";
  if (/的$/.test(mainMeaning)) return "adj";
  if (/地$/.test(mainMeaning)) return "adv";
  return "noun";
}

function normalizeUsageKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function mergeUsageExamples(
  ...groups: Array<WordUsageExample[] | undefined>
): WordUsageExample[] {
  const merged: WordUsageExample[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group ?? []) {
      const phrase = item.phrase.trim();
      const chinese = item.chinese.trim();
      const key = normalizeUsageKey(phrase);
      if (!phrase || !chinese || seen.has(key)) continue;
      seen.add(key);
      merged.push({ phrase, chinese });
      if (merged.length >= 2) return merged;
    }
  }

  return merged;
}

function getSentenceContextUsage(
  target: string,
  sentenceInfo?: SentenceInfo | null
): WordUsageExample[] {
  if (!sentenceInfo?.english) return [];

  const targetKey = normalizeUsageKey(target);
  if (!targetKey) return [];

  const tokens = Array.from(
    sentenceInfo.english.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)
  ).map((match) => match[0]);
  const matchIndex = tokens.findIndex((token) => normalizeUsageKey(token) === targetKey);
  if (matchIndex < 0) return [];

  const start = Math.max(0, matchIndex - 2);
  const end = Math.min(tokens.length, matchIndex + 3);
  const phrase = tokens.slice(start, end).join(" ");
  if (!phrase || normalizeUsageKey(phrase) === targetKey) return [];

  return [
    {
      phrase,
      chinese: sentenceInfo.chinese
        ? `原句：${sentenceInfo.chinese}`
        : "来自原句的自然用法",
    },
  ];
}

const COMMON_USAGE_EXAMPLES: Record<string, WordUsageExample[]> = {
  a: [
    { phrase: "a book", chinese: "一本书" },
    { phrase: "a good friend", chinese: "一个好朋友" },
  ],
  an: [
    { phrase: "an egg", chinese: "一个鸡蛋" },
    { phrase: "an old book", chinese: "一本旧书" },
  ],
  the: [
    { phrase: "the same day", chinese: "同一天" },
    { phrase: "the next morning", chinese: "第二天早上" },
  ],
  as: [
    { phrase: "as usual", chinese: "像往常一样" },
    { phrase: "as well", chinese: "也；同样" },
  ],
  for: [
    { phrase: "wait for me", chinese: "等我" },
    { phrase: "for you", chinese: "给你；为了你" },
  ],
  to: [
    { phrase: "go to school", chinese: "去上学" },
    { phrase: "listen to music", chinese: "听音乐" },
  ],
  have: [
    { phrase: "have lunch", chinese: "吃午饭" },
    { phrase: "have time", chinese: "有时间" },
  ],
  she: [
    { phrase: "she is kind", chinese: "她很友好" },
    { phrase: "she can read", chinese: "她会阅读" },
  ],
  of: [
    { phrase: "a piece of bread", chinese: "一片面包" },
    { phrase: "a glass of milk", chinese: "一杯牛奶" },
  ],
  and: [
    { phrase: "bread and milk", chinese: "面包和牛奶" },
    { phrase: "read and write", chinese: "读和写" },
  ],
  some: [
    { phrase: "some water", chinese: "一些水" },
    { phrase: "some food", chinese: "一些食物" },
  ],
  drink: [
    { phrase: "drink water", chinese: "喝水" },
    { phrase: "drink milk", chinese: "喝牛奶" },
  ],
  time: [
    { phrase: "have time", chinese: "有时间" },
    { phrase: "spend time", chinese: "花时间" },
  ],
  lunch: [
    { phrase: "have lunch", chinese: "吃午饭" },
    { phrase: "make lunch", chinese: "做午饭" },
  ],
  breakfast: [
    { phrase: "have breakfast", chinese: "吃早饭" },
    { phrase: "eat breakfast", chinese: "吃早餐" },
  ],
  supper: [
    { phrase: "have supper", chinese: "吃晚饭" },
    { phrase: "cook supper", chinese: "做晚饭" },
  ],
  dinner: [
    { phrase: "have dinner", chinese: "吃晚饭" },
    { phrase: "cook dinner", chinese: "做晚饭" },
  ],
  meal: [
    { phrase: "have a meal", chinese: "吃一顿饭" },
    { phrase: "cook a meal", chinese: "做一顿饭" },
  ],
  sandwich: [
    { phrase: "make a sandwich", chinese: "做一个三明治" },
    { phrase: "eat a sandwich", chinese: "吃一个三明治" },
  ],
  salad: [
    { phrase: "make salad", chinese: "做沙拉" },
    { phrase: "eat salad", chinese: "吃沙拉" },
  ],
  noodle: [
    { phrase: "eat noodles", chinese: "吃面条" },
    { phrase: "cook noodles", chinese: "煮面条" },
  ],
  noodles: [
    { phrase: "eat noodles", chinese: "吃面条" },
    { phrase: "cook noodles", chinese: "煮面条" },
  ],
  pie: [
    { phrase: "make a pie", chinese: "做一个馅饼" },
    { phrase: "eat a pie", chinese: "吃一个馅饼" },
  ],
  pizza: [
    { phrase: "order pizza", chinese: "点披萨" },
    { phrase: "eat pizza", chinese: "吃披萨" },
  ],
  egg: [
    { phrase: "boil an egg", chinese: "煮一个鸡蛋" },
    { phrase: "eat an egg", chinese: "吃一个鸡蛋" },
  ],
  bread: [
    { phrase: "eat bread", chinese: "吃面包" },
    { phrase: "buy bread", chinese: "买面包" },
  ],
  milk: [
    { phrase: "drink milk", chinese: "喝牛奶" },
    { phrase: "a glass of milk", chinese: "一杯牛奶" },
  ],
  juice: [
    { phrase: "drink juice", chinese: "喝果汁" },
    { phrase: "make juice", chinese: "榨果汁" },
  ],
  tea: [
    { phrase: "drink tea", chinese: "喝茶" },
    { phrase: "make tea", chinese: "泡茶" },
  ],
  water: [
    { phrase: "drink water", chinese: "喝水" },
    { phrase: "save water", chinese: "节约用水" },
  ],
  food: [
    { phrase: "eat food", chinese: "吃食物" },
    { phrase: "buy food", chinese: "买食物" },
  ],
  book: [
    { phrase: "read a book", chinese: "读一本书" },
    { phrase: "open your book", chinese: "打开你的书" },
  ],
  school: [
    { phrase: "go to school", chinese: "去上学" },
    { phrase: "after school", chinese: "放学后" },
  ],
  class: [
    { phrase: "have class", chinese: "上课" },
    { phrase: "in class", chinese: "在课堂上" },
  ],
  homework: [
    { phrase: "do homework", chinese: "做作业" },
    { phrase: "finish homework", chinese: "完成作业" },
  ],
  home: [
    { phrase: "go home", chinese: "回家" },
    { phrase: "at home", chinese: "在家" },
  ],
  friend: [
    { phrase: "make friends", chinese: "交朋友" },
    { phrase: "help a friend", chinese: "帮助朋友" },
  ],
  family: [
    { phrase: "love family", chinese: "爱家人" },
    { phrase: "family photo", chinese: "全家福" },
  ],
  music: [
    { phrase: "listen to music", chinese: "听音乐" },
    { phrase: "play music", chinese: "播放音乐" },
  ],
  football: [
    { phrase: "play football", chinese: "踢足球" },
    { phrase: "watch football", chinese: "看足球比赛" },
  ],
  basketball: [
    { phrase: "play basketball", chinese: "打篮球" },
    { phrase: "watch basketball", chinese: "看篮球比赛" },
  ],
  bike: [
    { phrase: "ride a bike", chinese: "骑自行车" },
    { phrase: "by bike", chinese: "骑车" },
  ],
  help: [
    { phrase: "help me", chinese: "帮助我" },
    { phrase: "ask for help", chinese: "寻求帮助" },
  ],
  happy: [
    { phrase: "feel happy", chinese: "感到开心" },
    { phrase: "make me happy", chinese: "让我开心" },
  ],
  tired: [
    { phrase: "feel tired", chinese: "感到累" },
    { phrase: "look tired", chinese: "看起来累" },
  ],
  hungry: [
    { phrase: "feel hungry", chinese: "感到饿" },
    { phrase: "get hungry", chinese: "变饿" },
  ],
  thirsty: [
    { phrase: "feel thirsty", chinese: "感到渴" },
    { phrase: "get thirsty", chinese: "变渴" },
  ],
  pain: [
    { phrase: "feel pain", chinese: "感到疼痛" },
    { phrase: "have a pain", chinese: "感到疼；有疼痛" },
  ],
};

const FUNCTION_USAGE_EXAMPLES: Record<string, WordUsageExample[]> = {
  in: [
    { phrase: "in class", chinese: "在课堂上" },
    { phrase: "in the morning", chinese: "在早上" },
  ],
  on: [
    { phrase: "on Monday", chinese: "在星期一" },
    { phrase: "on the desk", chinese: "在桌子上" },
  ],
  at: [
    { phrase: "at home", chinese: "在家" },
    { phrase: "at school", chinese: "在学校" },
  ],
  by: [
    { phrase: "by bus", chinese: "乘公交车" },
    { phrase: "by hand", chinese: "用手工" },
  ],
  with: [
    { phrase: "with my family", chinese: "和我的家人一起" },
    { phrase: "with me", chinese: "和我一起" },
  ],
  from: [
    { phrase: "from school", chinese: "从学校来" },
    { phrase: "from China", chinese: "来自中国" },
  ],
  about: [
    { phrase: "talk about it", chinese: "谈论它" },
    { phrase: "learn about animals", chinese: "了解动物" },
  ],
  into: [
    { phrase: "go into the room", chinese: "走进房间" },
    { phrase: "put it into the bag", chinese: "把它放进包里" },
  ],
  onto: [
    { phrase: "jump onto the chair", chinese: "跳到椅子上" },
    { phrase: "put it onto the table", chinese: "把它放到桌上" },
  ],
  over: [
    { phrase: "over the bridge", chinese: "过桥" },
    { phrase: "over there", chinese: "在那边" },
  ],
  under: [
    { phrase: "under the tree", chinese: "在树下" },
    { phrase: "under the bed", chinese: "在床下" },
  ],
  between: [
    { phrase: "between two trees", chinese: "在两棵树之间" },
    { phrase: "between you and me", chinese: "在你我之间" },
  ],
  among: [
    { phrase: "among the students", chinese: "在学生中间" },
    { phrase: "among the trees", chinese: "在树木之间" },
  ],
  after: [
    { phrase: "after school", chinese: "放学后" },
    { phrase: "after class", chinese: "下课后" },
  ],
  before: [
    { phrase: "before class", chinese: "上课前" },
    { phrase: "before lunch", chinese: "午饭前" },
  ],
  during: [
    { phrase: "during the class", chinese: "在课堂期间" },
    { phrase: "during the holiday", chinese: "在假期期间" },
  ],
  without: [
    { phrase: "without water", chinese: "没有水" },
    { phrase: "without help", chinese: "没有帮助" },
  ],
  within: [
    { phrase: "within one hour", chinese: "在一小时内" },
    { phrase: "within the group", chinese: "在小组内" },
  ],
  through: [
    { phrase: "walk through the park", chinese: "穿过公园" },
    { phrase: "read through the story", chinese: "通读这个故事" },
  ],
  across: [
    { phrase: "walk across the road", chinese: "穿过马路" },
    { phrase: "across the river", chinese: "在河对面" },
  ],
  around: [
    { phrase: "walk around the school", chinese: "绕着学校走" },
    { phrase: "look around", chinese: "四处看看" },
  ],
  or: [
    { phrase: "tea or milk", chinese: "茶或牛奶" },
    { phrase: "today or tomorrow", chinese: "今天或明天" },
  ],
  but: [
    { phrase: "small but useful", chinese: "小但有用" },
    { phrase: "try but fail", chinese: "尝试但失败" },
  ],
  if: [
    { phrase: "if you can", chinese: "如果你可以" },
    { phrase: "if it rains", chinese: "如果下雨" },
  ],
  when: [
    { phrase: "when I get home", chinese: "当我到家时" },
    { phrase: "when class begins", chinese: "当上课开始时" },
  ],
  while: [
    { phrase: "while I read", chinese: "当我阅读时" },
    { phrase: "wait for a while", chinese: "等一会儿" },
  ],
  than: [
    { phrase: "older than me", chinese: "比我年长" },
    { phrase: "more than ten", chinese: "超过十个" },
  ],
  that: [
    { phrase: "that book", chinese: "那本书" },
    { phrase: "I know that", chinese: "我知道那件事" },
  ],
  this: [
    { phrase: "this book", chinese: "这本书" },
    { phrase: "this morning", chinese: "今天早上" },
  ],
  these: [
    { phrase: "these books", chinese: "这些书" },
    { phrase: "these days", chinese: "这些天" },
  ],
  those: [
    { phrase: "those students", chinese: "那些学生" },
    { phrase: "those days", chinese: "那些日子" },
  ],
  which: [
    { phrase: "which one", chinese: "哪一个" },
    { phrase: "which color", chinese: "哪种颜色" },
  ],
  who: [
    { phrase: "who is he", chinese: "他是谁" },
    { phrase: "who can help", chinese: "谁能帮忙" },
  ],
  whom: [
    { phrase: "with whom", chinese: "和谁一起" },
    { phrase: "for whom", chinese: "为了谁" },
  ],
  whose: [
    { phrase: "whose book", chinese: "谁的书" },
    { phrase: "whose bag", chinese: "谁的包" },
  ],
  what: [
    { phrase: "what time", chinese: "几点" },
    { phrase: "what color", chinese: "什么颜色" },
  ],
  where: [
    { phrase: "where to go", chinese: "去哪里" },
    { phrase: "where is it", chinese: "它在哪里" },
  ],
  why: [
    { phrase: "why not", chinese: "为什么不呢" },
    { phrase: "why do that", chinese: "为什么那样做" },
  ],
  how: [
    { phrase: "how much", chinese: "多少钱；多少" },
    { phrase: "how old", chinese: "多大年龄" },
  ],
  any: [
    { phrase: "any time", chinese: "任何时候" },
    { phrase: "any questions", chinese: "任何问题" },
  ],
  no: [
    { phrase: "no problem", chinese: "没问题" },
    { phrase: "no way", chinese: "没门；不可能" },
  ],
  not: [
    { phrase: "not yet", chinese: "还没有" },
    { phrase: "not at all", chinese: "一点也不" },
  ],
  yes: [
    { phrase: "yes please", chinese: "好的，请" },
    { phrase: "yes I can", chinese: "是的，我可以" },
  ],
  so: [
    { phrase: "so happy", chinese: "如此开心" },
    { phrase: "so much", chinese: "这么多" },
  ],
  very: [
    { phrase: "very good", chinese: "很好" },
    { phrase: "very much", chinese: "非常" },
  ],
  too: [
    { phrase: "too late", chinese: "太晚" },
    { phrase: "me too", chinese: "我也是" },
  ],
  also: [
    { phrase: "also like it", chinese: "也喜欢它" },
    { phrase: "also need help", chinese: "也需要帮助" },
  ],
  only: [
    { phrase: "only one", chinese: "只有一个" },
    { phrase: "only you", chinese: "只有你" },
  ],
  just: [
    { phrase: "just now", chinese: "刚才" },
    { phrase: "just a little", chinese: "只是一点" },
  ],
  even: [
    { phrase: "even better", chinese: "甚至更好" },
    { phrase: "even now", chinese: "即使现在" },
  ],
  then: [
    { phrase: "and then", chinese: "然后" },
    { phrase: "then go home", chinese: "然后回家" },
  ],
  now: [
    { phrase: "right now", chinese: "现在立刻" },
    { phrase: "now and then", chinese: "偶尔" },
  ],
  here: [
    { phrase: "come here", chinese: "到这里来" },
    { phrase: "right here", chinese: "就在这里" },
  ],
  there: [
    { phrase: "over there", chinese: "在那边" },
    { phrase: "go there", chinese: "去那里" },
  ],
  up: [
    { phrase: "get up", chinese: "起床" },
    { phrase: "stand up", chinese: "站起来" },
  ],
  down: [
    { phrase: "sit down", chinese: "坐下" },
    { phrase: "write down", chinese: "写下" },
  ],
  off: [
    { phrase: "get off", chinese: "下车" },
    { phrase: "turn off", chinese: "关掉" },
  ],
  out: [
    { phrase: "go out", chinese: "出去" },
    { phrase: "find out", chinese: "查明" },
  ],
  away: [
    { phrase: "go away", chinese: "走开" },
    { phrase: "far away", chinese: "很远" },
  ],
  back: [
    { phrase: "come back", chinese: "回来" },
    { phrase: "go back", chinese: "回去" },
  ],
  i: [
    { phrase: "I am ready", chinese: "我准备好了" },
    { phrase: "I can help", chinese: "我能帮忙" },
  ],
  me: [
    { phrase: "help me", chinese: "帮助我" },
    { phrase: "with me", chinese: "和我一起" },
  ],
  my: [
    { phrase: "my book", chinese: "我的书" },
    { phrase: "my family", chinese: "我的家人" },
  ],
  mine: [
    { phrase: "this is mine", chinese: "这是我的" },
    { phrase: "mine is here", chinese: "我的在这里" },
  ],
  you: [
    { phrase: "thank you", chinese: "谢谢你" },
    { phrase: "you can try", chinese: "你可以试试" },
  ],
  your: [
    { phrase: "your name", chinese: "你的名字" },
    { phrase: "your book", chinese: "你的书" },
  ],
  yours: [
    { phrase: "this is yours", chinese: "这是你的" },
    { phrase: "is it yours", chinese: "这是你的吗" },
  ],
  he: [
    { phrase: "he is tall", chinese: "他很高" },
    { phrase: "he can swim", chinese: "他会游泳" },
  ],
  him: [
    { phrase: "help him", chinese: "帮助他" },
    { phrase: "tell him", chinese: "告诉他" },
  ],
  his: [
    { phrase: "his book", chinese: "他的书" },
    { phrase: "his friend", chinese: "他的朋友" },
  ],
  her: [
    { phrase: "her bag", chinese: "她的包" },
    { phrase: "help her", chinese: "帮助她" },
  ],
  hers: [
    { phrase: "this is hers", chinese: "这是她的" },
    { phrase: "hers is new", chinese: "她的是新的" },
  ],
  we: [
    { phrase: "we are ready", chinese: "我们准备好了" },
    { phrase: "we can go", chinese: "我们可以走了" },
  ],
  us: [
    { phrase: "help us", chinese: "帮助我们" },
    { phrase: "with us", chinese: "和我们一起" },
  ],
  our: [
    { phrase: "our class", chinese: "我们的班级" },
    { phrase: "our school", chinese: "我们的学校" },
  ],
  ours: [
    { phrase: "this is ours", chinese: "这是我们的" },
    { phrase: "ours is big", chinese: "我们的是大的" },
  ],
  they: [
    { phrase: "they are friends", chinese: "他们是朋友" },
    { phrase: "they can help", chinese: "他们能帮忙" },
  ],
  them: [
    { phrase: "help them", chinese: "帮助他们" },
    { phrase: "tell them", chinese: "告诉他们" },
  ],
  their: [
    { phrase: "their home", chinese: "他们的家" },
    { phrase: "their teacher", chinese: "他们的老师" },
  ],
  theirs: [
    { phrase: "this is theirs", chinese: "这是他们的" },
    { phrase: "theirs is clean", chinese: "他们的是干净的" },
  ],
  it: [
    { phrase: "try it", chinese: "试试它" },
    { phrase: "it is easy", chinese: "它很简单" },
  ],
  its: [
    { phrase: "its name", chinese: "它的名字" },
    { phrase: "its color", chinese: "它的颜色" },
  ],
  am: [
    { phrase: "I am fine", chinese: "我很好" },
    { phrase: "I am ready", chinese: "我准备好了" },
  ],
  is: [
    { phrase: "it is good", chinese: "它很好" },
    { phrase: "she is kind", chinese: "她很友好" },
  ],
  are: [
    { phrase: "we are ready", chinese: "我们准备好了" },
    { phrase: "they are here", chinese: "他们在这里" },
  ],
  was: [
    { phrase: "it was fun", chinese: "它很有趣" },
    { phrase: "he was late", chinese: "他迟到了" },
  ],
  were: [
    { phrase: "we were happy", chinese: "我们很开心" },
    { phrase: "they were there", chinese: "他们在那里" },
  ],
  be: [
    { phrase: "be careful", chinese: "小心" },
    { phrase: "be ready", chinese: "准备好" },
  ],
  been: [
    { phrase: "have been there", chinese: "去过那里" },
    { phrase: "has been ready", chinese: "已经准备好了" },
  ],
  being: [
    { phrase: "human being", chinese: "人类" },
    { phrase: "being kind", chinese: "保持友好" },
  ],
  do: [
    { phrase: "do homework", chinese: "做作业" },
    { phrase: "do well", chinese: "做得好" },
  ],
  does: [
    { phrase: "does homework", chinese: "做作业" },
    { phrase: "does well", chinese: "做得好" },
  ],
  did: [
    { phrase: "did homework", chinese: "做了作业" },
    { phrase: "did well", chinese: "做得好" },
  ],
  can: [
    { phrase: "can help", chinese: "能够帮忙" },
    { phrase: "can read", chinese: "会阅读" },
  ],
  could: [
    { phrase: "could help", chinese: "可以帮忙" },
    { phrase: "could be better", chinese: "可以更好" },
  ],
  may: [
    { phrase: "May I come in", chinese: "我可以进来吗" },
    { phrase: "may be right", chinese: "可能是对的" },
  ],
  might: [
    { phrase: "might be late", chinese: "可能会迟到" },
    { phrase: "might need help", chinese: "可能需要帮助" },
  ],
  must: [
    { phrase: "must be careful", chinese: "必须小心" },
    { phrase: "must go now", chinese: "现在必须走" },
  ],
  shall: [
    { phrase: "shall we go", chinese: "我们走好吗" },
    { phrase: "shall be ready", chinese: "将会准备好" },
  ],
  should: [
    { phrase: "should be careful", chinese: "应该小心" },
    { phrase: "should do homework", chinese: "应该做作业" },
  ],
  will: [
    { phrase: "will go home", chinese: "将要回家" },
    { phrase: "will be ready", chinese: "将会准备好" },
  ],
  would: [
    { phrase: "would like to", chinese: "想要" },
    { phrase: "would be better", chinese: "会更好" },
  ],
};

const FUNCTION_WORD_KEYS = new Set([
  ...Object.keys(FUNCTION_USAGE_EXAMPLES),
  "a",
  "an",
  "the",
  "as",
  "of",
  "to",
  "for",
  "and",
  "she",
  "some",
]);

function isLikelyFunctionWord(
  target: string,
  meaning: string | null | undefined,
  kind: WordKind
): boolean {
  const key = normalizeUsageKey(target);
  const rawMeaning = meaning ?? "";
  return (
    FUNCTION_WORD_KEYS.has(key) ||
    kind === "prep" ||
    kind === "conj" ||
    /\b(?:pron|art|aux|modal)\.?\b|代词|冠词|情态|助动词|连词|介词/.test(rawMeaning)
  );
}

function getFallbackUsageExamples(
  target: string,
  meaning: string,
  kind: WordKind,
  band: VocabularyBand
): WordUsageExample[] {
  if (kind === "verb") {
    return [
      { phrase: `try to ${target}`, chinese: `试着${meaning}` },
      { phrase: `need to ${target}`, chinese: `需要${meaning}` },
    ];
  }

  if (kind === "adj") {
    return [
      { phrase: `very ${target}`, chinese: `很${meaning}` },
      { phrase: `look ${target}`, chinese: `看起来${meaning}` },
    ];
  }

  if (kind === "adv") {
    return [
      { phrase: `work ${target}`, chinese: `${meaning}地做事` },
      { phrase: `answer ${target}`, chinese: `${meaning}地回答` },
    ];
  }

  if (kind === "prep" || kind === "conj") return [];

  if (band === "senior") {
    return [
      { phrase: `focus on ${target}`, chinese: `关注${meaning}` },
      { phrase: `deal with ${target}`, chinese: `处理${meaning}` },
    ];
  }

  return [
    { phrase: `talk about ${target}`, chinese: `谈论${meaning}` },
    { phrase: `learn about ${target}`, chinese: `了解${meaning}` },
  ];
}

function getWordUsageExamples(
  word: Word,
  groupName?: string,
  sentenceInfo?: SentenceInfo | null
): WordUsageExample[] {
  const target = word.word.trim();
  const meaning = getMainMeaning(word.meaning);
  const kind = getWordKind(word.meaning);
  const band = getVocabularyBand(groupName);

  if (!target) return [];

  const key = normalizeUsageKey(target);
  const sentenceUsage = getSentenceContextUsage(target, sentenceInfo);
  const commonUsage = COMMON_USAGE_EXAMPLES[key] ?? FUNCTION_USAGE_EXAMPLES[key];

  if (commonUsage) return mergeUsageExamples(sentenceUsage, commonUsage);

  // Function words are easy to misuse with templates, so never force a fake phrase.
  if (isLikelyFunctionWord(target, word.meaning, kind)) {
    return mergeUsageExamples(sentenceUsage);
  }

  return mergeUsageExamples(sentenceUsage, getFallbackUsageExamples(target, meaning, kind, band));
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isWordDue(word: Word): boolean {
  if (!word.next_review) return true;
  return new Date(word.next_review.replace(" ", "T")).getTime() <= Date.now();
}

function buildChoiceQuestions(
  sourceWords: Word[],
  optionWords: Word[]
): ChoiceQuestion[] {
  const candidates = sourceWords.filter(
    (word) => word.word.trim() && cleanMeaning(word.meaning)
  );
  const optionMeanings = Array.from(
    new Set(optionWords.map((word) => cleanMeaning(word.meaning)).filter(Boolean))
  );

  return shuffleArray(candidates)
    .map((word) => {
      const answer = cleanMeaning(word.meaning);
      const distractors = shuffleArray(optionMeanings.filter((item) => item !== answer)).slice(0, 3);
      return {
        word,
        answer,
        options: shuffleArray([answer, ...distractors]),
      };
    })
    .filter((question) => question.options.length >= 2);
}

/* ── Global audio control: stop any playing audio before starting new one ── */
function stopOtherCardAudio(current?: HTMLAudioElement | null) {
  if (typeof document === "undefined") return;
  const audioNodes = document.querySelectorAll<HTMLAudioElement>('audio[data-sentence-card-audio="true"]');
  audioNodes.forEach((audio) => {
    if (audio !== current) {
      audio.pause();
      audio.currentTime = 0;
    }
  });
}

function safePlay(el: HTMLAudioElement) {
  const p = el.play();
  if (p !== undefined) {
    p.catch(() => { /* ignore interrupted play */ });
  }
}

function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

/* ── Sentence Card (a unit with its words) ── */
function SentenceCard({
  unit,
  onDeleteWord,
}: {
  unit: Unit & { word_count?: number };
  onDeleteWord: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [words, setWords] = useState<Word[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sentenceInfo, setSentenceInfo] = useState<{ english: string; chinese: string } | null>(null);

  const [hideChinese, setHideChinese] = useState(false);
  const [hideEnglish, setHideEnglish] = useState(false);
  const [revealedChinese, setRevealedChinese] = useState<Set<string>>(new Set());
  const [revealedEnglish, setRevealedEnglish] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const wordTimeUpdateRef = useRef<(() => void) | null>(null);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [playingPhraseKey, setPlayingPhraseKey] = useState<string | null>(null);
  const [playingFull, setPlayingFull] = useState(false);

  const wordCount = (unit as { word_count?: number }).word_count ?? 0;

  const handleToggle = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && !loaded) {
      setLoading(true);
      try {
        const res = await fetch(`/api/units/${unit.id}/content`);
        if (res.ok) {
          const data = await res.json();
          setWords(data.words ?? []);
          setMaterials(data.materials ?? []);
          setSentenceInfo(data.sentenceText ?? null);
          setLoaded(true);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
  };

  const audioSrc = materials.find((m) => m.file_type === "audio")?.file_path;

  const clearWordPlaybackWatcher = () => {
    const el = audioRef.current;
    if (el && wordTimeUpdateRef.current) {
      el.removeEventListener("timeupdate", wordTimeUpdateRef.current);
      wordTimeUpdateRef.current = null;
    }
  };

  const playFull = () => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingWordId(null);
    setPlayingPhraseKey(null);
    clearWordPlaybackWatcher();
    stopOtherCardAudio(el);
    el.currentTime = 0;
    safePlay(el);
    setPlayingFull(true);
    setPlayingWordId(null);
  };

  const stopSentenceAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    clearWordPlaybackWatcher();
    el.pause();
    el.currentTime = 0;
  };

  const playWordAudio = (w: Word) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const voice = getEnglishVoice();
    stopSentenceAudio();
    stopOtherCardAudio();
    if (playingWordId === w.id) {
      synth.cancel();
      setPlayingWordId(null);
      return;
    }
    synth.cancel();
    setPlayingWordId(w.id);
    setPlayingPhraseKey(null);
    setPlayingFull(false);

    const utterance = new SpeechSynthesisUtterance(w.word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    if (voice) utterance.voice = voice;
    utterance.onend = () => setPlayingWordId((current) => (current === w.id ? null : current));
    utterance.onerror = () => setPlayingWordId((current) => (current === w.id ? null : current));
    synth.speak(utterance);
  };

  const playPhraseAudio = (phrase: string, phraseKey: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const voice = getEnglishVoice();

    stopSentenceAudio();
    stopOtherCardAudio();

    if (playingPhraseKey === phraseKey) {
      synth.cancel();
      setPlayingPhraseKey(null);
      return;
    }

    synth.cancel();
    setPlayingWordId(null);
    setPlayingPhraseKey(phraseKey);
    setPlayingFull(false);

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    if (voice) utterance.voice = voice;
    utterance.onend = () =>
      setPlayingPhraseKey((current) => (current === phraseKey ? null : current));
    utterance.onerror = () =>
      setPlayingPhraseKey((current) => (current === phraseKey ? null : current));
    synth.speak(utterance);
  };

  useEffect(() => {
    return () => {
      clearWordPlaybackWatcher();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleRevealChinese = (id: string) => {
    setRevealedChinese((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRevealEnglish = (id: string) => {
    setRevealedEnglish((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (wordId: string) => {
    const res = await fetch(`/api/words/${wordId}`, { method: "DELETE" });
    if (res.ok) {
      setWords((prev) => prev.filter((w) => w.id !== wordId));
      onDeleteWord();
    }
    setDeleteConfirm(null);
  };

  // Reset reveals when toggling hide modes
  const toggleHideChinese = () => {
    setHideChinese((v) => !v);
    setRevealedChinese(new Set());
  };
  const toggleHideEnglish = () => {
    setHideEnglish((v) => !v);
    setRevealedEnglish(new Set());
  };

  const sortedWords = [...words].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-4 bg-white px-4 py-4 text-left transition hover:bg-stone-50 sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-lg font-semibold text-emerald-700 transition ${
              expanded ? "rotate-45" : ""
            }`}
          >
            +
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-base font-semibold text-slate-900">
                {unit.name}
              </h4>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {wordCount} 词
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              展开后可听整句、逐词朗读，并切换遮挡练习。
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-stone-400">
          {expanded ? "收起" : "展开"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
          {loading ? (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-stone-500">加载单词中...</p>
            </div>
          ) : (
            <>
              <div className="rounded-[24px] border border-stone-200 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                      Sentence
                    </p>
                    {sentenceInfo ? (
                      <>
                        <p className="mt-3 text-lg font-semibold leading-8 text-slate-900">
                          {sentenceInfo.english}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          {sentenceInfo.chinese}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-sm leading-7 text-stone-500">
                        这组内容暂未提供句子预览，下面仍可直接学习单词。
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:max-w-sm lg:justify-end">
                    <button
                      onClick={toggleHideChinese}
                      className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${
                        hideChinese
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                          : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      遮住中文
                    </button>
                    <button
                      onClick={toggleHideEnglish}
                      className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${
                        hideEnglish
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                          : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      遮住英文
                    </button>
                    {audioSrc && (
                      <button
                        onClick={() => {
                          if (playingFull) {
                            if (audioRef.current) {
                              clearWordPlaybackWatcher();
                              audioRef.current.pause();
                              audioRef.current.currentTime = 0;
                            }
                            setPlayingFull(false);
                            setPlayingWordId(null);
                            setPlayingPhraseKey(null);
                          } else {
                            playFull();
                          }
                        }}
                        className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700"
                      >
                        {playingFull ? "停止整句" : "播放整句"}
                      </button>
                    )}
                  </div>
                </div>

                {audioSrc && (
                  <div className="mt-4 rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm">
                    <audio
                      ref={audioRef}
                      className="w-full accent-emerald-500"
                      controls
                      preload="metadata"
                      src={audioSrc}
                      data-sentence-card-audio="true"
                      onPlay={() => {
                        if (typeof window !== "undefined" && "speechSynthesis" in window) {
                          window.speechSynthesis.cancel();
                        }
                        setPlayingWordId(null);
                        setPlayingPhraseKey(null);
                        if (!wordTimeUpdateRef.current) setPlayingFull(true);
                      }}
                      onPause={() => {
                        clearWordPlaybackWatcher();
                        setPlayingWordId(null);
                        setPlayingPhraseKey(null);
                        setPlayingFull(false);
                      }}
                      onEnded={() => {
                        clearWordPlaybackWatcher();
                        setPlayingWordId(null);
                        setPlayingPhraseKey(null);
                        setPlayingFull(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {sortedWords.map((w, idx) => {
                  const chineseHidden = hideChinese && !revealedChinese.has(w.id);
                  const englishHidden = hideEnglish && !revealedEnglish.has(w.id);
                  const usageExamples = getWordUsageExamples(w, unit.group_name, sentenceInfo);

                  return (
                    <div
                      key={`${w.id}-${idx}`}
                      className="group rounded-[24px] border border-stone-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_14px_34px_rgba(16,185,129,0.10)] sm:p-4"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => playWordAudio(w)}
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                            playingWordId === w.id
                              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          }`}
                          title={`播放 ${w.word}`}
                        >
                          {playingWordId === w.id ? "■" : "▶"}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(260px,1.15fr)_auto] lg:items-start">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`cursor-pointer select-none text-lg font-semibold text-slate-900 ${
                                    englishHidden
                                      ? "rounded-md bg-slate-200 px-2 text-transparent"
                                      : ""
                                  }`}
                                  onClick={() => englishHidden && toggleRevealEnglish(w.id)}
                                >
                                  {w.word}
                                </span>
                                {w.phonetic && (
                                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                                    {w.phonetic}
                                  </span>
                                )}
                              </div>

                              <p
                                className={`mt-2 cursor-pointer select-none text-sm leading-7 text-stone-600 ${
                                  chineseHidden
                                    ? "inline-block rounded-md bg-slate-200 px-2 text-transparent"
                                    : ""
                                }`}
                                onClick={() => chineseHidden && toggleRevealChinese(w.id)}
                              >
                                {cleanMeaning(w.meaning) || w.meaning}
                              </p>

                              {w.example && (
                                <p className="mt-2 text-xs leading-6 text-stone-500">
                                  {w.example}
                                </p>
                              )}
                            </div>

                            <div className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/40 px-3 py-2.5">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                                用法
                              </p>
                              <div className="space-y-2">
                                {usageExamples.map((item, usageIdx) => {
                                  const phraseKey = `${w.id}-usage-${usageIdx}`;
                                  const isPlayingPhrase = playingPhraseKey === phraseKey;

                                  return (
                                    <div
                                      key={phraseKey}
                                      className="flex items-start gap-2 text-sm leading-6"
                                    >
                                      <button
                                        onClick={() => playPhraseAudio(item.phrase, phraseKey)}
                                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] transition ${
                                          isPlayingPhrase
                                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                            : "bg-white text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50"
                                        }`}
                                        title={`播放短语 ${item.phrase}`}
                                      >
                                        {isPlayingPhrase ? "■" : "▶"}
                                      </button>
                                      <div className="min-w-0">
                                        <p
                                          className={`select-none font-medium text-slate-900 ${
                                            englishHidden
                                              ? "inline-block rounded-md bg-slate-200 px-2 text-transparent"
                                              : ""
                                          }`}
                                          onClick={() => englishHidden && toggleRevealEnglish(w.id)}
                                        >
                                          {item.phrase}
                                        </p>
                                        <p
                                          className={`mt-0.5 select-none text-xs text-stone-500 ${
                                            chineseHidden
                                              ? "inline-block rounded-md bg-slate-200 px-2 text-transparent"
                                              : ""
                                          }`}
                                          onClick={() => chineseHidden && toggleRevealChinese(w.id)}
                                        >
                                          {item.chinese}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-start">
                              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500">
                                #{idx + 1}
                              </span>
                              {deleteConfirm === w.id ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleDelete(w.id)}
                                    className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white"
                                  >
                                    确认
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-stone-600"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(w.id)}
                                  className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500 transition hover:bg-red-50 hover:text-red-500"
                                  title="删除单词"
                                >
                                  删除
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sortedWords.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-400">
                    暂无单词
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Word Book Card ── */
function WordBookCard({
  book,
  onDeleteWord,
}: {
  book: WordBook;
  onDeleteWord: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 bg-white px-5 py-5 text-left transition hover:bg-stone-50 sm:px-6"
      >
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-xl">
            📘
          </div>
          <div className="min-w-0">
            <h3 className="break-words text-lg font-bold text-slate-900">
              {book.groupName}
            </h3>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              按句子展开单词、整句音频和逐词朗读。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 shadow-sm ring-1 ring-stone-200/80">
                {book.units.length} 个句子
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-stone-200">
                {book.totalWords} 个单词
              </span>
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
          {expanded ? "收起" : "展开"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
          <div className="space-y-4">
            {[...book.units]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((unit) => (
              <SentenceCard
                key={unit.id}
                unit={unit}
                onDeleteWord={onDeleteWord}
              />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Review Mode ── */
function ReviewMode({
  words,
  onFinish,
  onReview,
}: {
  words: Word[];
  onFinish: () => void;
  onReview: (wordId: string, quality: number) => Promise<void>;
}) {
  const [queue, setQueue] = useState<Word[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewDone, setReviewDone] = useState(0);
  const [rating, setRating] = useState(false);

  useEffect(() => {
    // Filter due words
    const now = new Date().toISOString();
    const due = words.filter((w) => w.next_review <= now);
    setQueue(due);
    setCurrentIdx(0);
    setShowAnswer(false);
    setReviewDone(0);
  }, [words]);

  if (queue.length === 0) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            没有需要复习的单词
          </h2>
          <p className="text-gray-500 mb-6">所有单词都已复习完毕!</p>
          <button
            onClick={onFinish}
            className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  if (currentIdx >= queue.length) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            复习完成!
          </h2>
          <p className="text-gray-500 mb-6">
            本次复习了 {reviewDone} 个单词
          </p>
          <button
            onClick={onFinish}
            className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const currentWord = queue[currentIdx];

  const handleRate = async (quality: number) => {
    if (rating) return;
    setRating(true);
    try {
      await onReview(currentWord.id, quality);
      setReviewDone((d) => d + 1);
      setCurrentIdx((i) => i + 1);
      setShowAnswer(false);
    } finally {
      setRating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <button
          onClick={onFinish}
          className="text-gray-500 hover:text-gray-700 font-medium"
        >
          ✕ 退出
        </button>
        <span className="text-sm text-gray-500">
          {currentIdx + 1} / {queue.length}
        </span>
        <span className="text-sm text-emerald-600 font-medium">
          已完成 {reviewDone}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / queue.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {/* Word */}
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {currentWord.word}
          </h1>
          <p className="text-lg text-gray-400 mb-8">{currentWord.phonetic}</p>

          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl text-lg font-medium hover:bg-gray-200 transition"
            >
              点击查看答案
            </button>
          ) : (
            <div className="space-y-6">
              {/* Meaning */}
              <div className="bg-gray-50 rounded-2xl p-6">
                <p className="text-2xl font-semibold text-gray-800">
                  {currentWord.meaning}
                </p>
                {currentWord.example && (
                  <p className="text-gray-500 mt-3 text-sm">
                    {currentWord.example}
                  </p>
                )}
              </div>

              {/* Interval info */}
              <p className="text-xs text-gray-400">
                当前间隔: {fmtInterval(currentWord.interval)} | 重复次数:{" "}
                {currentWord.repetitions}
              </p>

              {/* Rating buttons */}
              <div className="grid grid-cols-4 gap-2">
                {RATING_BUTTONS.map((btn) => (
                  <button
                    key={btn.quality}
                    onClick={() => handleRate(btn.quality)}
                    disabled={rating}
                    className={`${btn.color} text-white rounded-xl py-3 font-medium transition disabled:opacity-50`}
                  >
                    <div className="text-sm">{btn.label}</div>
                    {btn.sub && (
                      <div className="text-xs opacity-75">{btn.sub}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Memorize Mode: book-based multiple choice with spaced repetition ── */
function MemorizeMode({
  subjectName,
  books,
  words,
  onFinish,
  onReview,
}: {
  subjectName: string;
  books: WordBook[];
  words: Word[];
  onFinish: () => void;
  onReview: (wordId: string, quality: number) => Promise<void>;
}) {
  const [activeBook, setActiveBook] = useState<WordBook | null>(null);
  const [questions, setQuestions] = useState<ChoiceQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ChoiceAnswer[]>([]);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [usingEarlyPractice, setUsingEarlyPractice] = useState(false);
  const [autoNextOnCorrect, setAutoNextOnCorrect] = useState(false);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoNextTimer = useCallback(() => {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
  }, []);

  const goToNextQuestion = useCallback(() => {
    clearAutoNextTimer();
    setCurrentIdx((idx) => idx + 1);
    setSelected(null);
    setSaveError("");
  }, [clearAutoNextTimer]);

  const toggleAutoNextOnCorrect = (nextValue: boolean) => {
    setAutoNextOnCorrect(nextValue);
    if (!nextValue) clearAutoNextTimer();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "study-plan-vocab-auto-next-on-correct",
        nextValue ? "1" : "0"
      );
    }
  };

  const getBookWords = (book: WordBook) => {
    const unitIds = new Set(book.units.map((unit) => unit.id));
    return words.filter((word) => word.unit_id && unitIds.has(word.unit_id));
  };

  const bookStats = books.map((book) => {
    const bookWords = getBookWords(book);
    const dueWords = bookWords.filter(isWordDue);
    const masteredWords = bookWords.filter((word) => word.mastered === 1);
    return { book, words: bookWords, dueWords, masteredWords };
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAutoNextOnCorrect(
        window.localStorage.getItem("study-plan-vocab-auto-next-on-correct") === "1"
      );
    }

    return () => {
      clearAutoNextTimer();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearAutoNextTimer]);

  const playWord = (word: Word) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    stopOtherCardAudio();

    if (playingWordId === word.id) {
      setPlayingWordId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(word.word);
    const voice = getEnglishVoice();
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    if (voice) utterance.voice = voice;
    utterance.onend = () => setPlayingWordId((current) => (current === word.id ? null : current));
    utterance.onerror = () => setPlayingWordId((current) => (current === word.id ? null : current));
    setPlayingWordId(word.id);
    synth.speak(utterance);
  };

  const startBook = (book: WordBook) => {
    clearAutoNextTimer();
    const stat = bookStats.find((item) => item.book.groupName === book.groupName);
    const bookWords = stat?.words ?? [];
    const dueWords = stat?.dueWords ?? [];
    const sourceWords = dueWords.length > 0 ? dueWords : bookWords;
    const nextQuestions = buildChoiceQuestions(sourceWords, bookWords);

    setActiveBook(book);
    setQuestions(nextQuestions);
    setCurrentIdx(0);
    setSelected(null);
    setAnswers([]);
    setSaveError("");
    setUsingEarlyPractice(dueWords.length === 0);
  };

  const backToHub = () => {
    clearAutoNextTimer();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setActiveBook(null);
    setQuestions([]);
    setCurrentIdx(0);
    setSelected(null);
    setAnswers([]);
    setSaveError("");
    setPlayingWordId(null);
    setUsingEarlyPractice(false);
  };

  const restartBook = () => {
    if (activeBook) startBook(activeBook);
  };

  if (!activeBook) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
        <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onFinish}
              className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-white hover:text-slate-900"
            >
              ← 返回单词学习
            </button>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
              艾宾浩斯选择题
            </span>
          </div>

          <section className="mt-8 rounded-[32px] border border-emerald-100 bg-white p-7 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold text-emerald-600">{subjectName}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              背单词
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-500">
              选择一本词书开始答题。系统优先抽取今天到期的单词，答对会延长下次复习时间，答错会重新进入近期复习。
            </p>
          </section>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {bookStats.map(({ book, words: bookWords, dueWords, masteredWords }, index) => {
              const available = bookWords.filter((word) => cleanMeaning(word.meaning)).length;
              return (
                <button
                  key={book.groupName}
                  onClick={() => startBook(book)}
                  disabled={available < 2}
                  className="group rounded-[28px] border border-stone-200 bg-white p-6 text-left shadow-[0_14px_45px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_20px_60px_rgba(16,185,129,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
                      {index + 1}
                    </div>
                    <span className="rounded-full bg-stone-50 px-3 py-1 text-xs font-medium text-stone-500">
                      {dueWords.length} 待复习
                    </span>
                  </div>
                  <h2 className="mt-5 text-xl font-semibold text-slate-950">
                    {book.groupName}
                  </h2>
                  <p className="mt-2 text-sm text-stone-500">
                    共 {bookWords.length} 个单词，已掌握 {masteredWords.length} 个。
                  </p>
                  <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4">
                    <span className="text-sm font-medium text-emerald-700">
                      开始选择题
                    </span>
                    <span className="text-lg text-stone-300 transition group-hover:translate-x-1 group-hover:text-emerald-500">
                      →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-md rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h2 className="text-2xl font-semibold text-slate-900">这本词书暂时不能出题</h2>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            至少需要 2 个带中文释义的单词，才能生成选择题。
          </p>
          <button
            onClick={backToHub}
            className="mt-6 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            返回词书选择
          </button>
        </div>
      </div>
    );
  }

  if (currentIdx >= questions.length) {
    const correctCount = answers.filter((answer) => answer.correct).length;
    const wrongAnswers = answers.filter((answer) => !answer.correct);

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
        <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={backToHub}
              className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-white hover:text-slate-900"
            >
              ← 返回词书选择
            </button>
            <button
              onClick={restartBook}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              再练一轮
            </button>
          </div>

          <section className="mt-8 rounded-[32px] border border-stone-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-medium text-emerald-600">{activeBook.groupName}</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              本轮答对 {correctCount} / {questions.length} 题
            </h1>
            <p className="mt-3 text-sm text-stone-500">
              本轮结果已写入艾宾浩斯复习计划，系统会根据答题情况安排下一次复习。
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${(correctCount / questions.length) * 100}%` }}
              />
            </div>

            {wrongAnswers.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-slate-900">错题回看</h2>
                <div className="mt-4 space-y-3">
                  {wrongAnswers.map((item) => (
                    <div
                      key={item.word.id}
                      className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-lg font-semibold text-slate-950">
                          {item.word.word}
                        </span>
                        {item.word.phonetic && (
                          <span className="text-sm text-stone-400">{item.word.phonetic}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-stone-500">你选：{item.selected}</p>
                      <p className="mt-1 text-sm font-medium text-emerald-700">
                        正确：{item.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  const current = questions[currentIdx];
  const progress = ((currentIdx + 1) / questions.length) * 100;
  const isAnswered = selected !== null;

  const chooseOption = (option: string) => {
    if (selected) return;
    clearAutoNextTimer();
    const correct = option === current.answer;
    setSelected(option);
    setSaveError("");
    setAnswers((items) => [
      ...items,
      {
        word: current.word,
        selected: option,
        answer: current.answer,
        correct,
      },
    ]);

    setPendingSaves((count) => count + 1);
    onReview(current.word.id, correct ? 2 : 0)
      .catch(() => {
        setSaveError("有一题复习记录保存失败，可继续答题，稍后刷新再试。");
      })
      .finally(() => {
        setPendingSaves((count) => Math.max(0, count - 1));
      });

    if (correct && autoNextOnCorrect) {
      autoNextTimerRef.current = setTimeout(() => {
        goToNextQuestion();
      }, 700);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbfaf7]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={backToHub}
            className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 transition hover:bg-white hover:text-slate-900"
          >
            ← 词书选择
          </button>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-200 transition hover:text-emerald-700 hover:ring-emerald-200">
              <input
                type="checkbox"
                checked={autoNextOnCorrect}
                onChange={(event) => toggleAutoNextOnCorrect(event.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-600"
              />
              答对自动下一题
            </label>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-500 ring-1 ring-stone-200">
              {currentIdx + 1} / {questions.length}
            </span>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <main className="flex flex-1 items-center justify-center py-8">
          <div className="w-full rounded-[34px] border border-stone-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-emerald-600">{activeBook.groupName}</p>
                <p className="mt-1 text-xs text-stone-400">
                  {usingEarlyPractice ? "今天无到期词，当前为提前练习" : "优先复习今天到期的单词"}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                艾宾浩斯记录中
              </span>
            </div>

            <div className="mt-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-stone-500">看英文，选中文意思</p>
                <h1 className="mt-4 text-5xl font-semibold tracking-tight text-slate-950">
                  {current.word.word}
                </h1>
                {current.word.phonetic && (
                  <p className="mt-3 text-lg text-stone-400">{current.word.phonetic}</p>
                )}
              </div>
              <button
                onClick={() => playWord(current.word)}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg transition ${
                  playingWordId === current.word.id
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
                title="播放读音"
              >
                ▶
              </button>
            </div>

            <div className="mt-8 grid gap-3">
              {current.options.map((option, index) => {
                const isCorrectOption = option === current.answer;
                const isSelectedOption = option === selected;
                const stateClass = !isAnswered
                  ? "border-stone-200 bg-white hover:border-emerald-300 hover:bg-emerald-50"
                  : isCorrectOption
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : isSelectedOption
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-stone-200 bg-stone-50 text-stone-400";

                return (
                  <button
                    key={`${option}-${index}`}
                    onClick={() => chooseOption(option)}
                    disabled={isAnswered}
                    className={`flex min-h-16 items-center gap-4 rounded-2xl border px-4 py-3 text-left text-base font-medium transition ${stateClass}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-stone-500 ring-1 ring-stone-200">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="leading-7">{option}</span>
                  </button>
                );
              })}
            </div>

            {isAnswered && (
              <div className="mt-6 rounded-2xl bg-stone-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p
                    className={`text-sm font-medium ${
                      selected === current.answer ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {selected === current.answer
                      ? "答对了，下一次复习会往后安排。"
                      : `答错了，正确答案是：${current.answer}`}
                  </p>
                  <button
                    onClick={goToNextQuestion}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    {currentIdx + 1 >= questions.length ? "查看结果" : "下一题"}
                  </button>
                </div>
                {pendingSaves > 0 && (
                  <p className="mt-3 text-xs font-medium text-stone-400">
                    复习记录后台保存中，不影响继续答题。
                  </p>
                )}
                {saveError && (
                  <p className="mt-3 text-xs font-medium text-rose-600">{saveError}</p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Add Word Form ── */
function AddWordForm({
  subjectId,
  units,
  onAdded,
}: {
  subjectId: string;
  units: Unit[];
  onAdded: () => void;
}) {
  const [word, setWord] = useState("");
  const [phonetic, setPhonetic] = useState("");
  const [meaning, setMeaning] = useState("");
  const [example, setExample] = useState("");
  const [unitId, setUnitId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [fetchingPhonetic, setFetchingPhonetic] = useState(false);

  const fetchPhonetic = async () => {
    if (!word.trim()) return;
    setFetchingPhonetic(true);
    try {
      const res = await fetch(
        `/api/words/phonetic?word=${encodeURIComponent(word.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.phonetic) setPhonetic(data.phonetic);
      }
    } finally {
      setFetchingPhonetic(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !meaning.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subjectId,
          unit_id: unitId || null,
          word: word.trim(),
          phonetic: phonetic.trim(),
          meaning: meaning.trim(),
          example: example.trim(),
        }),
      });
      if (res.ok) {
        setWord("");
        setPhonetic("");
        setMeaning("");
        setExample("");
        setUnitId("");
        onAdded();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
    >
      <h3 className="font-bold text-gray-900 text-lg">添加单词</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">单词 *</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onBlur={fetchPhonetic}
              placeholder="apple"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            音标{" "}
            {fetchingPhonetic && (
              <span className="text-emerald-500 text-xs">获取中...</span>
            )}
          </label>
          <input
            type="text"
            value={phonetic}
            onChange={(e) => setPhonetic(e.target.value)}
            placeholder="/ˈæp.əl/"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">中文释义 *</label>
          <input
            type="text"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="苹果"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">例句</label>
          <input
            type="text"
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="I eat an apple."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
          />
        </div>
      </div>

      {units.length > 0 && (
        <div>
          <label className="block text-sm text-gray-600 mb-1">所属句子 (可选)</label>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm bg-white"
          >
            <option value="">不选择</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.group_name ? `${u.group_name} - ` : ""}{u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !word.trim() || !meaning.trim()}
        className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition disabled:opacity-50"
      >
        {saving ? "保存中..." : "添加"}
      </button>
    </form>
  );
}

/* ── Import Section ── */
function ImportSection({
  subjectId,
  onImported,
}: {
  subjectId: string;
  onImported: () => void;
}) {
  const [show, setShow] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<
    { word: string; meaning: string }[] | null
  >(null);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setParsing(true);
    setPreview(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subject_id", subjectId);
    formData.append("mode", "preview");

    try {
      const res = await fetch("/api/words/import", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data.words ?? []);
      }
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("subject_id", subjectId);
      formData.append("mode", "import");
      formData.append("words", JSON.stringify(preview));

      const res = await fetch("/api/words/import", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setPreview(null);
        setFilename("");
        setShow(false);
        if (fileRef.current) fileRef.current.value = "";
        onImported();
      }
    } finally {
      setImporting(false);
    }
  };

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50"
      >
        📥 导入单词
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 text-lg">导入单词</h3>
        <button
          onClick={() => {
            setShow(false);
            setPreview(null);
            setFilename("");
          }}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-gray-500">
        支持 CSV / TXT 文件，每行格式: 单词, 释义 (或用 Tab 分隔)
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.tsv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium hover:file:bg-emerald-100 file:cursor-pointer"
      />

      {parsing && (
        <p className="text-sm text-emerald-600">解析中...</p>
      )}

      {preview && (
        <div>
          <p className="text-sm text-gray-600 mb-2">
            预览: 共 {preview.length} 个单词 ({filename})
          </p>
          <div className="max-h-60 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-600">#</th>
                  <th className="text-left px-3 py-2 text-gray-600">单词</th>
                  <th className="text-left px-3 py-2 text-gray-600">释义</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((w, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{w.word}</td>
                    <td className="px-3 py-1.5 text-gray-600">{w.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={doImport}
              disabled={importing}
              className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition disabled:opacity-50"
            >
              {importing ? "导入中..." : `确认导入 ${preview.length} 个单词`}
            </button>
            <button
              onClick={() => {
                setPreview(null);
                setFilename("");
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════ */
export default function VocabPage() {
  const params = useParams();
  const id = params.id as string;

  const [subject, setSubject] = useState<SubjectWithUnits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewWords, setReviewWords] = useState<Word[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [memorizing, setMemorizing] = useState(false);
  const [memoryWords, setMemoryWords] = useState<Word[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/subjects/${id}?summary=1&include_units=1`);
      if (!res.ok) {
        setError("加载失败");
        return;
      }
      const data = await res.json();
      setSubject(data as SubjectWithUnits);
      setDueCount(data.dueCount ?? 0);
      setMasteredCount(data.masteredCount ?? 0);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Group units by group_name
  const wordBooks: WordBook[] = [];
  if (subject) {
    const groups = new Map<
      string,
      (Unit & { word_count?: number })[]
    >();
    for (const unit of subject.units ?? []) {
      const key = unit.group_name || "未分组";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(unit);
    }
    for (const [groupName, units] of groups) {
      const totalWords = units.reduce(
        (sum, u) => sum + (u.word_count ?? 0),
        0
      );
      wordBooks.push({ groupName, units, totalWords });
    }
  }

  // Total word count from API response
  const totalWordCount = (subject as { totalWords?: number } | null)?.totalWords ?? 0;
  const totalSentenceCount = subject?.units?.length ?? 0;
  const totalBooks = wordBooks.length;

  const startReview = async () => {
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/words/review-queue?subject_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setReviewWords(data.words ?? []);
        setReviewing(true);
      }
    } finally {
      setReviewLoading(false);
    }
  };

  const startMemorize = async () => {
    setMemoryLoading(true);
    setMemoryError("");
    try {
      const res = await fetch(`/api/words?subject_id=${id}`);
      if (!res.ok) {
        setMemoryError("背单词加载失败，请稍后再试。");
        return;
      }
      const data = await res.json();
      setMemoryWords((data.words ?? []) as Word[]);
      setMemorizing(true);
    } catch {
      setMemoryError("网络错误，背单词暂时打不开。");
    } finally {
      setMemoryLoading(false);
    }
  };

  const handleReview = async (wordId: string, quality: number) => {
    const res = await fetch("/api/words/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_id: wordId, quality }),
    });
    if (!res.ok) throw new Error("review failed");
  };

  const handleDeleteWord = () => {
    // Words are managed inside each SentenceCard via lazy loading.
    // Reload to refresh counts.
    loadData();
  };

  // Review mode overlay
  if (reviewing) {
    return (
      <ReviewMode
        words={reviewWords}
        onFinish={() => {
          setReviewing(false);
          setReviewWords([]);
          loadData();
        }}
        onReview={handleReview}
      />
    );
  }

  if (memorizing && subject) {
    return (
      <MemorizeMode
        subjectName={subject.name || "英语"}
        books={wordBooks}
        words={memoryWords}
        onFinish={() => {
          setMemorizing(false);
          setMemoryWords([]);
          loadData();
        }}
        onReview={handleReview}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "未找到科目"}</p>
          <Link
            href={`/subjects/${id}`}
            className="text-emerald-600 hover:underline"
          >
            返回
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href={`/subjects/${id}`}
            className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800"
          >
            ← 返回英语主页
          </Link>
          <div className="hidden items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-stone-200 sm:flex">
            <span className="text-base">🔤</span>
            <span>单词学习</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[32px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-600">
                  English Vocabulary Workspace
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  {(subject.name || "英语")}单词学习
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600 sm:text-base">
                  按词书展开句子和单词，整句音频、逐词朗读和遮挡练习放在同一页，
                  减少来回跳转。
                </p>
              </div>

              <div className="rounded-[24px] border border-stone-200 bg-white px-4 py-4 text-sm text-emerald-800">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  词书数量
                </div>
                <div className="mt-2 text-3xl font-semibold">{totalBooks}</div>
                <p className="mt-1 text-xs leading-5 text-emerald-700/80">
                  当前按词书分组展示，适合逐本推进。
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={startReview}
                disabled={reviewLoading}
                className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {reviewLoading ? "加载中..." : "📝 开始复习"}
                {!reviewLoading && dueCount > 0 && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                    {dueCount} 待复习
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowAddForm((v) => !v)}
                className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  showAddForm
                    ? "bg-stone-200 text-stone-700"
                    : "bg-white text-stone-700 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50"
                }`}
              >
                {showAddForm ? "收起添加单词" : "＋ 添加单词"}
              </button>

              {dueCount === 0 && (
                <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-500">
                  当前没有待复习单词
                </span>
              )}

            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                单词总数
              </p>
              <p className="mt-3 text-3xl font-semibold text-emerald-600">
                {totalWordCount}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                句子数量
              </p>
              <p className="mt-3 text-3xl font-semibold text-sky-600">
                {totalSentenceCount}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                待复习
              </p>
              <p className="mt-3 text-3xl font-semibold text-orange-500">
                {dueCount}
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                已掌握
              </p>
              <p className="mt-3 text-3xl font-semibold text-blue-500">
                {masteredCount}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <button
            onClick={startMemorize}
            disabled={memoryLoading || wordBooks.length === 0 || totalWordCount === 0}
            className="group flex min-h-[64px] items-center gap-3 rounded-3xl border border-emerald-100 bg-emerald-50/70 px-5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:shadow-[0_16px_45px_rgba(16,185,129,0.14)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">
              🧠
            </span>
            <span>
              <span className="block text-base font-semibold text-emerald-900">
                {memoryLoading ? "加载背单词..." : "背单词"}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-emerald-700/80">
                三本词书选择题 · 艾宾浩斯复习
              </span>
            </span>
          </button>
          <ImportSection subjectId={id} onImported={loadData} />
        </div>

        {memoryError && (
          <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {memoryError}
          </div>
        )}

        {showAddForm && (
          <div className="mt-6">
            <AddWordForm
              subjectId={id}
              units={subject.units ?? []}
              onAdded={() => {
                loadData();
                setShowAddForm(false);
              }}
            />
          </div>
        )}

        {wordBooks.length > 0 ? (
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">词书列表</h2>
                <p className="mt-1 text-sm text-stone-500">
                  每本词书按句子展开，适合边听边记。
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                共 {wordBooks.length} 本
              </span>
            </div>

            <div className="space-y-5">
              {wordBooks.map((book) => (
                <WordBookCard
                  key={book.groupName}
                  book={book}
                  onDeleteWord={handleDeleteWord}
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="mt-8 rounded-[32px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-lg font-medium text-stone-500">暂无单词</p>
            <p className="mt-2 text-sm text-stone-400">
              点击上方“添加单词”或“导入单词”开始学习。
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_12px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-700 active:scale-90 z-20"
        title="回到顶部"
      >
        ↑
      </button>
    </div>
  );
}
