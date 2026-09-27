"use client";

import { useEffect, useMemo, useState } from "react";
import finalReviewAnswers from "@/data/english-final-review-answers.json";

export type ReviewSection = "知识整理" | "过关+语法" | "专项练习" | "其他资料";

type ReviewDocumentSection = {
  title: string;
  lines: string[];
};

export type ReviewDocument = {
  id: string;
  title: string;
  sourceFile: string;
  category: ReviewSection;
  pageCount: number;
  lineCount: number;
  sectionCount: number;
  sections: ReviewDocumentSection[];
};

type FinalReviewViewerProps = {
  documents: ReviewDocument[];
  sectionOrder: readonly ReviewSection[];
};

type ParsedEntry = {
  marker: string;
  raw: string;
  english: string;
  chinese: string;
  phonetic: string;
};

type RenderBlock =
  | { type: "entry"; entry: ParsedEntry }
  | { type: "question"; question: ParsedEntry; options: ParsedEntry[] };

type DisplayTitle = {
  unitLabel: string;
  topic: string;
  detail: string;
  full: string;
};

type AnswerMap = Record<string, Record<string, string | string[]>>;

type FinalReviewAnswers = {
  choices: AnswerMap;
  fills: AnswerMap;
};

const ANSWERS = finalReviewAnswers as FinalReviewAnswers;

const UNIT_TOPICS: Record<number, string> = {
  1: "Cinderella",
  2: "How do you come to school?",
  3: "Asking the way",
  4: "Seeing the doctor",
  5: "Helping our parents",
  6: "In the kitchen",
  7: "Chinese festivals",
  8: "Birthdays",
};

const CORRECTED_PHONETICS: Record<string, string> = {
  along: "/əˈlɒŋ/",
  angry: "/ˈæŋɡri/",
  answer: "/ˈɑːnsə(r)/",
  anything: "/ˈeniθɪŋ/",
  april: "/ˈeɪprəl/",
  august: "/ˈɔːɡəst/",
  autumn: "/ˈɔːtəm/",
  backache: "/ˈbækeɪk/",
  basket: "/ˈbɑːskɪt/",
  because: "/bɪˈkɒz/",
  bedtime: "/ˈbedtaɪm/",
  before: "/bɪˈfɔː(r)/",
  bench: "/bentʃ/",
  bike: "/baɪk/",
  birthday: "/ˈbɜːθdeɪ/",
  bookshop: "/ˈbʊkʃɒp/",
  bread: "/bred/",
  bus: "/bʌs/",
  busy: "/ˈbɪzi/",
  by: "/baɪ/",
  call: "/kɔːl/",
  cannot: "/ˈkænɒt/",
  catch: "/kætʃ/",
  check: "/tʃek/",
  chicken: "/ˈtʃɪkɪn/",
  child: "/tʃaɪld/",
  children: "/ˈtʃɪldrən/",
  cinderella: "/ˌsɪndəˈrelə/",
  cinema: "/ˈsɪnəmə/",
  city: "/ˈsɪti/",
  clean: "/kliːn/",
  clothes: "/kləʊðz/",
  cold: "/kəʊld/",
  cook: "/kʊk/",
  crossing: "/ˈkrɒsɪŋ/",
  december: "/dɪˈsembə(r)/",
  dentist: "/ˈdentɪst/",
  drive: "/draɪv/",
  earache: "/ˈɪəreɪk/",
  fairy: "/ˈfeəri/",
  far: "/fɑː(r)/",
  favourite: "/ˈfeɪvərɪt/",
  feel: "/fiːl/",
  ferry: "/ˈferi/",
  festival: "/ˈfestɪvl/",
  fever: "/ˈfiːvə(r)/",
  fight: "/faɪt/",
  film: "/fɪlm/",
  fit: "/fɪt/",
  full: "/fʊl/",
  game: "/ɡeɪm/",
  garden: "/ˈɡɑːdn/",
  giraffe: "/dʒɪˈrɑːf/",
  grow: "/ɡrəʊ/",
  headache: "/ˈhedeɪk/",
  helicopter: "/ˈhelɪkɒptə(r)/",
  hero: "/ˈhɪərəʊ/",
  hospital: "/ˈhɒspɪtl/",
  how: "/haʊ/",
  ill: "/ɪl/",
  january: "/ˈdʒænjuəri/",
  july: "/dʒuˈlaɪ/",
  june: "/dʒuːn/",
  ladybird: "/ˈleɪdibɜːd/",
  lantern: "/ˈlæntən/",
  late: "/leɪt/",
  leaf: "/liːf/",
  let: "/let/",
  love: "/lʌv/",
  march: "/mɑːtʃ/",
  may: "/meɪ/",
  meat: "/miːt/",
  medicine: "/ˈmedɪsn/",
  metro: "/ˈmetrəʊ/",
  moon: "/muːn/",
  motorbike: "/ˈməʊtəbaɪk/",
  mountain: "/ˈmaʊntən/",
  mushroom: "/ˈmʌʃruːm/",
  near: "/nɪə/",
  neck: "/nek/",
  november: "/nəʊˈvembə(r)/",
  number: "/ˈnʌmbə(r)/",
  october: "/ɒkˈtəʊbə(r)/",
  old: "/əʊld/",
  over: "/ˈəʊvə(r)/",
  parent: "/ˈpeərənt/",
  password: "/ˈpɑːswɜːd/",
  pavement: "/ˈpeɪvmənt/",
  pest: "/pest/",
  pick: "/pɪk/",
  place: "/pleɪs/",
  plane: "/pleɪn/",
  play: "/pleɪ/",
  potato: "/pəˈteɪtəʊ/",
  prince: "/prɪns/",
  ready: "/ˈredi/",
  receive: "/rɪˈsiːv/",
  restroom: "/ˈrestruːm/",
  ride: "/raɪd/",
  road: "/rəʊd/",
  rocket: "/ˈrɒkɪt/",
  september: "/sepˈtembə(r)/",
  ship: "/ʃɪp/",
  shop: "/ʃɒp/",
  should: "/ʃʊd/",
  show: "/ʃəʊ/",
  smell: "/smel/",
  spot: "/spɒt/",
  spring: "/sprɪŋ/",
  start: "/stɑːt/",
  station: "/ˈsteɪʃn/",
  street: "/striːt/",
  summer: "/ˈsʌmə(r)/",
  sun: "/sʌn/",
  sunshine: "/ˈsʌnʃaɪn/",
  supermarket: "/ˈsuːpəmɑːkɪt/",
  sweet: "/swiːt/",
  take: "/teɪk/",
  taxi: "/ˈtæksi/",
  teeth: "/tiːθ/",
  temperature: "/ˈtemprətʃə(r)/",
  through: "/θruː/",
  together: "/təˈɡeðə(r)/",
  toilet: "/ˈtɔɪlət/",
  tomato: "/təˈmɑːtəʊ/",
  tooth: "/tuːθ/",
  toothache: "/ˈtuːθeɪk/",
  town: "/taʊn/",
  traffic: "/ˈtræfɪk/",
  train: "/treɪn/",
  travel: "/ˈtrævəl/",
  understand: "/ˌʌndəˈstænd/",
  vegetable: "/ˈvedʒtəbl/",
  wait: "/weɪt/",
  walk: "/wɔːk/",
  west: "/west/",
  wheel: "/wiːl/",
  when: "/wen/",
  why: "/waɪ/",
  win: "/wɪn/",
  winter: "/ˈwɪntə(r)/",
  yeah: "/jeə/",
  young: "/jʌŋ/",
  yummy: "/ˈjʌmi/",
  zoo: "/zuː/",
};

const CJK_PATTERN = /[\u3400-\u9fff]/;
const ENGLISH_PATTERN = /[A-Za-z]/;
const BLANK_PATTERN = /_{3,}/g;
const BLANK_TEST_PATTERN = /_{3,}/;
const MONTH_PAIRS = [
  "一月 January",
  "二月 February",
  "三月 March",
  "四月 April",
  "五月 May",
  "六月 June",
  "七月 July",
  "八月 August",
  "九月 September",
  "十月 October",
  "十一月 November",
  "十二月 December",
];

