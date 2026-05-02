export type MathStageKey = "primary" | "junior";

export type MathDomainKey =
  | "number-algebra"
  | "geometry"
  | "statistics"
  | "practice";

export type MathCurriculumItem = {
  title: string;
  description: string;
  keyPoints: string[];
};

export type MathDomainBlock = {
  domain: MathDomainKey;
  items: MathCurriculumItem[];
};

export type MathGradeCurriculum = {
  key: string;
  stage: MathStageKey;
  grade: string;
  subtitle: string;
  focus: string;
  domains: MathDomainBlock[];
};

export const MATH_DOMAIN_META: Record<
  MathDomainKey,
  { name: string; shortName: string; description: string }
> = {
  "number-algebra": {
    name: "数与代数",
    shortName: "数代",
    description: "数的认识、运算、数量关系、式与方程、函数等。",
  },
  geometry: {
    name: "图形与几何",
    shortName: "几何",
    description: "图形认识、测量、位置、变换、证明与几何推理。",
  },
  statistics: {
    name: "统计与概率",
    shortName: "统计",
    description: "数据收集、整理、描述、分析，以及随机现象和概率。",
  },
  practice: {
    name: "综合与实践",
    shortName: "实践",
    description: "用数学解决真实问题，经历建模、调查、设计和表达。",
  },
};

