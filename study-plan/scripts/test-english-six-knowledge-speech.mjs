import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadHolidayTestModule } from "./holiday-math-test-utils.mjs";

const { speechForText, speechForRuns, speechForBlock, chunkEnglishSpeech } = await loadHolidayTestModule("src/lib/english-six-knowledge-speech.ts");
const cases = [
  ["ask sb. to do sth.", ["ask somebody to do something"]],
  ["sb.'s book and sth.'s name", ["somebody's book and something's name"]],
  ["ask sb to do sth; sb's book; tell sb sth", ["ask somebody to do something; somebody's book; tell somebody something"]],
  ["substance and substantial are normal words.", ["substance and substantial are normal words."]],
  ["I am a pupil. I'd like a book.", ["I am a pupil. I'd like a book."]],
  ["Mr. Green and Dr. Black work in the U.S. They live in the U.K.", ["Mr. Green and Dr. Black work in the U.S. They live in the U.K."]],
  ["第一句：I can try. 中文说明。第二句：You can win.", ["I can try.", "You can win."]],
  ["be表示是，was表示过去是", ["be", "was"]],
  ["I see a cat.（中文说明，English annotation）I see a dog.", ["I see a cat.", "English annotation", "I see a dog."]],
  ["(例句：I can swim.)", ["I can swim."]],
  ["He (他) is here.", ["He is here."]],
  ["want to (do something)", ["want to do something"]],
  ["teacher /ˈtiːtʃə(r)/ n. 老师", ["teacher"]],
  ["act /ækt/ v. 表演", ["act"]],
  ["/tʃ/ /dʒ/ /t/ /d/ /ɚ/ /i:/", []],
  ["am/is/are /ækt/ act", ["am or is or are act"]],
  ["v. n. adj. adv. prep. pron. num. conj. det. modal v.", []],
  ["change n./v. 变化；clean adj./v. 干净的；work vi./vt. 工作", ["change", "clean", "work"]],
  ["word n. 词；another adj. 形容词", ["word", "another"]],
  ["Two weeks ago, / his parents / bought a book / from a shop.", ["Two weeks ago, his parents bought a book from a shop."]],
  ["do/does/did; to/for; one's book", ["do or does or did; to or for; one's book"]],
  ["high-speed train and e-book", ["high-speed train and e-book"]],
  ["try → tried", ["try , tried"]],
  ["My name is ____. I am ____ years old.", ["My name is , . I am , years old."]],
  ["结构：What + a/an + 形容词 + 名词！\n例句：What a nice day!\nHow good it is!", ["What a nice day!", "How good it is!"]],
  ["结构：What + a/an + 形容词 + 名词！例句：What a nice day!", ["What a nice day!"]],
  ["句型结构：主语 + can + 动词；例句：I can swim.", ["I can swim."]],
  ["结构：You can do it! / Have a go! / Keep trying!", ["You can do it! Have a go! Keep trying!"]],
  ["字母组合 ee：音标 /iː/。例词：keep, tree, week.", ["keep, tree, week."]],
  ["动词 -ed 的结尾发音 /t/，如 stopped、walked。", ["stopped,walked."]],
  ["只有中文讲解。___ /t/ + 42", []],
  ["I have 3.5 hours. We meet on 21st October.", ["I have 3.5 hours. We meet on 21st October."]],
  ["1 We try our best to help old people.", ["We try our best to help old people."]],
  ["2 She tries her best to finish homework.", ["She tries her best to finish homework."]],
  ["1 Just give it a try!\n2 Let me have a try.", ["Just give it a try!", "Let me have a try."]],
  ["课文原句 1 a storybook about honesty（一本关于诚实的故事书）", ["a storybook about honesty"]],
  ["课文原句 7 In 1964, he began to work.", ["In 1964, he began to work."]],
  ["2026 Winter is coming.\n1 May\n3 apples\n1 Apple is red.\n400 BC\n1930 nineteen thirty", ["2026 Winter is coming.", "1 May", "3 apples", "1 Apple is red.", "400 BC", "1930 nineteen thirty"]],
];
for (const [input, expected] of cases) assert.deepEqual(speechForText(input), expected, "English extraction fixture failed");
assert.deepEqual(speechForRuns([{ text: "word " }, { text: "/wɜːd/", ipa: true }, { text: " n. 中文" }]), ["word"]);
assert.deepEqual(speechForRuns([{ text: "some" }, { text: "body", bold: true }, { text: "'s book" }]), ["somebody's book"]);

const table = { kind: "table", headers: [[{ text: "Word" }], [{ text: "Meaning" }]], rows: [
  [[{ text: "first" }], [{ text: "中文" }]],
  [[{ text: "second /ˈsekənd/" }], []],
] };
assert.deepEqual(speechForBlock(table).map(item => item.text), ["Word", "Meaning", "first", "second"]);
assert.deepEqual(speechForBlock({ ...table, headers: undefined }).map(item => item.text), ["first", "second"], "Headerless tables must retain the first data row");
assert.deepEqual(speechForBlock({ kind: "callout", paragraphs: [[{ text: "Original example." }], [{ text: "Comparison example." }], [{ text: "中文说明" }]] }).map(item => item.text), ["Original example.", "Comparison example."]);
assert.equal(speechForBlock({ kind: "paragraph", runs: [{ text: "中文" }] }).length, 0);
assert.equal(speechForBlock({ kind: "callout", paragraphs: [[{ text: "Same example." }], [{ text: "Same example." }]] }).length, 2, "Source repetitions must not be globally deduplicated");