const PACKED_ENGLISH_WORDS = [
  "a",
  "about",
  "after",
  "afternoon",
  "again",
  "all",
  "along",
  "always",
  "am",
  "an",
  "and",
  "any",
  "apple",
  "apples",
  "are",
  "around",
  "ask",
  "asks",
  "at",
  "back",
  "bad",
  "bar",
  "basket",
  "bathroom",
  "be",
  "beautiful",
  "because",
  "bed",
  "bedroom",
  "before",
  "behind",
  "bench",
  "beside",
  "between",
  "big",
  "bike",
  "birds",
  "blackboard",
  "blow",
  "blowing",
  "bookshop",
  "boy",
  "boys",
  "bread",
  "breakfast",
  "brother",
  "brush",
  "bus",
  "busy",
  "buy",
  "buys",
  "by",
  "cake",
  "cakes",
  "call",
  "can",
  "car",
  "carry",
  "children",
  "cinema",
  "cinemas",
  "city",
  "classroom",
  "clean",
  "cleans",
  "cleaning",
  "clothes",
  "cold",
  "come",
  "comes",
  "coming",
  "computer",
  "cook",
  "cooking",
  "cooks",
  "crossing",
  "dance",
  "dancing",
  "day",
  "dentist",
  "did",
  "different",
  "dinner",
  "do",
  "doctor",
  "does",
  "doing",
  "door",
  "draw",
  "drawing",
  "drink",
  "drinking",
  "drive",
  "driver",
  "drives",
  "eat",
  "eating",
  "eats",
  "evening",
  "every",
  "exercise",
  "family",
  "far",
  "father",
  "favourite",
  "feel",
  "feels",
  "festival",
  "festivals",
  "fifth",
  "find",
  "first",
  "floor",
  "flower",
  "flowers",
  "fly",
  "for",
  "fourth",
  "friend",
  "friends",
  "fridge",
  "from",
  "front",
  "fruit",
  "game",
  "games",
  "garden",
  "get",
  "gets",
  "getting",
  "girl",
  "girls",
  "give",
  "gives",
  "go",
  "goes",
  "going",
  "grandfather",
  "grandmother",
  "grapes",
  "great",
  "ground",
  "grow",
  "growing",
  "had",
  "hamburger",
  "has",
  "have",
  "having",
  "he",
  "headache",
  "help",
  "helping",
  "helps",
  "her",
  "here",
  "him",
  "his",
  "home",
  "homework",
  "hospital",
  "hot",
  "house",
  "how",
  "i",
  "ill",
  "important",
  "in",
  "interesting",
  "internet",
  "is",
  "it",
  "jiaozi",
  "juice",
  "kettle",
  "kitchen",
  "ladybird",
  "ladybirds",
  "lake",
  "lesson",
  "library",
  "light",
  "lights",
  "like",
  "likes",
  "listen",
  "live",
  "lives",
  "living",
  "look",
  "looks",
  "lot",
  "many",
  "make",
  "makes",
  "making",
  "me",
  "meat",
  "medicine",
  "metro",
  "milk",
  "moon",
  "morning",
  "mother",
  "mothers",
  "mountains",
  "mushroom",
  "mushrooms",
  "mouse",
  "my",
  "near",
  "new",
  "nice",
  "night",
  "no",
  "noon",
  "not",
  "now",
  "of",
  "off",
  "often",
  "old",
  "on",
  "one",
  "orange",
  "our",
  "out",
  "parents",
  "park",
  "party",
  "pay",
  "people",
  "pest",
  "pests",
  "phone",
  "pictures",
  "plane",
  "play",
  "playing",
  "playground",
  "please",
  "policeman",
  "potatoes",
  "present",
  "presents",
  "public",
  "put",
  "puts",
  "question",
  "questions",
  "reading",
  "rest",
  "restroom",
  "rice",
  "ride",
  "rides",
  "right",
  "river",
  "road",
  "room",
  "run",
  "running",
  "sandwich",
  "school",
  "second",
  "see",
  "sees",
  "seven",
  "she",
  "ship",
  "shoe",
  "shoes",
  "shop",
  "should",
  "show",
  "showing",
  "shows",
  "sing",
  "singing",
  "sit",
  "sits",
  "sleep",
  "sleeping",
  "smell",
  "snack",
  "so",
  "some",
  "sometimes",
  "street",
  "students",
  "story",
  "storybook",
  "storybooks",
  "sun",
  "sunday",
  "super",
  "sweets",
  "sweep",
  "sweeping",
  "table",
  "take",
  "takes",
  "talk",
  "talks",
  "taxi",
  "teeth",
  "tell",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "through",
  "timetable",
  "to",
  "today",
  "together",
  "tomato",
  "toothache",
  "town",
  "traffic",
  "train",
  "transport",
  "tree",
  "trees",
  "try",
  "under",
  "understand",
  "usually",
  "vegetables",
  "visit",
  "visits",
  "walk",
  "walks",
  "want",
  "wants",
  "warm",
  "wash",
  "washing",
  "watch",
  "watching",
  "water",
  "way",
  "we",
  "weekend",
  "weekends",
  "well",
  "what",
  "where",
  "wheel",
  "wheels",
  "who",
  "whose",
  "why",
  "will",
  "win",
  "window",
  "windows",
  "wind",
  "with",
  "word",
  "words",
  "work",
  "would",
  "year",
  "you",
  "your",
  "zoo",
  "also",
  "boat",
  "bookshops",
  "chair",
  "climbing",
  "cousin",
  "dog",
  "dragon",
  "eleven",
  "families",
  "fat",
  "film",
  "food",
  "foot",
  "her",
  "june",
  "lesson",
  "music",
  "ninth",
  "october",
  "panda",
  "pandas",
  "places",
  "small",
  "sundays",
  "teacher",
  "tenth",
  "thirty",
  "too",
  "toy",
  "very",
  "week",
];

const PACKED_ENGLISH_REPLACEMENTS = new Map<string, string>([
  ...PACKED_ENGLISH_WORDS.map((word) => [word, word] as [string, string]),
  ["alot", "a lot"],
  ["april", "April"],
  ["august", "August"],
  ["beijing", "Beijing"],
  ["ben", "Ben"],
  ["bobby", "Bobby"],
  ["brown", "Brown"],
  ["cinderella", "Cinderella"],
  ["christmas", "Christmas"],
  ["chinese", "Chinese"],
  ["citylibrary", "City Library"],
  ["dragonboat", "Dragon Boat"],
  ["double", "Double"],
  ["english", "English"],
  ["flower", "Flower"],
  ["flowerstown", "Flower Town"],
  ["halloween", "Halloween"],
  ["helen", "Helen"],
  ["hongkong", "Hong Kong"],
  ["i", "I"],
  ["jiefang", "Jiefang"],
  ["jim", "Jim"],
  ["june", "June"],
  ["kitty", "Kitty"],
  ["lantern", "Lantern"],
  ["lily", "Lily"],
  ["liutao", "Liu Tao"],
  ["midautumn", "Mid-Autumn"],
  ["mike", "Mike"],
  ["missli", "Miss Li"],
  ["moon", "Moon"],
  ["moonstreet", "Moon Street"],
  ["mother", "Mother"],
  ["nancy", "Nancy"],
  ["november", "November"],
  ["october", "October"],
  ["parkstreet", "Park Street"],
  ["people", "People"],
  ["polly", "Polly"],
  ["qingming", "Qingming"],
  ["sam", "Sam"],
  ["spring", "Spring"],
  ["sun", "Sun"],
  ["sunday", "Sunday"],
  ["sunstreet", "Sun Street"],
  ["sunshine", "Sunshine"],
  ["sunshinetown", "Sunshine Town"],
  ["su", "Su"],
  ["suhai", "Su Hai"],
  ["suyang", "Su Yang"],
  ["tina", "Tina"],
  ["tim", "Tim"],
  ["wangbing", "Wang Bing"],
  ["wangfang", "Wang Fang"],
  ["white", "White"],
  ["xinhua", "Xinhua"],
  ["yangling", "Yang Ling"],
  ["yangyun", "Yang Yun"],
  ["doubleninth", "Double Ninth"],
  ["dragonboat", "Dragon Boat"],
]);

const PACKED_ENGLISH_KEYS = [...PACKED_ENGLISH_REPLACEMENTS.keys()].sort(
  (a, b) => b.length - a.length
);
const PACKED_ENGLISH_MEMO = new Map<string, string[] | null>();

