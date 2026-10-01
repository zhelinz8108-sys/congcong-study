"""Convert the supplied grammar handbook into source-traceable web lessons.

Run with pdfplumber installed:
  python scripts/import-national-day-english.py --source path/to/handbook.pdf
The PDF stays unchanged; the JSON is a mechanical extraction of its content.
"""

import argparse
import json
import re
from pathlib import Path

import pdfplumber


def join_lines(left, right):
    space = " " if re.search(r"[A-Za-z0-9.,!?;:]$", left) and re.match(r"[A-Za-z0-9]", right) else ""
    return left + space + right


def tidy(text):
    return re.sub(r"\s+", " ", text or "").strip()


def extract_page(page, number):
    tables = page.find_tables()
    events = []
    for table in tables:
        bbox = table.bbox
        header_bbox = table.rows[0].cells[0]
        chars = sorted(page.crop(header_bbox).chars, key=lambda char: char["x0"])
        groups = []
        for char in chars:
            if not groups or char["x0"] - groups[-1][-1]["x1"] > 8:
                groups.append([])
            groups[-1].append(char)
        headers = [tidy("".join(char["text"] for char in group)) for group in groups]
        edges = [bbox[0]] + [group[0]["x0"] - 4 for group in groups[1:]] + [bbox[2]]
        rows = []
        for row in table.rows[1:]:
            row_bbox = row.cells[0]
            cells = []
            for start, end in zip(edges, edges[1:]):
                cell = page.crop((start, row_bbox[1], end, row_bbox[3]))
                lines = (cell.extract_text(x_tolerance=1) or "").splitlines()
                value = ""
                for line in lines:
                    value = join_lines(value, line.strip())
                cells.append(value)
            rows.append(cells)
        events.append({"top": bbox[1], "bottom": bbox[3], "block": {"type": "table", "headers": headers, "rows": rows}})

    for line in page.extract_text_lines(x_tolerance=1, y_tolerance=3):
        if line["top"] < 60 or line["top"] > page.height - 40:
            continue
        if any(table.bbox[1] <= line["top"] < table.bbox[3] for table in tables):
            continue
        size = max(char["size"] for char in line["chars"])
        bold = any("Bold" in char["fontname"] for char in line["chars"])
        kind = "title" if size >= 17 else "heading" if bold and size >= 11.8 else "text"
        events.append({"top": line["top"], "bottom": line["bottom"], "block": {"type": kind, "text": line["text"].strip()}})
    events.sort(key=lambda event: event["top"])
    blocks = []
    previous_bottom = 0
    for event in events:
        block = event["block"]
        numbered = block["type"] == "text" and re.match(r"^\d{1,2}\.\s", block["text"])
        if block["type"] == "text" and blocks and blocks[-1]["type"] == "text" and not numbered and event["top"] - previous_bottom < 9.5:
            blocks[-1]["text"] = join_lines(blocks[-1]["text"], block["text"])
        else:
            blocks.append(block)
        previous_bottom = event["bottom"]
    title = next(block["text"] for block in blocks if block["type"] == "title")
    return {"page": number, "title": title, "blocks": [block for block in blocks if block["type"] != "title"]}


def answer_index(pages):
    answers = {}
    current = None
    for page in pages[89:100]:
        for block in page["blocks"]:
            text = block.get("text", "")
            chapter = re.match(r"^(\d{2}(?:\.\d+)?)\s", text)
            if chapter:
                current = chapter[1]
                continue
            item = re.match(r"^(\d{1,2})\.\s*(.+)", text)
            if item and current:
                answers[f"{current}:{int(item[1])}"] = item[2]
    for page in pages[100:104]:
        current = {102: "review-a", 103: "review-b", 104: "review-c"}.get(page["page"])
        for block in page["blocks"]:
            text = block.get("text", "")
            if text.startswith("阅读A："):
                current = "reading-a"
            elif text.startswith("阅读B："):
                current = "reading-b"
            elif text.startswith("听读任务："):
                current = "listening"
            elif block["type"] == "heading" and page["page"] == 104:
                current = None
            item = re.match(r"^(\d{1,2})\.\s*(.+)", text)
            if item and current:
                answers[f"{current}:{int(item[1])}"] = item[2]
    return answers


ALIASES = {
    "动词": ["动词", "verb", "v"],
    "形容词": ["形容词", "adjective", "adj"],
    "宾语补足语": ["宾语补足语", "宾补", "object complement"],
    "可数": ["可数", "可数名词", "countable"],
    "一般现在时": ["一般现在时", "present simple", "simple present"],
    "不同": ["不同", "不相同", "different"],
}