for (const input of [
  "A complete sentence. ".repeat(40),
  "A sentence without commas or full stops that keeps going ".repeat(20),
  "abcdefghij".repeat(40),
  "Mr. Green meets Dr. Black in the U.S. They have 3.5 hours. ".repeat(12),
]) {
  const chunks = chunkEnglishSpeech(input);
  assert(chunks.length > 1);
  assert(chunks.every(chunk => chunk.length > 0 && chunk.length <= 150));
  assert.equal(chunks.join("").replace(/\s/g, ""), input.replace(/\s/g, ""), "Chunking must preserve every non-whitespace character");
}
assert.deepEqual(chunkEnglishSpeech("Mr. Green is here. Next sentence is longer.", 24), ["Mr. Green is here.", "Next sentence is longer."]);
assert(chunkEnglishSpeech("long ".repeat(100), 1000).every(chunk => chunk.length <= 150));

const authoring = process.argv.find(argument => argument.startsWith("--authoring="))?.slice("--authoring=".length);
let coverage;
if (authoring) {
  const book = JSON.parse(await fs.readFile(authoring, "utf8"));
  const { assertEnglishSixKnowledgeBook } = await loadHolidayTestModule("src/lib/english-six-knowledge.ts");
  assertEnglishSixKnowledgeBook(book);
  coverage = { units: book.units.length, sections: 0, bodyBlocks: 0, readableBodyBlocks: 0, nonSpeakableBodyBlocks: 0,
    sourceBodyBlocksWithoutLatin: 0, excludedLabelOrFormulaOnlyBodyBlocks: 0,
    readableHeadingBlocks: 0, englishBodyItems: 0, bodyChunks: 0, tableCells: 0, englishCells: 0,
    nonSpeakableCells: 0, sourceCellsWithoutLatin: 0, excludedLabelOrFormulaOnlyCells: 0, maximumChunkLength: 0 };
  for (const unit of book.units) for (const section of unit.sections) {
    let sectionChunks = 0;
    for (const block of section.blocks) {
      const items = speechForBlock(block);
      if (block.kind === "heading") coverage.readableHeadingBlocks += Number(items.length > 0);
      else {
        coverage.bodyBlocks++;
        if (items.length) coverage.readableBodyBlocks++;
        else {
          coverage.nonSpeakableBodyBlocks++;
          const fields = block.kind === "paragraph" ? [block.runs] : block.kind === "callout" ? block.paragraphs : [...(block.headers ? [block.headers] : []), ...block.rows].flat();
          if (fields.some(runs => /[A-Za-z]/.test(runs.filter(run => !run.ipa).map(run => run.text).join("")))) coverage.excludedLabelOrFormulaOnlyBodyBlocks++;
          else coverage.sourceBodyBlocksWithoutLatin++;
        }
        coverage.englishBodyItems += items.length;
        for (const item of items) for (const chunk of item.chunks) {
          assert(chunk.trim() && /[A-Za-z]/.test(chunk) && !/[\u3400-\u9fff]/.test(chunk));
          assert(chunk.length <= 150);
          coverage.maximumChunkLength = Math.max(coverage.maximumChunkLength, chunk.length);
          coverage.bodyChunks++; sectionChunks++;
        }
      }
      if (block.kind === "table") for (const row of [...(block.headers ? [block.headers] : []), ...block.rows]) for (const cell of row) {
        coverage.tableCells++;
        if (speechForRuns(cell).length) coverage.englishCells++;
        else {
          coverage.nonSpeakableCells++;
          if (/[A-Za-z]/.test(cell.filter(run => !run.ipa).map(run => run.text).join(""))) coverage.excludedLabelOrFormulaOnlyCells++;
          else coverage.sourceCellsWithoutLatin++;
        }
      }
    }
    assert(sectionChunks > 0, "Every reviewed section must contain speakable English");
    coverage.sections++;
  }
  assert.equal(coverage.units, 8); assert.equal(coverage.sections, 64); assert.equal(coverage.tableCells, 2277);
  assert.equal(coverage.readableBodyBlocks + coverage.nonSpeakableBodyBlocks, coverage.bodyBlocks);
  assert.equal(coverage.sourceBodyBlocksWithoutLatin + coverage.excludedLabelOrFormulaOnlyBodyBlocks, coverage.nonSpeakableBodyBlocks);
  assert.equal(coverage.englishCells + coverage.nonSpeakableCells, coverage.tableCells);
  assert.equal(coverage.sourceCellsWithoutLatin + coverage.excludedLabelOrFormulaOnlyCells, coverage.nonSpeakableCells);
}
console.log(JSON.stringify({ passed: true, extractionFixtures: cases.length, sourceTextLogged: false, ...(coverage ? { coverage } : {}) }));