const GLUED_PHRASE_FIXES: Array<[RegExp, string]> = [
  [/\bJimwalks\b/g, "Jim walks"],
  [/\bSomemushrooms\b/g, "Some mushrooms"],
  [/\bsomemushrooms\b/gi, "some mushrooms"],
  [/\bthesequestions\b/gi, "these questions"],
  [/\bthesemushrooms\b/gi, "these mushrooms"],
  [/\bthesewords\b/gi, "these words"],
  [/\bCinderellaputs\b/g, "Cinderella puts"],
  [/\bCinderellahas\b/g, "Cinderella has"],
  [/\bCinderellahave\b/g, "Cinderella have"],
  [/\bIlikereading\b/g, "I like reading"],
  [/\bPutonthisEnglish\b/g, "Put on this English"],
  [/\bliveonMoonStreet\b/g, "live on Moon Street"],
  [/\bliveinSunshineTown\b/g, "live in Sunshine Town"],
  [/\bshowhisbiketo\b/g, "show his bike to"],
  [/\bshowSam\b/g, "show Sam"],
  [/\bhisbike\b/g, "his bike"],
  [/\bIliveonMoonStreet\b/g, "I live on Moon Street"],
  [/\bSuYanglivefar\b/g, "Su Yang live far"],
  [/\babiketoschool\b/g, "a bike to school"],
  [/\btoworkbytaxi\b/g, "to work by taxi"],
  [/\bIliveinSuzhou\b/g, "I live in Suzhou"],
  [/\bWheredoyoulive\b/g, "Where do you live"],
  [/\bHeisonMoonRoad\b/g, "He is on Moon Road"],
  [/\bWhereishe\b/g, "Where is he"],
  [/\bHegoestotheparkonSundays\b/g, "He goes to the park on Sundays"],
  [/\bWheredoeshegoonSundays\b/g, "Where does he go on Sundays"],
  [/\bWhatdoeshedoonSundays\b/g, "What does he do on Sundays"],
  [/\bSuHaiandSuYangcometoschoolbybus\b/g, "Su Hai and Su Yang come to school by bus"],
  [/\bHowdoSuHaiandSuYangcometoschool\b/g, "How do Su Hai and Su Yang come to school"],
  [/\bMyfathergoestoworkbycar\b/g, "My father goes to work by car"],
  [/\bHowdoesyourfathergotowork\b/g, "How does your father go to work"],
  [/\bHowistheweathertoday\b/g, "How is the weather today"],
  [/\bWhatistheweatherliketoday\b/g, "What is the weather like today"],
  [/\bHowmanybirdscanyousee\b/g, "How many birds can you see"],
  [/\bHowmuchwaterwouldyoulike\b/g, "How much water would you like"],
  [/\bHowlongdoesittakeyoutogotoschool\b/g, "How long does it take you to go to school"],
  [/\bIgotoschoolbycar\b/g, "I go to school by car"],
  [/\bItakeacartoschool\b/g, "I take a car to school"],
  [/\bMycousingoestotheparkonfoot\b/g, "My cousin goes to the park on foot"],
  [/\bMycousinwalkstothepark\b/g, "My cousin walks to the park"],
  [/\bMyauntgoestoworkbybike\b/g, "My aunt goes to work by bike"],
  [/\bMyauntridesabiketowork\b/g, "My aunt rides a bike to work"],
  [/\bthefirstfloor\b/gi, "the first floor"],
  [/\batthesnackbar\b/gi, "at the snack bar"],
  [/\binthefrontof\b/gi, "in the front of"],
  [/\btheGreatWall\b/g, "the Great Wall"],
  [/\bonJiefangStreet\b/g, "on Jiefang Street"],
  [/\binSunshineTown\b/g, "in Sunshine Town"],
  [/\bandwecanrideit\b/g, "and we can ride it"],
  [/\bIthasnowheels\b/g, "It has no wheels"],
  [/\banditgoonwater\b/g, "and it goes on water"],
  [/\bIfyoutakeittoschool\b/g, "If you take it to school"],
  [/\byoushouldpay\b/g, "you should pay"],
  [/\bItusuallygoesundertheground\b/g, "It usually goes under the ground"],
  [/\bItgoesveryfastandcancarrymanypeople\b/g, "It goes very fast and can carry many people"],
  [/\bIthasmanywheels\b/g, "It has many wheels"],
  [/\bandgoesontherail\b/g, "and goes on the rail"],
  [/\bnearourschool\b/gi, "near our school"],
  [/\bseetheblackboard\b/gi, "see the blackboard"],
  [/\btoschoolbycar\b/gi, "to school by car"],
  [/\binFlowerTown\b/g, "in Flower Town"],
  [/\bthebigcitysomeday\b/gi, "the big city someday"],
  [/\btoHongKongtowork\b/g, "to Hong Kong to work"],
  [/\btgotoschoolbecauseheisill\b/gi, "to go to school because he is ill"],
  [/\bLiuTaogotoschool\b/g, "Liu Tao go to school"],
  [/\bIgotoBeijingbyplane\b/g, "I go to Beijing by plane"],
  [/\bHelivesonParkStreet\b/g, "He lives on Park Street"],
  [/\bMyschoolisnearCityLibrary\b/g, "My school is near City Library"],
  [/\bLiuTaogoestotheparkbytaxi\b/g, "Liu Tao goes to the park by taxi"],
  [/\bXinhuaBookshop\b/g, "Xinhua Bookshop"],
  [/\btoCityCinema\b/g, "to City Cinema"],
  [/\btoWhiteStreet\b/g, "to White Street"],
  [/\btakethemetro\b/gi, "take the metro"],
  [/\btrafficlights\b/gi, "traffic lights"],
  [/\bshowmetheway\b/gi, "show me the way"],
  [/\bthereazoonear\b/gi, "there a zoo near"],
  [/\bSpringFestival\b/g, "Spring Festival"],
  [/\bontheInternet\b/gi, "on the Internet"],
  [/\btothelibrary\b/gi, "to the library"],
  [/\btoCityLibrary\b/g, "to City Library"],
  [/\bthepoliceman\b/gi, "the policeman"],
  [/\bbuysomestorybooks\b/gi, "buy some storybooks"],
  [/\btakesomemedicine\b/gi, "take some medicine"],
  [/\bsitonthebench\b/gi, "sit on the bench"],
  [/\bsomemedicineand\b/gi, "some medicine and"],
  [/\bwiththecomputer\b/gi, "with the computer"],
  [/\bintheplay\b/gi, "in the play"],
  [/can(?:\u2019|')tseetheblackboard/g, "can't see the blackboard"],
  [/\bMymothercomesbackbefore(?=\d)/g, "My mother comes back before "],
  [/\bLiuTaodoesn(?:\u2019|')to\b/g, "Liu Tao doesn't"],
  [/\bWhat(?:\u2019|')sthematterwith\b/g, "What's the matter with"],
  [/\bYangYundoesn(?:\u2019|')t\b/g, "Yang Yun doesn't"],
  [/\bI(?:\u2019|')mdoingmyhomeworknow\b/g, "I'm doing my homework now"],
  [/\bI(?:\u2019|')mnotdoinghomeworknow\b/g, "I'm not doing homework now"],
  [/\bI(?:\u2019|')mbusywithmyhomework\b/g, "I'm busy with my homework"],
  [/\bIt(?:\u2019|')stwothirtyintheafternoon\b/g, "It's two thirty in the afternoon"],
  [/\bWe(?:\u2019|')rehavingaMusiclesson\b/g, "We're having a Music lesson"],
  [/\bHe(?:\u2019|')seatingfruitinthelivingroom\b/g, "He's eating fruit in the living room"],
  [/\bBenthedogissleepingtoo\b/g, "Ben the dog is sleeping too"],
  [/\bdoonMother(?:\u2019|')s\b/g, "do on Mother's"],
  [/\bareThey(?:\u2019|')re\b/g, "are They're"],
  [/\bdoThey(?:\u2019|')re\b/g, "do They're"],
  [/\bsupperatsixo(?:\u2019|')clockintheevening\b/g, "supper at six o'clock in the evening"],
  [/\bseveno(?:\u2019|')clockinthemorning\b/g, "seven o'clock in the morning"],
  [/\bthenewclothes\b/gi, "the new clothes"],
  [/\bonMother(?:\u2019|')s(?=\s|$|[.,;:!?])/g, "on Mother's"],
  [/\bonMother(?:\u2019|')sDay\b/g, "on Mother's Day"],
  [/\bonChildren(?:\u2019|')sDay\b/g, "on Children's Day"],
  [/\battheDoubleNinthFestival\b/g, "at the Double Ninth Festival"],
  [/\battheSpringFestival\b/g, "at the Spring Festival"],
  [/\batChristmas\b/g, "at Christmas"],
  [/\bonSundaymorning\b/g, "on Sunday morning"],
  [/\bdo ingherhomework\b/gi, "doing her homework"],
  [/\blikedoingsth\b/gi, "like doing sth"],
  [/\bclockinthemorning\b/gi, "clock in the morning"],
  [/\bclockintheevening\b/gi, "clock in the evening"],
  [/\bwithatoymouse\b/gi, "with a toy mouse"],
  [/\bYoushouldn(?:\u2019|')t\b/g, "You shouldn't"],
  [/\b([a-z])([A-Z])/g, "$1 $2"],
  [/\b(Su)\s*(Hai|Yang)\b/g, "$1 $2"],
  [/\b(Yang)\s*(Ling)\b/g, "$1 $2"],
  [/\b(Jim|Tim|Mike|Helen|Bobby|Sam|Kitty|Mum|Dad|Polly|Susie|Su Hai|Su Yang|Yang Ling)(walks|goes|comes|likes|wants|has|is|does|lives|works|often|usually|sometimes|should|can)(?=[_\s.,?!]|$)/g, "$1 $2"],
  [/\b(Jim|Tim|Mike|Helen|Bobby|Sam|Kitty|Su Hai|Su Yang|Yang Ling)(and|with)(Jim|Tim|Mike|Helen|Bobby|Sam|Kitty|Su Hai|Su Yang|Yang Ling|his|her|their|my|your)(?=[_\s.,?!A-Z]|$)/g, "$1 $2 $3"],
  [/\b(The|the)(children|students|people|boys|girls|bus|bookshop|zoo|computer|play|doctor|cinema|hospital|kitchen|fridge|garden|bedroom|classroom|playground)(?=[_\s.,?!]|$)/g, "$1 $2"],
  [/\b(children|students|people|boys|girls|parents|friends)(are|do|can|come|go|like|want|need|have|walk|play|sing|draw)(?=[_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(I|You|We|They|He|She|It)(am|are|is|do|does|did|can|can't|can’t|go|get|feel|have|like|want|walk|walks|goes|comes|lives|often|usually|sometimes|always|should|would|will|eat|eats|play|plays|take|takes|look|looks)(?=[_\s.,?!]|$)/g, "$1 $2"],
  [/\b(I|You|We|They|He|She|It)(am|are|is)(doing|going|eating|washing|watching|playing|singing|drawing|cooking|looking|having)(?=[A-Za-z_\s.,?!]|$)/g, "$1 $2 $3"],
  [/\b(What|Where|How|Why|When)(am|are|is|do|does|did|can|should|would|will)(?=[A-Za-z_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(am|are|is|do|does|did|can|should|would|will)(you|he|she|it|they|we|I|Jim|Tim|Mike|Helen|Bobby|Sam|Kitty)(?=[A-Za-z_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(you|he|she|it|they|we|I)(doing|going|eating|washing|watching|playing|singing|drawing|cooking|looking|having|getting|coming|walking)(?=[_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(They|We|You|I|He|She|It)(’re|'re)(eating|watching|playing|doing|going|washing|singing|drawing|cooking|looking)(?=[A-Za-z_\s.,?!]|$)/g, "$1$2 $3"],
  [/\b(Look|Listen|Excuse)(me|the|at)(?=[A-Za-z_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(Look|Listen)!([A-Z])/g, "$1! $2"],
  [/(^|\s)[–—-]([A-Za-z])/g, "$1— $2"],
  [/([?.!,])([A-Z])/g, "$1 $2"],
  [/No\.(\d+)([A-Z])/g, "No. $1 $2"],
  [/\bthe(computer|play|doctor|bus|metro|cinema|hospital|bookshop|street|kitchen|fridge|table|floor|bed|dishes|car|flowers|wind|garden|grapes|pests|world|city|traffic|lights|toilet|restroom|way|moon|sun)\b/gi, "the $1"],
  [/(_+)(for|by|to|in|on|at|from|with)(us|me|him|her|them|you|your|his|their|our|my|the|a|an|some|many|school|home|work|bus|taxi|metro|train|plane|bike|ship|car)\b/gi, "$1 $2 $3"],
  [/\b(for|by|to|in|on|at|from|with)(us|me|him|her|them|you|your|his|their|our|my|the|a|an|some|many|school|home|work|bus|taxi|metro|train|plane|bike|ship|car)\b/gi, "$1 $2"],
  [/\bthe(computer|play|doctor|bus|metro|cinema|hospital|bookshop|street|kitchen|fridge|table|floor|bed|dishes|car|flowers|wind|garden|grapes|pests|world|city|traffic|lights|toilet|restroom|way|moon|sun|blackboard|policeman|Internet)\b/gi, "the $1"],
  [/\b(go|goes|going|come|comes|coming|walk|walks|take|takes|show|shows|showing|play|plays|playing|talk|talks|point|points)(to|with|about|at|for)\b/gi, "$1 $2"],
  [/\b(school|home|work)(by)(bus|metro|taxi|train|plane|bike|ship|car)\b/gi, "$1 $2 $3"],
  [/\b(eating|eat|eats|cook|cooks|cooking|buy|buys|buying|watch|watching|play|playing)(fruit|rice|jiaozi|sweets|meat|bread|cakes|medicine|TV|storybooks|games|football|basketball)(?=[_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(fruit|rice|jiaozi|sweets|meat|bread|cakes|medicine|homework|games|football|basketball)(in|on|at|to|from|with|for)(?=[A-Za-z_\s.,?!]|$)/gi, "$1 $2"],
  [/\b(living|dining|bath|rest)(room)\b/gi, "$1 $2"],
  [/\b(Moon|Sun|Park|City|Flower|White|Brown|Xinhua|Red Star|People’s)(Street|Road|Town|Station|Library|Bookshop|Hospital|Cinema|Park|Zoo)\b/g, "$1 $2"],
  [/\bso(she|he|they|we|you|I)\b/gi, "so $1"],
  [/\btoo manysweets\b/gi, "too many sweets"],
  [/\bmanysweets\b/gi, "many sweets"],
  [/\btomatosoup\b/gi, "tomato soup"],
  [/\bsome(vegetables|orange|apple|juice|pests|ladybirds|places|mushrooms|medicine|storybooks|flowers|games|water)\b/gi, "some $1"],
  [/\balot\b/gi, "a lot"],
  [/\bbigcitysomeday\b/gi, "big city someday"],
  [/\bstorybooks\b/gi, "storybooks"],
  [/\ba(great|bad|new|taxi|festival)\b/gi, "a $1"],
  [/\b(I)(can|can't|can’t|like|am|feel|have|would|get)\b/g, "$1 $2"],
  [/\bon Mother(?:\u2019|')s(?=\s|$|[.,;:!?])/g, "on Mother's"],
  [/\bon Mother(?:\u2019|')s Day\b/g, "on Mother's Day"],
  [/\bingherhomework\b/gi, "ing her homework"],
];

type PackedEnglishCandidate = {
  parts: string[];
  score: number;
};

function titleCaseFirstWord(word: string) {
  if (!word || /[A-Z]/.test(word[0]) || word === "I") return word;
  return `${word[0].toUpperCase()}${word.slice(1)}`;
}

function splitPackedEnglishLower(lower: string) {
  if (PACKED_ENGLISH_MEMO.has(lower)) {
    return PACKED_ENGLISH_MEMO.get(lower);
  }

  const best: Array<PackedEnglishCandidate | null> = Array.from(
    { length: lower.length + 1 },
    () => null
  );
  best[0] = { parts: [], score: 0 };

  for (let index = 0; index < lower.length; index += 1) {
    const current = best[index];
    if (!current) continue;

    for (const key of PACKED_ENGLISH_KEYS) {
      if (!lower.startsWith(key, index)) continue;

      const nextIndex = index + key.length;
      const replacement = PACKED_ENGLISH_REPLACEMENTS.get(key) ?? key;
      const next: PackedEnglishCandidate = {
        parts: [...current.parts, replacement],
        score: current.score + key.length * key.length,
      };
      const existing = best[nextIndex];
      if (
        !existing ||
        next.score > existing.score ||
        (next.score === existing.score && next.parts.length < existing.parts.length)
      ) {
        best[nextIndex] = next;
      }
    }
  }

  const result = best[lower.length]?.parts ?? null;
  PACKED_ENGLISH_MEMO.set(lower, result);
  return result;
}

function repairPackedEnglishToken(token: string): string {
  const normalized = token.replace(/’/g, "'");
  const possessive = normalized.match(/^([A-Za-z]+)'s([A-Za-z]+)$/);
  if (possessive) {
    const owner = repairPackedEnglishToken(possessive[1]);
    const rest = repairPackedEnglishToken(possessive[2]);
    if (owner !== possessive[1] || rest !== possessive[2]) {
      return `${owner}'s ${rest}`;
    }
  }

  const parts = splitPackedEnglishLower(normalized.toLowerCase());
  if (!parts || (parts.length === 1 && !parts[0].includes(" "))) return token;

  const [first, ...rest] = parts;
  return [
    /^[A-Z]/.test(token) ? titleCaseFirstWord(first) : first,
    ...rest,
  ].join(" ");
}

function repairPackedEnglishWords(text: string) {
  return text.replace(/\b[A-Za-z][A-Za-z'’]{7,}\b/g, (token) =>
    repairPackedEnglishToken(token)
  );
}

function hasCjk(text: string) {
  return CJK_PATTERN.test(text);
}

function hasEnglish(text: string) {
  return ENGLISH_PATTERN.test(text);
}

function normalizeTitleText(text: string) {
  return text
    .replace(/Class:.*$/i, "")
    .replace(/Name:.*$/i, "")
    .replace(/\bUnit\s*(\d+)\s*/gi, "Unit $1 ")
    .replace(/\bU\s*(\d+)\b/gi, "Unit $1")
    .replace(/Seeing\s+thedoctor/i, "Seeing the doctor")
    .replace(/Chinese\s*festivals/i, "Chinese festivals")
    .replace(/Helping\s*our\s*parents/i, "Helping our parents")
    .replace(/In\s*the\s*kitchen/i, "In the kitchen")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReviewTitle(document: ReviewDocument): DisplayTitle {
  const sourceText = `${document.title} ${document.sourceFile}`;
  const unitMatch = sourceText.match(/(?:unit|u)\s*(\d+)/i);
  const detail =
    document.category === "知识整理"
      ? "知识整理"
      : document.category === "过关+语法"
        ? "词汇 / 语法"
        : document.category;

  if (unitMatch) {
    const unitNumber = Number(unitMatch[1]);
    const topic = UNIT_TOPICS[unitNumber] ?? normalizeTitleText(document.title);
    return {
      unitLabel: `Unit ${unitNumber}`,
      topic,
      detail,
      full: `五下 · Unit ${unitNumber} · ${topic}`,
    };
  }

  const specialMatch = document.title.match(/专项练习([一二三四五六七八九十])（(.+?)）/);
  if (specialMatch) {
    return {
      unitLabel: `专项 ${specialMatch[1]}`,
      topic: specialMatch[2],
      detail: "专项练习",
      full: `五下 · 专项练习${specialMatch[1]} · ${specialMatch[2]}`,
    };
  }

  const title = normalizeTitleText(document.title);
  return {
    unitLabel: "",
    topic: title,
    detail,
    full: title,
  };
}

function getEntryCardClassName(line: string) {
  if (/^\(\s*\)\s*\d+/.test(line)) {
    return "border-amber-200 bg-amber-50/70";
  }
  if (/^\d+[.、．]/.test(line)) {
    return "border-emerald-100 bg-white";
  }
  if (/^[A-D][.．]/.test(line)) {
    return "border-sky-100 bg-sky-50/60";
  }
  if (/^[-•]/.test(line)) {
    return "border-stone-200 bg-white";
  }
  return "border-stone-200 bg-white";
}

function splitByMarkers(line: string, markerPattern: RegExp) {
  const matches = [...line.matchAll(markerPattern)];
  if (matches.length <= 1) return [line.trim()];

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? line.length;
      return line.slice(start, end).trim();
    })
    .filter(Boolean);
}

function splitMonthPairs(line: string) {
  const normalizedLine = line.replace(/\s+/g, " ");
  const hits = MONTH_PAIRS.filter((pair) =>
    normalizedLine.replace(/\s/g, "").includes(pair.replace(/\s/g, ""))
  );
  if (hits.length <= 1) return [line.trim()];

  return hits.map((pair) => {
    const [chinese, english] = pair.split(" ");
    return `${chinese} ${english}`;
  });
}

function splitInlineChoiceQuestionEntries(line: string) {
  const questionMatches = [
    ...line.matchAll(/[（(]\s*[）)]\s*\d+[.．、]\s*/g),
  ];
  if (questionMatches.length === 0) return [];

  return questionMatches.flatMap((match, index) => {
    const start = match.index ?? 0;
    const end = questionMatches[index + 1]?.index ?? line.length;
    const chunk = line.slice(start, end).trim();
    const markerMatch = chunk.match(/^([（(]\s*[）)]\s*\d+[.．、])\s*(.*)$/);
    if (!markerMatch) return [chunk];

    const [, marker, body] = markerMatch;
    const optionStart = body.search(/\bA[.．]/);
    if (optionStart < 0) return [chunk];

    const questionText = body.slice(0, optionStart).trim() || "选出正确答案";
    const optionText = body.slice(optionStart).trim();
    return [
      `${marker} ${questionText}`,
      ...splitByMarkers(optionText, /(?:^|\s)([A-D][.．]\s*)/g),
    ];
  });
}

function splitCompactPairs(line: string) {
  if (!hasCjk(line) || !hasEnglish(line)) return [line.trim()];

  const monthEntries = splitMonthPairs(line);
  if (monthEntries.length > 1) return monthEntries;

  const englishFirstMatches = [
    ...line.matchAll(
      /([A-Za-z][A-Za-z’'.-]*(?:\s+[A-Za-z][A-Za-z’'.-]*){0,3})\s*([\u3400-\u9fff][\u3400-\u9fff，、（）()…·-]*)(?=\s*[A-Za-z]|$)/g
    ),
  ];
  if (englishFirstMatches.length > 1) {
    return englishFirstMatches
      .map((match) => `${match[1].trim()} ${match[2].trim()}`)
      .filter(Boolean);
  }

  const chineseFirstMatches = [
    ...line.matchAll(
      /([\u3400-\u9fff][\u3400-\u9fff，、（）()…·-]*)\s*([A-Za-z][A-Za-z’'.-]*(?:\s+[A-Za-z][A-Za-z’'.-]*){0,3})(?=\s*[\u3400-\u9fff]|$)/g
    ),
  ];
  if (chineseFirstMatches.length > 1) {
    return chineseFirstMatches
      .map((match) => `${match[1].trim()} ${match[2].trim()}`)
      .filter(Boolean);
  }

  return [line.trim()];
}

function splitLineIntoEntries(line: string) {
  const inlineChoiceEntries = splitInlineChoiceQuestionEntries(line);
  if (inlineChoiceEntries.length > 0) return inlineChoiceEntries;

  const lineWithSpacedMarkers = line.replace(
    /([^\s\d])(\d+[.、．]\s*)/g,
    "$1 $2"
  );
  const optionEntries = splitByMarkers(
    lineWithSpacedMarkers,
    /(?:^|\s)([A-D][.．]\s*)/g
  );
  if (optionEntries.length > 1) return optionEntries;

  const numberedEntries = splitByMarkers(
    lineWithSpacedMarkers,
    /(?:^|\s)(\d+[.、．]\s*)/g
  );
  if (numberedEntries.length > 1) return numberedEntries;

  return splitCompactPairs(lineWithSpacedMarkers);
}

function getEntryParts(text: string) {
  const match = text.match(/^(\(?\s*\)?\s*\d+[.、．]|[A-D][.．])\s*(.*)$/);
  if (!match) return { marker: "·", body: text };
  return { marker: match[1].replace(/\s+/g, ""), body: match[2] || text };
}

function stripExtractedPhonetic(text: string) {
  return text
    .replace(/(\s*(?:\[[^\]]+\]|\/[^/\s]{1,16}\/))+\s*$/g, "")
    .trim();
}

function repairExtractedEnglishText(text: string) {
  return GLUED_PHRASE_FIXES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text
  );
}

function normalizeEnglish(text: string) {
  return repairPackedEnglishWords(
    repairExtractedEnglishText(text)
      .replace(/([A-Za-z])(_{2,})/g, "$1 $2")
      .replace(/(_{2,})([A-Za-z])/g, "$1 $2")
  )
    .replace(/([A-Za-z])(_{2,})/g, "$1 $2")
    .replace(/(_{2,})([A-Za-z])/g, "$1 $2")
    .replace(/[；]/g, " / ")
    .replace(/[，。：！？]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,;:])/g, "$1")
    .replace(/…/g, "...")
    .trim();
}

function normalizeChinese(text: string) {
  return text
    .replace(/^[,，:：\s]+/, "")
    .replace(/\s+/g, "")
    .trim();
}

function lookupPhonetic(english: string) {
  const cleaned = english
    .replace(/[()[\]{}]/g, " ")
    .replace(/[’]/g, "'")
    .replace(/\.\.\./g, "")
    .trim()
    .toLowerCase();
  const wordMatch = cleaned.match(/^([a-z]+(?:-[a-z]+)?)$/);
  if (wordMatch) return CORRECTED_PHONETICS[wordMatch[1]] ?? "";

  const leadingWord = cleaned.match(/^([a-z]+)\s*[（(]/);
  if (leadingWord) return CORRECTED_PHONETICS[leadingWord[1]] ?? "";

  return "";
}

function parseEntry(entry: string): ParsedEntry {
  const { marker, body } = getEntryParts(entry);
  const cleanBody = stripExtractedPhonetic(body);

  if (!hasEnglish(cleanBody)) {
    return { marker, raw: cleanBody, english: "", chinese: "", phonetic: "" };
  }

  if (!hasCjk(cleanBody)) {
    const english = normalizeEnglish(cleanBody);
    return {
      marker,
      raw: cleanBody,
      english,
      chinese: "",
      phonetic: lookupPhonetic(english),
    };
  }

  const englishWithChineseParen = cleanBody.match(
    /^([A-Za-z][A-Za-z’'.-]*)([（(][\u3400-\u9fff][^）)]*[）)])([\u3400-\u9fff].*)$/
  );
  if (englishWithChineseParen) {
    const english = normalizeEnglish(englishWithChineseParen[1]);
    const chinese = normalizeChinese(
      `${englishWithChineseParen[2]}${englishWithChineseParen[3]}`
    );
    return {
      marker,
      raw: cleanBody,
      english,
      chinese,
      phonetic: lookupPhonetic(english),
    };
  }

  const trailingChineseNote = cleanBody.match(
    /^(.+?)\s*[（(]([\u3400-\u9fff][^）)]*)[）)]$/
  );
  if (trailingChineseNote && hasEnglish(trailingChineseNote[1])) {
    const english = normalizeEnglish(trailingChineseNote[1]);
    const chinese = normalizeChinese(`（${trailingChineseNote[2]}）`);
    return {
      marker,
      raw: cleanBody,
      english,
      chinese,
      phonetic: lookupPhonetic(english),
    };
  }

  const firstCjkIndex = cleanBody.search(CJK_PATTERN);
  const firstEnglishIndex = cleanBody.search(ENGLISH_PATTERN);
  const englishFirst =
    firstEnglishIndex >= 0 && (firstCjkIndex < 0 || firstEnglishIndex < firstCjkIndex);
  const splitIndex = englishFirst ? firstCjkIndex : firstEnglishIndex;

  if (splitIndex < 0) {
    return { marker, raw: cleanBody, english: "", chinese: "", phonetic: "" };
  }

  const english = normalizeEnglish(
    englishFirst ? cleanBody.slice(0, splitIndex) : cleanBody.slice(splitIndex)
  );
  const chinese = normalizeChinese(
    englishFirst ? cleanBody.slice(splitIndex) : cleanBody.slice(0, splitIndex)
  );

  return {
    marker,
    raw: cleanBody,
    english,
    chinese,
    phonetic: lookupPhonetic(english),
  };
}

function matchesDocument(document: ReviewDocument, query: string) {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();
  return (
    document.title.toLowerCase().includes(lowerQuery) ||
    document.sourceFile.toLowerCase().includes(lowerQuery) ||
    document.sections.some(
      (section) =>
        section.title.toLowerCase().includes(lowerQuery) ||
        section.lines.some((line) => line.toLowerCase().includes(lowerQuery))
    )
  );
}

function isOptionEntry(entry: ParsedEntry) {
  return /^[A-D][.．]/.test(entry.marker);
}

function isQuestionEntry(entry: ParsedEntry) {
  return (
    /^\(\)\d+[.、．]/.test(entry.marker) ||
    (/^\d+[.、．]/.test(entry.marker) &&
      (BLANK_TEST_PATTERN.test(entry.english) || BLANK_TEST_PATTERN.test(entry.raw)))
  );
}

function cleanMarkerNumber(marker: string) {
  return marker.replace(/[()（）.、．\s]/g, "") || marker;
}

function cleanOptionMarker(marker: string) {
  return marker.replace(/[.．\s]/g, "") || marker;
}

function makeAnswerLookupKey(sectionIndex: number, marker: string) {
  const number = cleanMarkerNumber(marker);
  return number ? `${sectionIndex}:${number}` : "";
}

function normalizeAnswer(answer: string | string[] | undefined): string[] {
  if (!answer) return [];
  return Array.isArray(answer) ? answer : [answer];
}

function getChoiceAnswer(
  documentId: string,
  sectionIndex: number,
  marker: string
) {
  const key = makeAnswerLookupKey(sectionIndex, marker);
  if (!key) return "";
  const answer = ANSWERS.choices[documentId]?.[key];
  return typeof answer === "string" ? answer : answer?.[0] ?? "";
}

function getFillAnswer(
  documentId: string,
  sectionIndex: number,
  marker: string
) {
  const key = makeAnswerLookupKey(sectionIndex, marker);
  if (!key) return [];
  return normalizeAnswer(ANSWERS.fills[documentId]?.[key]);
}

function formatAnswer(answer: string[]) {
  return answer.join(" / ");
}

function buildRenderBlocks(entries: string[]): RenderBlock[] {
  const parsedEntries = entries.map(parseEntry);
  const blocks: RenderBlock[] = [];

  for (let index = 0; index < parsedEntries.length; index += 1) {
    const entry = parsedEntries[index];
    const nextEntry = parsedEntries[index + 1];

    if (
      !isOptionEntry(entry) &&
      nextEntry &&
      isOptionEntry(nextEntry) &&
      (isQuestionEntry(entry) || /^\d+[.、．]/.test(entry.marker))
    ) {
      const options: ParsedEntry[] = [];
      let optionIndex = index + 1;
      while (parsedEntries[optionIndex] && isOptionEntry(parsedEntries[optionIndex])) {
        options.push(parsedEntries[optionIndex]);
        optionIndex += 1;
      }

      blocks.push({ type: "question", question: entry, options });
      index = optionIndex - 1;
    } else {
      blocks.push({ type: "entry", entry });
    }
  }

  return blocks;
}

function TextWithBlanks({ text }: { text: string }) {
  const parts = text.split(BLANK_PATTERN);
  const blanks = text.match(BLANK_PATTERN) ?? [];

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {blanks[index] && (
            <span className="mx-1 inline-block h-6 min-w-24 translate-y-1 rounded-sm border-b-2 border-slate-800" />
          )}
        </span>
      ))}
    </>
  );
}

function TextWithFillInputs({
  text,
  values,
  onChange,
}: {
  text: string;
  values: string[];
  onChange: (index: number, value: string) => void;
}) {
  const parts = text.split(BLANK_PATTERN);
  const blanks = text.match(BLANK_PATTERN) ?? [];

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {blanks[index] && (
            <input
              value={values[index] ?? ""}
              onChange={(event) => onChange(index, event.target.value)}
              className="mx-1 inline-flex h-8 min-w-28 max-w-48 rounded-xl border border-emerald-200 bg-white px-3 text-center text-base font-bold text-emerald-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              style={{
                width: `${Math.max(7, Math.min(18, (values[index]?.length ?? 0) + 5))}ch`,
              }}
              aria-label={`填空 ${index + 1}`}
            />
          )}
        </span>
      ))}
    </>
  );
}

function AnswerReveal({
  answer,
  visible,
  selected,
  correct,
}: {
  answer: string[];
  visible: boolean;
  selected?: string;
  correct?: string;
}) {
  if (!visible || answer.length === 0) return null;
  const isChoice = Boolean(correct);
  const isCorrect = isChoice && selected === correct;
  const isWrong = isChoice && selected && selected !== correct;

  return (
    <div
      className={`mt-3 rounded-2xl border px-3 py-2 text-sm font-bold ${
        isWrong
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : isCorrect
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {isChoice && selected && (
        <span className="mr-2">
          {isCorrect ? "答对了" : `你选了 ${selected}`}
        </span>
      )}
      <span>参考答案：{formatAnswer(answer)}</span>
    </div>
  );
}

function getEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-gb")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

function speechText(text: string) {
  return text
    .replace(/_{2,}/g, " blank ")
    .replace(/\s*=\s*/g, ". ")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\.\.\./g, "")
    .trim();
}

export default function FinalReviewViewer({
  documents,
  sectionOrder,
}: FinalReviewViewerProps) {
  const [selectedId, setSelectedId] = useState(documents[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [playingSpeechKey, setPlayingSpeechKey] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [fillResponses, setFillResponses] = useState<Record<string, string[]>>({});
  const selectedDocument =
    documents.find((document) => document.id === selectedId) ?? documents[0];
  const filteredDocuments = useMemo(
    () => documents.filter((document) => matchesDocument(document, query.trim())),
    [documents, query]
  );
  const groupedDocuments = useMemo(
    () =>
      sectionOrder
        .map((section) => ({
          section,
          documents: filteredDocuments.filter(
            (document) => document.category === section
          ),
        }))
        .filter((group) => group.documents.length > 0),
    [filteredDocuments, sectionOrder]
  );
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(
    () => new Set()
  );
  const selectedDocumentQuestionCount = useMemo(
    () =>
      selectedDocument?.sections.reduce((sum, section, sectionIndex) => {
        const entries = section.lines.flatMap(splitLineIntoEntries);
        return (
          sum +
          buildRenderBlocks(entries).filter((block) => {
            if (block.type === "question") {
              return Boolean(
                getChoiceAnswer(
                  selectedDocument.id,
                  sectionIndex,
                  block.question.marker
                )
              );
            }
            return (
              BLANK_TEST_PATTERN.test(block.entry.raw) &&
              getFillAnswer(
                selectedDocument.id,
                sectionIndex,
                block.entry.marker
              ).length > 0
            );
          }).length
        );
      }, 0) ?? 0,
    [selectedDocument]
  );
  const selectedAnswerCount = useMemo(() => {
    if (!selectedDocument) return 0;
    const prefix = `${selectedDocument.id}:`;
    const choiceCount = Object.keys(selectedAnswers).filter((key) =>
      key.startsWith(prefix)
    ).length;
    const fillCount = Object.entries(fillResponses).filter(
      ([key, values]) =>
        key.startsWith(prefix) && values.some((value) => value.trim())
    ).length;
    return choiceCount + fillCount;
  }, [fillResponses, selectedAnswers, selectedDocument]);

  const toggleSection = (key: string) => {
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const playEnglishAudio = (text: string, key: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (playingSpeechKey === key) {
      synth.cancel();
      setPlayingSpeechKey(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(speechText(text));
    const voice = getEnglishVoice();
    utterance.lang = "en-GB";
    utterance.rate = 0.84;
    if (voice) utterance.voice = voice;
    utterance.onend = () =>
      setPlayingSpeechKey((current) => (current === key ? null : current));
    utterance.onerror = () =>
      setPlayingSpeechKey((current) => (current === key ? null : current));

    synth.cancel();
    setPlayingSpeechKey(key);
    synth.speak(utterance);
  };

  const chooseAnswer = (questionKey: string, optionMarker: string) => {
    setSelectedAnswers((current) => {
      const next = { ...current };
      if (next[questionKey] === optionMarker) {
        delete next[questionKey];
      } else {
        next[questionKey] = optionMarker;
      }
      return next;
    });
  };

  const changeFillResponse = (
    fillKey: string,
    blankIndex: number,
    value: string
  ) => {
    setFillResponses((current) => {
      const nextValues = [...(current[fillKey] ?? [])];
      nextValues[blankIndex] = value;
      return {
        ...current,
        [fillKey]: nextValues,
      };
    });
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!selectedDocument) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white px-5 py-12 text-center shadow-sm">
        <p className="text-sm font-semibold text-stone-500">暂无期末复习资料</p>
      </div>
    );
  }

  const selectedTitle = formatReviewTitle(selectedDocument);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
        <div className="border-b border-stone-100 px-4 py-3">
          <p className="text-sm font-bold text-stone-900">复习资料</p>
          <p className="mt-1 text-xs text-stone-400">{documents.length} 份内容</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索资料或内容"
            className="mt-3 w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition-colors focus:border-emerald-300 focus:bg-white"
          />
        </div>
        <div className="max-h-[42vh] overflow-y-auto p-3 lg:max-h-[calc(100vh-8rem)]">
          {groupedDocuments.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-stone-400">
              没有匹配内容
            </p>
          )}
          {groupedDocuments.map(({ section, documents: sectionDocuments }) => (
            <div key={section} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs font-black text-stone-500">{section}</p>
                <span className="text-xs text-stone-400">
                  {sectionDocuments.length}
                </span>
              </div>
              <div className="space-y-2">
                {sectionDocuments.map((document) => {
                  const selected = document.id === selectedDocument.id;
                  const displayTitle = formatReviewTitle(document);
                  return (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => setSelectedId(document.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-stone-100 bg-white hover:border-emerald-200 hover:bg-emerald-50"
                        }`}
                      >
                      <span className="flex min-w-0 items-center gap-2">
                        {displayTitle.unitLabel && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${
                              selected
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-stone-100 text-stone-500"
                            }`}
                          >
                            {displayTitle.unitLabel}
                          </span>
                        )}
                        <span
                          className={`min-w-0 truncate text-sm font-bold ${
                            selected ? "text-emerald-900" : "text-stone-800"
                          }`}
                        >
                          {displayTitle.topic}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-stone-400">
                        {displayTitle.detail} · {document.sectionCount} 小节 ·{" "}
                        {document.lineCount} 行
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <article className="min-w-0 rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-100 bg-emerald-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {selectedTitle.unitLabel && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
                  {selectedTitle.unitLabel}
                </span>
              )}
              <p className="min-w-0 break-words text-lg font-black text-stone-950">
                {selectedTitle.topic}
              </p>
            </div>
            <p className="mt-1 text-xs text-stone-400">
              {selectedTitle.full} · {selectedTitle.detail} ·{" "}
              {selectedDocument.sectionCount} 小节 ·{" "}
              {selectedDocument.lineCount} 行
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {selectedDocumentQuestionCount > 0 && (
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 shadow-sm">
                已选 {selectedAnswerCount}/{selectedDocumentQuestionCount} 题
              </span>
            )}
            <span className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-500">
              {selectedDocument.sourceFile}
            </span>
          </div>
        </div>
        <div className="space-y-4 p-4">
          {selectedDocument.sections.map((section, sectionIndex) => {
            const sectionKey = `${selectedDocument.id}-${sectionIndex}-${section.title}`;
            const expanded = !collapsedSectionKeys.has(sectionKey);
            const entries = section.lines.flatMap(splitLineIntoEntries);
            const blocks = buildRenderBlocks(entries);
            const questionCount = blocks.filter(
              (block) => block.type === "question"
            ).length;

            return (
              <section
                key={sectionKey}
                className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
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
                        <h2 className="break-words text-base font-semibold text-slate-900">
                          {section.title}
                        </h2>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {questionCount > 0
                            ? `${questionCount} 题 · ${entries.length} 条`
                            : `${entries.length} 条`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-stone-400">
                    {expanded ? "收起" : "展开"}
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-stone-100 bg-stone-50/60 p-4 sm:p-5">
                    <div className="space-y-4">
                      {blocks.map((block, blockIndex) => {
                        if (block.type === "question") {
                          const questionKey = `${selectedDocument.id}:${sectionIndex}:${blockIndex}:${block.question.marker}`;
                          const questionNumber = cleanMarkerNumber(
                            block.question.marker
                          );
                          const questionSpeechKey = `${questionKey}:question`;
                          const questionIsPlaying =
                            playingSpeechKey === questionSpeechKey;
                          const questionText =
                            block.question.english || block.question.raw;
                          const selectedAnswer =
                            selectedAnswers[questionKey] ?? "";
                          const correctAnswer = getChoiceAnswer(
                            selectedDocument.id,
                            sectionIndex,
                            block.question.marker
                          ).toUpperCase();
                          const answerVisible = Boolean(
                            selectedAnswer && correctAnswer
                          );

                          return (
                            <div
                              key={questionKey}
                              className="overflow-hidden rounded-[26px] border border-emerald-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
                            >
                              <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-4 py-4">
                                <div className="flex items-start gap-3">
                                  <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 px-2 text-sm font-black text-white shadow-sm shadow-emerald-200">
                                    Q{questionNumber}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-start gap-2">
                                      <p className="min-w-0 flex-1 break-words text-lg font-black leading-8 text-slate-950">
                                        <TextWithBlanks text={questionText} />
                                      </p>
                                      {block.question.english && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            playEnglishAudio(
                                              block.question.english,
                                              questionSpeechKey
                                            )
                                          }
                                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                            questionIsPlaying
                                              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                              : "bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
                                          }`}
                                          title={`播放 ${block.question.english}`}
                                        >
                                          {questionIsPlaying ? "■" : "▶"}
                                        </button>
                                      )}
                                    </div>
                                    {block.question.chinese && (
                                      <p className="mt-1 text-sm leading-6 text-stone-500">
                                        {block.question.chinese}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-2 bg-white p-3 sm:grid-cols-2">
                                {block.options.map((option) => {
                                  const optionMarker = cleanOptionMarker(option.marker);
                                  const selected = selectedAnswer === optionMarker;
                                  const isCorrectOption =
                                    answerVisible && optionMarker === correctAnswer;
                                  const isWrongSelected =
                                    answerVisible &&
                                    selected &&
                                    optionMarker !== correctAnswer;
                                  const optionSpeechKey = `${questionKey}:${optionMarker}`;
                                  const optionIsPlaying =
                                    playingSpeechKey === optionSpeechKey;
                                  const optionText = option.english || option.raw;

                                  return (
                                    <div
                                      key={`${questionKey}-${option.marker}`}
                                      className={`flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2.5 transition ${
                                        isWrongSelected
                                          ? "border-rose-300 bg-rose-50 text-rose-800 shadow-sm shadow-rose-100"
                                          : selected
                                          ? "border-emerald-400 bg-emerald-500 text-white shadow-sm shadow-emerald-100"
                                          : isCorrectOption
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm shadow-emerald-100"
                                          : "border-stone-200 bg-stone-50 text-slate-900 hover:border-emerald-200 hover:bg-emerald-50"
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          chooseAnswer(questionKey, optionMarker)
                                        }
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                      >
                                        <span
                                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                                            isWrongSelected
                                              ? "bg-rose-100 text-rose-700"
                                              : selected
                                              ? "bg-white text-emerald-700"
                                              : isCorrectOption
                                                ? "bg-emerald-500 text-white"
                                              : "bg-emerald-100 text-emerald-700"
                                          }`}
                                        >
                                          {optionMarker}
                                        </span>
                                        <span className="min-w-0 break-words text-base font-bold leading-6">
                                          <TextWithBlanks text={optionText} />
                                          {option.phonetic && (
                                            <span
                                              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                                                selected
                                                  ? "bg-white/20 text-white"
                                                  : "bg-white text-stone-500"
                                              }`}
                                            >
                                              {option.phonetic}
                                            </span>
                                          )}
                                          {option.chinese && (
                                            <span
                                              className={`ml-2 text-sm font-medium ${
                                                selected
                                                  ? "text-emerald-50"
                                                  : "text-stone-500"
                                              }`}
                                            >
                                              · {option.chinese}
                                            </span>
                                          )}
                                        </span>
                                      </button>
                                      {option.english && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            playEnglishAudio(
                                              option.english,
                                              optionSpeechKey
                                            )
                                          }
                                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                            optionIsPlaying
                                              ? "bg-white text-emerald-700"
                                              : selected
                                                ? "bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25"
                                                : "bg-white text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50"
                                          }`}
                                          title={`播放 ${option.english}`}
                                        >
                                          {optionIsPlaying ? "■" : "▶"}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="bg-white px-3 pb-3">
                                <AnswerReveal
                                  answer={correctAnswer ? [correctAnswer] : []}
                                  visible={answerVisible}
                                  selected={selectedAnswer}
                                  correct={correctAnswer}
                                />
                              </div>
                            </div>
                          );
                        }

                        const parsed = block.entry;
                        const speechKey = `${sectionKey}-${blockIndex}`;
                        const isPlaying = playingSpeechKey === speechKey;
                        const fillKey = `${selectedDocument.id}:${sectionIndex}:${blockIndex}:${parsed.marker}`;
                        const fillAnswer = getFillAnswer(
                          selectedDocument.id,
                          sectionIndex,
                          parsed.marker
                        );
                        const displayText = parsed.english || parsed.raw;
                        const hasAnswerableBlank =
                          fillAnswer.length > 0 &&
                          BLANK_TEST_PATTERN.test(displayText);
                        const fillValues = fillResponses[fillKey] ?? [];
                        const fillAnswerVisible =
                          hasAnswerableBlank &&
                          fillValues.some((value) => value.trim());

                        return (
                          <div
                            key={`${parsed.raw}-${blockIndex}`}
                            className={`group flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_10px_24px_rgba(16,185,129,0.10)] ${getEntryCardClassName(
                              parsed.raw
                            )}`}
                          >
                            <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 px-2 text-[11px] font-black text-emerald-700">
                              {parsed.marker}
                            </span>
                            {parsed.english ? (
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="break-words text-base font-semibold leading-7 text-slate-950">
                                  {hasAnswerableBlank ? (
                                    <TextWithFillInputs
                                      text={parsed.english}
                                      values={fillValues}
                                      onChange={(blankIndex, value) =>
                                        changeFillResponse(
                                          fillKey,
                                          blankIndex,
                                          value
                                        )
                                      }
                                    />
                                  ) : (
                                    <TextWithBlanks text={parsed.english} />
                                  )}
                                </span>
                                {parsed.phonetic && (
                                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                                    {parsed.phonetic}
                                  </span>
                                )}
                                {parsed.chinese && (
                                  <span className="text-lg font-black leading-7 text-emerald-300">
                                    ·
                                  </span>
                                )}
                                {parsed.chinese && (
                                  <span className="break-words text-base leading-7 text-stone-600">
                                    {parsed.chinese}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    playEnglishAudio(parsed.english, speechKey)
                                  }
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                                    isPlaying
                                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
                                  }`}
                                  title={`播放 ${parsed.english}`}
                                >
                                  {isPlaying ? "■" : "▶"}
                                </button>
                              </div>
                            ) : (
                              <p className="min-w-0 flex-1 whitespace-pre-wrap text-base leading-7 text-slate-900">
                                {hasAnswerableBlank ? (
                                  <TextWithFillInputs
                                    text={parsed.raw}
                                    values={fillValues}
                                    onChange={(blankIndex, value) =>
                                      changeFillResponse(fillKey, blankIndex, value)
                                    }
                                  />
                                ) : (
                                  parsed.raw
                                )}
                              </p>
                            )}
                            {hasAnswerableBlank && (
                              <div className="basis-full pl-10">
                                <AnswerReveal
                                  answer={fillAnswer}
                                  visible={fillAnswerVisible}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}