def make_question(key, prompt, reference):
    question = {"id": key, "prompt": prompt, "reference": reference, "mode": "self", "accepted": []}
    first = reference.split("。", 1)[0]
    if first in ALIASES:
        question.update(mode="auto", accepted=[ALIASES[first]])
    else:
        prefix = re.split(r"[\u4e00-\u9fff。]", reference, maxsplit=1)[0].strip()
        # Explanatory English verbs can precede the first Chinese character.
        prefix = re.sub(r"([.!?])\s+[^.!?/]*$", r"\1", prefix)
        if prefix == "/":
            question.update(mode="auto", accepted=[["不填", "零冠词", "/", "none"]])
        elif prefix and re.match(r"[A-Za-z]", prefix) and not re.search(r"如|例如|解释|说明|对比|写两|写出.*句|分别改", prompt):
            parts = prefix.rstrip(".?! ").split("；")
            accepted = [[alt.strip().rstrip(".?! ") for alt in part.split(" / ") if alt.strip()] for part in parts]
            question.update(mode="auto", accepted=accepted)
    choices = re.findall(r"[（(]([^（）()]+[／/][^（）()]+)[）)]", prompt)
    if choices and question["mode"] == "auto" and len(question["accepted"]) == 1:
        options = [option.strip() for option in re.split(r"\s*[／/]\s*", choices[-1]) if option.strip()]
        if choices[-1].strip().endswith(("/", "／")):
            options.append("/")
        options = list(dict.fromkeys(options))
        if 2 <= len(options) <= 5 and all(len(option) <= 35 for option in options) and any(option in question["accepted"][0] for option in options):
            question["options"] = options
    return question


READING_ACCEPTED = {
    "reading-a:1": ["He is eleven", "eleven", "11", "He is eleven years old"],
    "reading-a:2": ["At 6:50", "6:50", "ten to seven", "At ten to seven", "She gets up at 6:50"],
    "reading-a:3": ["They usually walk to school", "They go to school on foot", "They usually go to school on foot", "On foot", "They walk to school"],
    "reading-b:2": ["No, it wasn't. It was smaller", "No, it wasn't", "It was smaller"],
    "review-c:1": ["He went to a science museum", "A science museum", "To a science museum"],
    "review-c:3": ["At twelve", "At noon", "At 12", "12:00", "At 12:00", "They left at twelve"],
    "review-c:4": ["No, they didn't", "No, they did not"],
    "listening:1": ["In the park", "She is in the park", "Amy is in the park"],
}

