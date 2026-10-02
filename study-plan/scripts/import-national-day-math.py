"""Recover the complete native-web lesson data from the final study booklet.

This is a deterministic, file-local mechanical import, not a PDF embed.  Text is
read from glyph baselines rather than extract_text()'s lines: the latter puts
binary subscripts on separate lines and can silently turn (1001)₂ into 10012.
Run from the repository root, or pass --source and --output explicitly.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import pdfplumber


REPO = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = REPO / "output/pdf/六上数学_三天完整学习册_知识点例题答案.pdf"
DEFAULT_OUTPUT = REPO / "study-plan/src/data/national-day-math.json"
EXPECTED = {"examples": 117, "diagnostic": 12, "unitQuiz": 57, "comprehensive": 20, "answers": 206}
SUBSCRIPT = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")
SUPERSCRIPT = str.maketrans("0123456789+-=()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾")

# The 7 drawings are native SVGs in the website.  Only text inside the drawing
# regions is excluded; each explanatory caption remains in the content after
# its diagram slot.  Coordinates are baseline distances down from the top.
DIAGRAMS = {
    11: (430, 650, "decimals", "小数乘法：0.6×0.4", "0.6×0.4 = 24个0.01 = 0.24。面积单位是平方米，不是米。"),
    19: (345, 465, "whole", "单位“1”：80本书的整体与部分", "示意：一批书共有80本，借出其中3/5，剩下2/5。先确定整体，再找分率。"),
    45: (460, 580, "ratio", "蜂蜜与水：3份和2份", "蜂蜜∶水=3∶2，不表示蜂蜜占饮料的3/2。相对谁比较，分母就对应谁。"),
    61: (400, 600, "circle", "圆心、半径与直径", "半径从圆心到圆上；直径连接圆上两点且通过圆心。圆心定位置，半径定大小。"),
    77: (470, 745, "scale", "6×4厘米按2∶1放大为12×8厘米", "只拉长一条边会变形；‘按2∶1放大’说的是长度，不是面积。"),
    87: (330, 570, "coordinates", "数对：A(3,4)与B(5,2)", "先列后行。图中A在第3列、第4行；方格图按右移列增、上移行增。"),
    90: (490, 745, "bearing", "方向与距离：北偏东30°、2千米", "B在A的北偏东30°方向2千米处；从北向东量30°。这是示意图，不是实测比例图。"),
}


@dataclass
class Line:
    text: str
    page: int
    down: float
    size: float
    x: float
    marker: dict | None = None


@dataclass
class Paragraph:
    text: str
    page: int
    last_page: int
    down: float
    last_down: float
    size: float
    x: float
    marker: dict | None = None


def restore_line(chars: list[dict]) -> tuple[str, float, float]:
    """Preserve glyph order and restore semantic Unicode super/subscripts."""
    chars.sort(key=lambda c: (c["x0"], c["top"]))
    visible = [c for c in chars if c["text"].strip()]
    size_counts = Counter(round(c["size"], 1) for c in visible)
    normal_size = size_counts.most_common(1)[0][0]
    # Main glyphs are larger than index glyphs.  Using the maximum also works on
    # short expressions where a subscript makes up a large proportion of text.
    main_size = max(c["size"] for c in visible)
    main_top = min(c["top"] for c in visible if abs(c["size"] - main_size) < 0.2)
    result = []
    for char in chars:
        value = char["text"]
        if char["size"] < main_size - 1.4 and all(c in "0123456789+-=()" for c in value):
            delta = char["top"] - main_top
            if delta > 2.5:
                value = value.translate(SUBSCRIPT)
            elif delta < -1:
                value = value.translate(SUPERSCRIPT)
        result.append(value)
    text = "".join(result).strip()
    # One final formula-note uses a plain-font base suffix in the source PDF.
    # Restore that unambiguous base notation too, without touching fractions.
    text = re.sub(r"(\([01]+\))([258])(?=[\s=，。、；：…]|$)", lambda m: m[1] + m[2].translate(SUBSCRIPT), text)
    return text, main_size if main_size >= normal_size else normal_size, min(c["x0"] for c in chars)


def read_lines(source: Path) -> tuple[list[Line], dict]:
    lines: list[Line] = []
    audit = {"sourceGlyphs": 0, "bodyGlyphs": 0, "subscriptGlyphs": 0, "excludedContentsPages": [2, 3], "diagrams": []}
    with pdfplumber.open(source) as pdf:
        audit["pdfPages"] = len(pdf.pages)
        if len(pdf.pages) != 106:
            raise ValueError("The diagram locations and structure target the verified 106-page final booklet.")
        for page_number, page in enumerate(pdf.pages, 1):
            audit["sourceGlyphs"] += len(page.chars)
            if page_number in (2, 3):
                continue  # Duplicated table of contents, not lesson content.
            groups = defaultdict(list)
            for char in page.chars:
                # Header and footer only: all body text remains inside this band.
                if 45 < char["top"] < 800:
                    groups[round(char["matrix"][5], 2)].append(char)
                    audit["bodyGlyphs"] += 1
            diagram_added = False
            for baseline, chars in sorted(groups.items(), reverse=True):
                if not any(c["text"].strip() for c in chars):
                    continue
                down = page.height - baseline
                if page_number in DIAGRAMS:
                    start, end, diagram_id, title, caption = DIAGRAMS[page_number]
                    if start <= down <= end:
                        if not diagram_added:
                            marker = {"type": "diagram", "id": diagram_id, "title": title, "caption": caption, "pdfPage": page_number}
                            lines.append(Line("", page_number, down, 0, 46, marker))
                            audit["diagrams"].append(diagram_id)
                            diagram_added = True
                        continue
                text, size, x = restore_line(chars)
                audit["subscriptGlyphs"] += sum(c in "₀₁₂₃₄₅₆₇₈₉" for c in text)
                lines.append(Line(text, page_number, down, size, x))
    return lines, audit


def starts_paragraph(line: Line) -> bool:
    return bool(line.marker or line.size >= 11.2 or re.match(r"^(?:[•□]|\d+\.(?!\d)\s*|答案[：:]|易错提醒[：:])", line.text))


def paragraphs_from(lines: list[Line]) -> list[Paragraph]:
    paragraphs: list[Paragraph] = []
    for line in lines:
        previous = paragraphs[-1] if paragraphs else None
        merge = False
        if previous and not previous.marker and not line.marker:
            same_style = abs(previous.size - line.size) < 0.25 and abs(previous.x - line.x) < 5
            same_page_wrap = line.page == previous.last_page and 0 < line.down - previous.last_down <= 19
            next_page_wrap = line.page == previous.last_page + 1 and not re.search(r"[。！？.!?]$", previous.text)
            # Wrapped headings must be merged too; a new heading at the same
            # size normally has a much larger gap or its own structural prefix.
            is_new_prefix = bool(re.match(r"^(?:[•□]|\d+\.(?!\d)\s*|答案[：:]|易错提醒[：:]|例题\s*\d+|诊断\s*\d+|自测\s*\d+|综合\s*\d+|\d{2}\s)", line.text))
            merge = same_style and not is_new_prefix and (same_page_wrap or next_page_wrap)
        if merge:
            previous.text += line.text
            previous.last_page = line.page
            previous.last_down = line.down
        else:
            paragraphs.append(Paragraph(line.text, line.page, line.page, line.down, line.down, line.size, line.x, line.marker))
    return paragraphs


def new_section(section_id: str, title: str, kind: str, page: int, day: int | None) -> dict:
    section = {"id": section_id, "title": title, "kind": kind, "sourcePages": [page], "blocks": []}
    if day:
        section["day"] = day
    return section


def section_for(paragraph: Paragraph, current_day: int | None) -> tuple[str, str, int | None] | None:
    text, page = paragraph.text, paragraph.page
    if page == 4 and text.startswith("先看这里"):
        return "plan", "plan", None
    if text.startswith("先修补给"):
        return "prerequisite", "prerequisite", None
    if text.startswith("先修诊断12题"):
        return "diagnostic", "diagnostic", None
    if page >= 11 and re.match(r"第[123]天 ", text) and paragraph.size >= 20:
        day = int(text[1])
        return f"day{day}", "plan", day
    chapters = [
        ("第一单元", "u1", 1), ("第二单元", "u2", 1), ("综合实践 生活中的分段计费", "segmented", 1),
        ("第三单元", "u3", 1), ("探索规律 二进制", "binary", 1), ("第4单元", "u4", 2),
        ("综合活动：神奇的黄金比", "golden", 2), ("第5单元", "u5", 2), ("综合活动：体育中的数学", "sports", 2),
        ("第6单元", "u6", 3), ("第7单元", "u7", 3),
    ]
    if paragraph.size >= 16:
        for prefix, section_id, day in chapters:
            if text.startswith(prefix):
                return section_id, "chapter", day
    if text.startswith("全书综合自测20题"):
        return "comprehensive", "comprehensive", 3
    if text.startswith("最后的公式与方法速查"):
        return "review", "review", None
    if text.startswith("学完了吗？"):
        return "checklist", "review", None
    return None


def add_text(blocks: list[dict], text: str, page: int, *, heading: bool = False, level: int = 3) -> None:
    if text:
        blocks.append({"type": "heading" if heading else "text", "text": text, "pdfPage": page, **({"level": level} if heading else {})})


def build_data(paragraphs: list[Paragraph], source: Path, audit: dict) -> dict:
    sections = [new_section("overview", "六上数学 · 三天完整学习册", "overview", 1, None)]
    current = sections[0]
    day = None
    question = None
    question_part = "question"
    formula = None
    counter = Counter()
    example_numbers = []
    consumed_paragraphs = 0

    def finish_question() -> None:
        nonlocal question, question_part
        if question is None:
            return
        if not question["question"] or not question["answer"]:
            raise ValueError(f"Incomplete question: {question['id']}")
        if question["category"] == "diagnostic":
            value = question["answer"].rstrip("。.")
            if re.fullmatch(r"\d+(?:\.\d+)?(?:/\d+)?", value):
                question["accepted"] = [value]
        current["blocks"].append(question)
        question = None
        question_part = "question"

    for paragraph in paragraphs:
        consumed_paragraphs += 1
        section_info = None if paragraph.marker else section_for(paragraph, day)
        if section_info:
            finish_question()
            formula = None
            section_id, kind, day = section_info
            current = new_section(section_id, paragraph.text, kind, paragraph.page, day)
            sections.append(current)
            continue
        for continued_page in range(paragraph.page, paragraph.last_page + 1):
            if continued_page not in current["sourcePages"]:
                current["sourcePages"].append(continued_page)
        if paragraph.marker:
            finish_question()
            current["blocks"].append(paragraph.marker)
            # Explanatory text is body content, not a duplicated drawing label.
            add_text(current["blocks"], paragraph.marker["caption"], paragraph.page)
            continue
        text = paragraph.text
        title_match = re.match(r"^(例题|诊断|自测|综合)\s*(\d+)\s*(.*)$", text)
        if title_match and paragraph.size >= 11.1:
            finish_question()
            marker, local_number, title = title_match.groups()
            category = {"例题": "example", "诊断": "diagnostic", "自测": "unit", "综合": "comprehensive"}[marker]
            counter[category] += 1
            ordinal = int(local_number) if category in ("example", "diagnostic", "comprehensive") else counter[category]
            if category == "example":
                example_numbers.append(ordinal)
            question = {
                "type": "example" if category == "example" else "quiz",
                "id": f"{category}-{ordinal:03d}",
                "label": f"{marker} {local_number}",
                "title": title if category not in ("diagnostic", "unit") else ("先修诊断" if category == "diagnostic" else "单元自测"),
                "question": title if category == "diagnostic" else "",
                "steps": [], "answer": "", "category": category, "pdfPage": paragraph.page,
            }
            question_part = "question"
            continue

        # All source question cards have their own answer; a title or heading
        # after an answer closes that card rather than swallowing chapter text.
        is_heading = paragraph.size >= 11.2
        if question is not None:
            if text.startswith(("答案：", "答案:")):
                question["answer"] = re.sub(r"^答案[：:]\s*", "", text)
                question_part = "answer"
                continue
            if text.startswith(("易错提醒：", "易错提醒:")):
                question["pitfall"] = re.sub(r"^易错提醒[：:]\s*", "", text)
                question_part = "pitfall"
                continue
            step_match = re.match(r"^\d+\.(?!\d)\s*(.*)$", text)
            if step_match:
                question["steps"].append(step_match[1])
                question_part = "steps"
                continue
            if not is_heading and not text.startswith(("•", "□")):
                if question["category"] == "diagnostic" and question_part == "answer":
                    question["steps"].append(text)
                elif question_part == "question":
                    question["question"] += text
                elif question_part == "steps" and question["steps"]:
                    question["steps"][-1] += text
                elif question_part in ("answer", "pitfall"):
                    question[question_part] += text
                else:
                    raise ValueError(f"Unclassified question paragraph: {question['id']} {text}")
                continue
            finish_question()

        if current["id"] == "review":
            if abs(paragraph.size - 11.3) < 0.2:
                formula = {"type": "formula", "title": text, "formula": "", "note": "", "pdfPage": paragraph.page}
                current["blocks"].append(formula)
                continue
            if formula and abs(paragraph.size - 11.0) < 0.2:
                formula["formula"] += text
                continue
            if formula and paragraph.size < 10:
                formula["note"] += text
                continue
        add_text(current["blocks"], text, paragraph.page, heading=is_heading, level=2 if paragraph.size >= 16 else 3)

    finish_question()
    stats = {
        "examples": counter["example"], "diagnostic": counter["diagnostic"], "unitQuiz": counter["unit"],
        "comprehensive": counter["comprehensive"], "answers": sum(counter.values()),
    }
    if stats != EXPECTED:
        raise ValueError(f"Question counts do not match the final booklet: {stats} != {EXPECTED}")
    if example_numbers != list(range(1, 118)):
        raise ValueError("The 117 source example labels are not contiguous and in their original order.")
    question_ids = [b["id"] for s in sections for b in s["blocks"] if b["type"] in ("example", "quiz")]
    if len(question_ids) != len(set(question_ids)):
        raise ValueError("Duplicate stable question IDs.")
    for section in sections:
        section["sourcePages"] = sorted(set(section["sourcePages"]))
    audit.update({"paragraphs": consumed_paragraphs, "sections": len(sections), "blocks": sum(len(s["blocks"]) for s in sections)})
    data = {"title": "国庆数学", "subtitle": "六上数学 · 三天完整学习册", "source": {"file": source.name, "pdfPages": audit["pdfPages"]}, "stats": stats, "sections": sections, "importAudit": audit}
    serialized = json.dumps(data, ensure_ascii=False)
    if "�" in serialized or "(cid:" in serialized:
        raise ValueError("Unmapped or replacement glyphs in imported content.")
    if set(audit["diagrams"]) != {item[2] for item in DIAGRAMS.values()}:
        raise ValueError("One or more native drawing placeholders are missing.")
    # Every recovered source paragraph must still appear in a display field.
    # Labels such as '答案：', step numbering and card counters are semantic
    # structure, so remove only those for the text-preservation comparison.
    all_display_text = []
    for section in sections:
        all_display_text.append(section["title"])
        for block in section["blocks"]:
            for field in ("text", "title", "label", "question", "answer", "pitfall", "formula", "note", "caption"):
                if field in block:
                    all_display_text.append(block[field])
            all_display_text.extend(block.get("steps", []))
    flattened = re.sub(r"\s+", "", "\n".join(all_display_text))
    for paragraph in paragraphs:
        if paragraph.marker:
            continue
        expected_text = re.sub(r"^(?:例题|诊断|自测|综合)\s*\d+\s*", "", paragraph.text)
        expected_text = re.sub(r"^(?:答案|易错提醒)[：:]\s*", "", expected_text)
        expected_text = re.sub(r"^\d+\.(?!\d)\s*", "", expected_text)
        expected_text = re.sub(r"\s+", "", expected_text)
        if expected_text and expected_text not in flattened:
            raise ValueError(f"Source paragraph not preserved on page {paragraph.page}: {paragraph.text}")
    audit["preservedSourceParagraphs"] = sum(not p.marker for p in paragraphs)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    lines, audit = read_lines(args.source)
    paragraphs = paragraphs_from(lines)
    data = build_data(paragraphs, args.source, audit)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "stats": data["stats"], "audit": data["importAudit"], "sections": [{"id": s["id"], "blocks": len(s["blocks"]), "pages": s["sourcePages"]} for s in data["sections"]]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
