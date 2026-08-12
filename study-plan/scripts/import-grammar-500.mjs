import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(
      process.cwd(),
      "..",
      "英语",
      "语法",
      "小学英语语法500道拔高选择题_含答案.docx"
    );
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve(process.cwd(), "src", "data", "grammar", "original-500.json");

const sourceBuffer = await fs.readFile(sourcePath);
const { value: rawText } = await mammoth.extractRawText({ buffer: sourceBuffer });
const lines = rawText
  .split(/(?:\r?\n){2,}/)
  .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
  .filter(Boolean);

const topicPattern = /^(\d+)\.\s+(.+?)（(\d+)题）$/;
const questionPattern = /^(\d+)\.\s+([\s\S]+?)A\.\s+([\s\S]+?)B\.\s+([\s\S]+?)C\.\s+([\s\S]+?)D\.\s+([\s\S]+)$/;
const answerPattern = /^(\d+)\.\s+([A-D])\s+([\s\S]+)$/;

const topics = [];
const questions = [];
const answers = new Map();
let currentTopic = null;
let readingAnswers = false;

for (const line of lines) {
  if (line === "参考答案") {
    readingAnswers = true;
    currentTopic = null;
    continue;
  }

  const topicMatch = line.match(topicPattern);
  if (topicMatch) {
    if (!readingAnswers) {
      currentTopic = {
        id: Number(topicMatch[1]),
        title: topicMatch[2].trim(),
        declaredCount: Number(topicMatch[3]),
      };
      topics.push(currentTopic);
    }
    continue;
  }

  if (readingAnswers) {
    const answerMatch = line.match(answerPattern);
    if (answerMatch) {
      answers.set(Number(answerMatch[1]), {
        answer: answerMatch[2],
        answerText: answerMatch[3].trim(),
      });
    }
    continue;
  }

  const questionMatch = line.match(questionPattern);
  if (questionMatch && currentTopic) {
    questions.push({
      id: Number(questionMatch[1]),
      topicId: currentTopic.id,
      prompt: questionMatch[2].trim(),
      options: [
        questionMatch[3].trim(),
        questionMatch[4].trim(),
        questionMatch[5].trim(),
        questionMatch[6].trim(),
      ],
    });
  }
}

for (const question of questions) {
  const answer = answers.get(question.id);
  if (!answer) throw new Error(`Question ${question.id} has no answer.`);
  question.answer = answer.answer;
  question.answerText = answer.answerText;

  const optionIndex = answer.answer.charCodeAt(0) - 65;
  if (question.options[optionIndex] !== answer.answerText) {
    throw new Error(
      `Question ${question.id} answer mismatch: option=${question.options[optionIndex]} key=${answer.answerText}`
    );
  }
}

if (topics.length !== 15) throw new Error(`Expected 15 topics, found ${topics.length}.`);
if (questions.length !== 500) {
  const parsedIds = new Set(questions.map((question) => question.id));
  const missingIds = Array.from({ length: 500 }, (_item, index) => index + 1).filter(
    (id) => !parsedIds.has(id)
  );
  throw new Error(
    `Expected 500 questions, found ${questions.length}. Missing: ${missingIds.join(", ")}`
  );
}
if (answers.size !== 500) throw new Error(`Expected 500 answers, found ${answers.size}.`);

for (const topic of topics) {
  const actualCount = questions.filter((question) => question.topicId === topic.id).length;
  if (actualCount !== topic.declaredCount) {
    throw new Error(
      `Topic ${topic.id} declares ${topic.declaredCount} questions, found ${actualCount}.`
    );
  }
  topic.questionCount = actualCount;
  delete topic.declaredCount;
}

const output = {
  title: "中国小学英语语法500道拔高选择题",
  subtitle: "小学高年级 / 小升初衔接 · 全部四选一",
  sourceFile: path.basename(sourcePath),
  sourceSha256: crypto.createHash("sha256").update(sourceBuffer).digest("hex"),
  topics,
  questions,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Imported ${questions.length} questions across ${topics.length} topics.`);
console.log(`Source SHA-256: ${output.sourceSha256}`);
console.log(`Output: ${outputPath}`);