ANSWER_OVERRIDES = {
    "01:1": [["My father"], ["cooks"]],
    "01.4:4": [["book on the desk", "The book on the desk is mine"]],
    "02:3": [["助动词", "auxiliary verb", "auxiliary"], ["实义动词", "实义", "main verb", "lexical verb"]],
    "04:1": [["an", "an orange"], ["a", "a university"]],
    "09.1:2": [["Who does he know", "Whom does he know"]],
    "09.3:4": [["The blue one, please", "The blue one", "I want the blue one", "I want the blue one, please"]],
    "10.2:4": [["She usually drinks tea, but she is drinking water now", "She usually drinks tea, but now she is drinking water"]],
    "12.2:4": [["Did he take any pictures", "Did he take some pictures"]],
    "13.1:3": [["The phone is ringing. I will answer it", "The phone is ringing. I'll answer it", "I will answer it", "I'll answer it"]],
    "14.1:4": [["He didn't go there yesterday"], ["Did he go there yesterday"]],
    "20.1:2": [["across", "over"]],
    "22.1:4": [["a quarter to eight", "quarter to eight", "fifteen to eight"]],
    "23.1:3": [["The teacher told us not to be late", "The teacher tells us not to be late"]],
    "review-b:17": [["She is going to visit her grandmother tomorrow", "Tomorrow she is going to visit her grandmother", "She is going to visit her grandma tomorrow"]],
    "review-b:18": [["We were at home yesterday", "We were home yesterday", "Yesterday we were at home"]],
    "review-b:20": [["He doesn't have to get up early every day", "He needn't get up early every day", "He doesn't need to get up early every day"]],
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", default="src/data/national-day-english.json")
    args = parser.parse_args()
    with pdfplumber.open(args.source) as pdf:
        if len(pdf.pages) != 105:
            raise ValueError("This importer expects the verified 105-page expanded handbook")
        pages = [extract_page(page, number) for number, page in enumerate(pdf.pages, 1)]
    answers = answer_index(pages)
    sections = []
    for page in pages[:89] + pages[104:105]:
        number = page["page"]
        code = re.match(r"^(\d{2}(?:\.\d+)?)\s", page["title"])
        section_id = code[1] if code else {82: "reading-a", 83: "reading-b", 85: "listening", 87: "review-a", 88: "review-b", 89: "review-c"}.get(number, f"resource-{number}")
        questions = []
        blocks = []
        exercise_zone = number in [87, 88, 89]
        for block in page["blocks"]:
            text = block.get("text", "")
            if block["type"] == "heading":
                if text.startswith("练习") or (number in [82, 83] and text == "先找信息，再分析结构") or (number == 85 and text.startswith("听读任务")):
                    exercise_zone = True
                    if text.startswith("练习"):
                        continue
                elif exercise_zone:
                    exercise_zone = False
            item = re.match(r"^(\d{1,2})\.\s*(.+)", text)
            key = f"{section_id}:{int(item[1])}" if item else None
            if item and (exercise_zone or (not code and key in answers)):
                if key not in answers:
                    raise ValueError(f"Missing answer for {key}")
                question = make_question(key, item[2], answers[key])
                if key in READING_ACCEPTED:
                    question.update(mode="auto", accepted=[READING_ACCEPTED[key]])
                if key in ANSWER_OVERRIDES:
                    question.update(mode="auto", accepted=ANSWER_OVERRIDES[key])
                if key == "13.1:4":
                    question.update(mode="self", accepted=[])
                if key == "01:1":
                    question["labels"] = ["主语", "动词"]
                elif key == "02:3":
                    question["labels"] = ["第一个 Do 的作用", "第二个 do 的作用"]
                elif key == "14.1:4":
                    question["labels"] = ["否定句", "一般疑问句"]
                questions.append(question)
            else:
                blocks.append(block)
        section = {"id": section_id, "title": page["title"], "page": number, "category": "lesson" if code else "practice" if number in [82, 83, 84, 85, 87, 88, 89] else "reference", "topic": code[1].split(".")[0] if code else None, "blocks": blocks, "questions": questions}
        if number == 85:
            oral_table = next(block for block in blocks if block["type"] == "table")
            section["oralQuestions"] = [make_question(f"oral:{index}", row[0], "根据自己的真实情况回答。" + row[1]) for index, row in enumerate(oral_table["rows"], 1)]
            transcript_start = next(index for index, block in enumerate(blocks) if block.get("text", "").startswith("朗读者文本"))
            section["listeningBlocks"] = blocks[transcript_start:]
            section["blocks"] = blocks[:transcript_start]
            section["audioText"] = next(block["text"] for block in section["listeningBlocks"] if block["type"] == "text")
        if number in [79, 80, 82, 83, 84, 89]:
            section["writing"] = {"label": "我的造句与复述" if number != 84 and number != 89 else "我的英文短文", "prompt": "选出本页不熟悉的词组，写成自己的句子，或按原文提示完成复述。" if number != 84 and number != 89 else "按本页写作要求写 50–80 词；完成后检查时间、动词、词组和句子。", "minWords": 50 if number in [84, 89] else 0}
        if number == 86:
            section["writing"] = {"label": "我的易错句复盘", "prompt": "按顺序记下：原来的错误句、修正后的句子、你能解释的原因。第二天换一个人物或时间，再写一句。", "minWords": 0}
        if number == 89:
            section["writing"]["referenceBlocks"] = pages[103]["blocks"][next(index for index, block in enumerate(pages[103]["blocks"]) if block.get("text", "").startswith("写作参考")):]
        sections.append(section)
    # Keep the complete answer source for transparent traceability and writing examples.
    output = {"title": "小学至初一英语语法详解·扩充版", "pageCount": 105, "pdfUrl": "/national-day-english/grammar-expanded.pdf", "sections": sections, "answerPages": pages[89:104]}
    questions = [question for section in sections for question in section["questions"]]
    if len(questions) != 318 or len({question["id"] for question in questions}) != 318:
        raise ValueError("Expected all 318 original questions, with unique IDs")
    if set(answers) != {question["id"] for question in questions}:
        raise ValueError("Question coverage does not match the complete answer key")
    if any(not question["reference"] for question in questions):
        raise ValueError("Every question must have its original answer and explanation")
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sections": len(sections), "lessons": sum(section["category"] == "lesson" for section in sections), "questions": len(questions), "auto": sum(question["mode"] == "auto" for question in questions), "self": sum(question["mode"] == "self" for question in questions)}, ensure_ascii=True))


if __name__ == "__main__":
    main()