export const MATH_CURRICULUM: MathGradeCurriculum[] = [
  {
    key: "primary-1",
    stage: "primary",
    grade: "一年级",
    subtitle: "建立数感和基本加减",
    focus: "从具体物体过渡到数和简单算式，重点是数感、位置、图形直观和生活中的数学表达。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "20以内数的认识与加减法",
            description: "认识数的顺序、大小、组成，理解加法和减法的含义。",
            keyPoints: ["数一数", "比大小", "数的组成", "进位加法", "退位减法"],
          },
          {
            title: "100以内数的初步认识",
            description: "认识十位和个位，理解十进制计数的初步意义。",
            keyPoints: ["个位和十位", "整十数", "100以内读写", "简单估数"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "位置与方向初步",
            description: "用上下、前后、左右描述物体的位置关系。",
            keyPoints: ["上和下", "前和后", "左和右", "第几"],
          },
          {
            title: "常见平面图形和立体图形",
            description: "认识长方形、正方形、三角形、圆，以及长方体、正方体、圆柱、球。",
            keyPoints: ["图形分类", "图形特征", "拼搭", "观察物体"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "分类与整理",
            description: "按一个标准分类，能用简单图表记录数量。",
            keyPoints: ["分类标准", "计数", "简单统计表", "比较多少"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "生活中的数和加减",
            description: "在购物、排队、分物、计数等情境中提出并解决简单问题。",
            keyPoints: ["看图列式", "口头表达", "生活问题", "检查答案"],
          },
        ],
      },
    ],
  },
  {
    key: "primary-2",
    stage: "primary",
    grade: "二年级",
    subtitle: "乘除法入门和长度测量",
    focus: "从加减扩展到乘除，形成表内乘除法自动化，同时加强测量、角和图形直观。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "100以内加减法",
            description: "掌握两位数加减两位数，理解进位和退位。",
            keyPoints: ["竖式计算", "进位", "退位", "估算", "验算"],
          },
          {
            title: "表内乘法和表内除法",
            description: "理解乘法表示几个相同加数，除法表示平均分和包含分。",
            keyPoints: ["乘法口诀", "平均分", "除法含义", "乘除关系"],
          },
          {
            title: "万以内数的认识",
            description: "认识千、万以内的数，理解数位和计数单位。",
            keyPoints: ["数位顺序", "读数写数", "近似数", "比较大小"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "长度单位和测量",
            description: "认识厘米、米，能选择合适工具测量并估计长度。",
            keyPoints: ["厘米", "米", "线段", "估测", "单位换算"],
          },
          {
            title: "角的初步认识",
            description: "认识角、直角、锐角和钝角，能在生活中辨认角。",
            keyPoints: ["角的组成", "直角", "锐角", "钝角"],
          },
          {
            title: "图形运动初步",
            description: "初步认识轴对称、平移和旋转现象。",
            keyPoints: ["轴对称", "平移", "旋转", "图案欣赏"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "简单数据整理",
            description: "用画正字、表格等方式收集和整理数据。",
            keyPoints: ["调查", "记录", "统计表", "比较数据"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "乘除法解决生活问题",
            description: "在购物、分组、排队、搭配等情境中选择乘法或除法。",
            keyPoints: ["平均分问题", "几个几", "倍的初步", "单位意识"],
          },
        ],
      },
    ],
  },
  {
    key: "primary-3",
    stage: "primary",
    grade: "三年级",
    subtitle: "多位数运算、分数小数初步",
    focus: "完善整数四则运算，接触分数和小数，开始学习周长、面积、年月日和更系统的数据表达。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "万以内加减法和多位数乘除法",
            description: "掌握笔算加减、两三位数乘一位数、除数是一位数的除法。",
            keyPoints: ["笔算", "估算", "验算", "余数", "混合运算"],
          },
          {
            title: "分数初步认识",
            description: "从平均分中认识几分之一和几分之几，能比较简单分数大小。",
            keyPoints: ["平均分", "分数含义", "同分母比较", "简单加减"],
          },
          {
            title: "小数初步认识",
            description: "结合元角分、长度等情境认识一位小数和简单小数加减。",
            keyPoints: ["小数读写", "一位小数", "比较大小", "简单加减"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "周长与面积",
            description: "理解周长和面积的区别，掌握长方形、正方形周长和面积。",
            keyPoints: ["周长公式", "面积单位", "面积公式", "单位换算"],
          },
          {
            title: "位置与方向",
            description: "用东南西北等方向描述路线和位置。",
            keyPoints: ["方向标", "路线图", "相对位置", "简单方位"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "条形统计图和平均数初步",
            description: "能读懂简单统计图，初步理解平均数表示整体水平。",
            keyPoints: ["统计图", "数据比较", "平均数", "解释数据"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "时间、测量和购物问题",
            description: "综合运用四则运算、单位换算和图表解决实际问题。",
            keyPoints: ["年月日", "时间间隔", "购物计算", "合理估计"],
          },
        ],
      },
    ],
  },
  {
    key: "primary-4",
    stage: "primary",
    grade: "四年级",
    subtitle: "大数、运算律和几何基础",
    focus: "理解大数和运算律，学习角、平行与垂直、小数意义和统计图，为高年级抽象学习打基础。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "大数的认识和整数四则运算",
            description: "认识亿以内和更大的数，掌握三位数乘两位数、除数是两位数的除法。",
            keyPoints: ["大数读写", "近似数", "乘除笔算", "商不变规律"],
          },
          {
            title: "运算律和简便计算",
            description: "理解加法、乘法运算律，能进行合理简算。",
            keyPoints: ["交换律", "结合律", "分配律", "凑整"],
          },
          {
            title: "小数的意义和性质",
            description: "认识小数的计数单位和数位，掌握小数大小比较和加减法。",
            keyPoints: ["小数数位", "小数性质", "大小比较", "小数加减"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "角的度量",
            description: "认识量角器，能测量和画指定度数的角。",
            keyPoints: ["度", "量角器", "角分类", "画角"],
          },
          {
            title: "平行、垂直和四边形",
            description: "认识平行线、垂线、平行四边形和梯形。",
            keyPoints: ["平行", "垂直", "高", "平行四边形", "梯形"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "复式统计图",
            description: "能读懂和制作复式条形统计图，比较两组数据。",
            keyPoints: ["复式条形图", "数据对比", "图例", "结论表达"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "优化和方案问题",
            description: "在烙饼、沏茶、租车等情境中寻找更优方案。",
            keyPoints: ["列表", "枚举", "优化", "方案比较"],
          },
        ],
      },
    ],
  },
  {
    key: "primary-5",
    stage: "primary",
    grade: "五年级",
    subtitle: "方程、因倍数、分数和立体图形",
    focus: "从算术进一步走向代数，系统学习方程、因数倍数、分数运算、长方体正方体和折线统计图。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "简易方程",
            description: "用字母表示数，理解等式性质，列方程解决实际问题。",
            keyPoints: ["用字母表示数", "等式性质", "解方程", "列方程"],
          },
          {
            title: "因数与倍数",
            description: "认识因数、倍数、质数、合数、公因数和公倍数。",
            keyPoints: ["2、3、5倍数特征", "质数合数", "最大公因数", "最小公倍数"],
          },
          {
            title: "分数的意义和运算",
            description: "理解分数意义、基本性质，学习约分、通分、分数加减乘。",
            keyPoints: ["分数单位", "约分", "通分", "分数加减", "分数乘法"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "长方体和正方体",
            description: "认识长方体、正方体，计算表面积、体积和容积。",
            keyPoints: ["展开图", "表面积", "体积", "容积", "单位换算"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "折线统计图",
            description: "用单式和复式折线统计图表示数据变化趋势。",
            keyPoints: ["单式折线图", "复式折线图", "变化趋势", "数据预测"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "数学广角与综合复习",
            description: "综合运用方程、分数、几何和统计解决真实问题。",
            keyPoints: ["找等量关系", "画图分析", "单位统一", "检验结果"],
          },
        ],
      },
    ],
  },
  {
    key: "primary-6",
    stage: "primary",
    grade: "六年级",
    subtitle: "百分数、比例、圆和小学总复习",
    focus: "完成小学数学的综合提升，重点是百分数、比例、圆、圆柱圆锥和统计推断初步。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "分数除法和比",
            description: "理解分数除法意义，认识比、比值和比的基本性质。",
            keyPoints: ["倒数", "分数除法", "比", "化简比", "按比分配"],
          },
          {
            title: "百分数",
            description: "理解百分数意义，解决折扣、利率、增长率等问题。",
            keyPoints: ["百分率", "折扣", "成数", "税率", "利率"],
          },
          {
            title: "比例",
            description: "认识比例、正比例和反比例，能用比例解决问题。",
            keyPoints: ["比例基本性质", "解比例", "正比例", "反比例", "比例尺"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "圆、圆柱和圆锥",
            description: "计算圆的周长和面积，认识圆柱圆锥体积。",
            keyPoints: ["圆周率", "周长", "面积", "圆柱体积", "圆锥体积"],
          },
          {
            title: "图形的位置和变换",
            description: "学习位置表示、图形放大缩小、旋转和平移。",
            keyPoints: ["数对", "旋转", "平移", "放大缩小", "比例尺"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "统计图和可能性",
            description: "综合使用条形、折线、扇形统计图，理解简单随机现象。",
            keyPoints: ["扇形统计图", "统计图选择", "平均数", "可能性"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "小学数学总复习",
            description: "把数与运算、图形、统计和应用题整合成完整知识网络。",
            keyPoints: ["知识梳理", "综合应用", "错题整理", "建模意识"],
          },
        ],
      },
    ],
  },
  {
    key: "junior-7",
    stage: "junior",
    grade: "七年级",
    subtitle: "从算术走向代数和几何推理",
    focus: "建立有理数、代数式、方程和几何基本语言，为初中数学抽象表达打底。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "有理数和实数初步",
            description: "理解正负数、数轴、相反数、绝对值和有理数运算。",
            keyPoints: ["数轴", "绝对值", "有理数加减乘除", "乘方", "科学记数法"],
          },
          {
            title: "代数式和整式",
            description: "用字母表示数量关系，学习整式加减和合并同类项。",
            keyPoints: ["代数式", "单项式", "多项式", "同类项", "去括号"],
          },
          {
            title: "一元一次方程",
            description: "理解方程解法，能列一元一次方程解决实际问题。",
            keyPoints: ["移项", "去分母", "去括号", "实际问题", "检验"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "几何图形初步",
            description: "认识点、线、面、角、线段和基本几何语言。",
            keyPoints: ["线段", "射线", "直线", "角", "余角补角"],
          },
          {
            title: "相交线和平行线",
            description: "学习垂线、平行线和角之间的关系。",
            keyPoints: ["垂线", "同位角", "内错角", "同旁内角", "平行判定"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "数据收集和统计图",
            description: "经历调查、抽样、整理、描述数据的过程。",
            keyPoints: ["全面调查", "抽样调查", "频数", "条形图", "扇形图"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "方程建模和几何测量",
            description: "把实际问题转化为方程或几何图形进行分析。",
            keyPoints: ["设未知数", "等量关系", "画图", "解释结论"],
          },
        ],
      },
    ],
  },
  {
    key: "junior-8",
    stage: "junior",
    grade: "八年级",
    subtitle: "函数、证明和方程组深化",
    focus: "重点发展代数变形、函数图像、几何证明和统计分析能力。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "二次根式和分式",
            description: "学习二次根式、分式的性质和运算。",
            keyPoints: ["最简二次根式", "根式运算", "分式约分", "分式方程"],
          },
          {
            title: "一次函数",
            description: "理解函数、变量、图像和一次函数模型。",
            keyPoints: ["函数概念", "正比例函数", "一次函数", "斜率", "图像应用"],
          },
          {
            title: "二元一次方程组和不等式",
            description: "用方程组、不等式描述和解决实际问题。",
            keyPoints: ["代入消元", "加减消元", "不等式性质", "解集", "应用题"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "三角形、全等和轴对称",
            description: "掌握三角形基本性质、全等判定和轴对称图形。",
            keyPoints: ["三角形内角和", "全等判定", "角平分线", "垂直平分线", "轴对称"],
          },
          {
            title: "勾股定理和四边形",
            description: "学习直角三角形边的关系和平行四边形、矩形、菱形、正方形。",
            keyPoints: ["勾股定理", "逆定理", "平行四边形", "矩形", "菱形"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "数据分析",
            description: "用平均数、中位数、众数、方差描述数据特征。",
            keyPoints: ["平均数", "中位数", "众数", "方差", "数据解释"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "函数和几何综合应用",
            description: "用图像、表格、方程和几何性质解决多步骤问题。",
            keyPoints: ["数形结合", "分类讨论", "模型选择", "方案评价"],
          },
        ],
      },
    ],
  },
  {
    key: "junior-9",
    stage: "junior",
    grade: "九年级",
    subtitle: "二次函数、圆、相似和中考综合",
    focus: "形成初中数学综合能力，重点是二次函数、一元二次方程、圆、相似、三角函数和概率。",
    domains: [
      {
        domain: "number-algebra",
        items: [
          {
            title: "一元二次方程",
            description: "掌握配方法、公式法、因式分解法和根的判别式。",
            keyPoints: ["配方法", "公式法", "因式分解", "判别式", "实际问题"],
          },
          {
            title: "二次函数和反比例函数",
            description: "研究函数图像、性质、最值和实际应用。",
            keyPoints: ["抛物线", "顶点", "对称轴", "最值", "反比例函数"],
          },
        ],
      },
      {
        domain: "geometry",
        items: [
          {
            title: "圆",
            description: "学习圆的性质、与圆有关的位置关系和计算。",
            keyPoints: ["垂径定理", "圆周角", "切线", "弧长", "扇形面积"],
          },
          {
            title: "相似和锐角三角函数",
            description: "用相似关系和三角函数解决测量与几何问题。",
            keyPoints: ["相似判定", "相似性质", "正弦", "余弦", "正切"],
          },
          {
            title: "图形变换和投影视图",
            description: "理解位似、旋转、投影和三视图。",
            keyPoints: ["位似", "中心对称", "旋转", "投影", "三视图"],
          },
        ],
      },
      {
        domain: "statistics",
        items: [
          {
            title: "概率初步",
            description: "理解随机事件、概率意义和简单概率计算。",
            keyPoints: ["随机事件", "概率", "列表法", "树状图", "频率估计概率"],
          },
        ],
      },
      {
        domain: "practice",
        items: [
          {
            title: "中考综合与数学建模",
            description: "综合运用方程、函数、几何和统计解决压轴题和现实问题。",
            keyPoints: ["函数几何综合", "动点问题", "分类讨论", "建模表达"],
          },
        ],
      },
    ],
  },
];

export const getMathCurriculumByStage = (stage: MathStageKey) =>
  MATH_CURRICULUM.filter((grade) => grade.stage === stage);

export const countMathCurriculumItems = (stage?: MathStageKey) =>
  MATH_CURRICULUM.filter((grade) => (stage ? grade.stage === stage : true)).reduce(
    (total, grade) =>
      total + grade.domains.reduce((sum, domain) => sum + domain.items.length, 0),
    0
  );
