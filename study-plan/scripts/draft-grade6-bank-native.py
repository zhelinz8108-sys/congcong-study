"""Conservative, answer-free native *drafts* from recorded public PDF rectangles.

No prompt string, answer file, environment file, network or learner record is read.
Every result remains candidate/unreviewed or pending. Nothing here is authoring
attestation or a release sidecar. Raster formula/diagram objects are NOT traced.

First subset: baseline text, simple one-level PDF fraction rules, verified Symbol
glyphs, and distinct original empty parentheses / underscore blanks. Unhandled
figures, tables, ambiguous mathematics or response boundaries stay pending.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

WORKSPACE = Path(__file__).resolve().parents[2]
APP = WORKSPACE / "study-plan"
sys.path.insert(0, str(WORKSPACE / "tmp/grade6-bank-import/sync/deps"))
import pymupdf as fitz

SYMBOL = {
    "\uf0b4": "×", "\uf0b8": "÷", "\uf03d": "=", "\uf02b": "+",
    "\uf02d": "-", "\uf03c": "<", "\uf03e": ">", "\uf0b0": "°",
    "\uf070": "π", "\uf028": "(", "\uf029": ")",
}
MATH_TEX = {"×": r"\times", "÷": r"\div", "π": r"\pi", "°": r"{}^\circ", "≤": r"\le", "≥": r"\ge", "≠": r"\ne", "−": "-"}
LABEL = re.compile(r"^【(?:典型例题|典例精讲|变式训练|对应练习|基础通关|能力提升|例题|例|练习)\s*\d*】")
ANSWER_MARKER = re.compile(r"【(?:答案|解析)】|参考答案|答案解析|正确答案|(?:^|\n)\s*(?:解[:：]|答[:：])")
PRIVATE_USE = re.compile(r"[\uE000-\uF8FF\uFFFD]")
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
SOURCE_FOOTER = re.compile(r"101\s*数学创作社")
MULTI_RESULT = re.compile(r"分别|各(?:是|有|得|分得|需|用|应)?(?:多少|几)|各(?:占|为|约为)")
PAPER_NUMBER = re.compile(r"^(\d{1,4})[．.、](?!\d)")


class Pending(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


@dataclass
class Token:
    kind: str
    value: str
    x0: float
    x1: float
    baseline: float
    size: float
    source: set[int] = field(default_factory=set)


def json_read(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def intersects(a, b, padding=0.0):
    """Inclusive stroke-aware intersection; PDF line rects can have zero area."""
    return a[0] - padding <= b[2] and a[2] + padding >= b[0] and a[1] - padding <= b[3] and a[3] + padding >= b[1]


def raw_chars(page, rect):
    result = []
    raw = page.get_text("rawdict", clip=fitz.Rect(rect))
    for block in raw["blocks"]:
        if block.get("type") == 1:
            # MuPDF can return an out-of-clip image with an inverted bbox after
            # clipping. The authoritative get_image_info check is performed in
            # draft(); do not mistake page-header pixels for question content.
            box = block.get("bbox")
            if box and box[2] > box[0] and box[3] > box[1] and intersects(box, rect):
                raise Pending("raster-object-in-original-rectangle")
            continue
        for line in block.get("lines", []):
            if tuple(round(x, 3) for x in line.get("dir", (1, 0))) != (1, 0):
                raise Pending("rotated-or-vertical-text")
            for span in line["spans"]:
                font = span["font"]
                for item in span["chars"]:
                    value = item["c"]
                    if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
                        raise Pending("unmapped-surrogate-font-glyph")
                    if PRIVATE_USE.search(value):
                        if "symbol" in font.lower() and value in SYMBOL:
                            value = SYMBOL[value]
                        else:
                            raise Pending("unmapped-font-glyph")
                    if any(ord(c) < 32 and not c.isspace() for c in value):
                        raise Pending("unmapped-control-glyph")
                    result.append({
                        "id": len(result), "c": value, "font": font, "size": span["size"],
                        "bbox": list(item["bbox"]), "baseline": item["origin"][1],
                    })
    if not result or sum(not c["c"].isspace() for c in result) < 3:
        raise Pending("no-usable-native-question-text")
    return result


def vector_items(page, rect):
    items = []
    for drawing in page.get_drawings():
        width = drawing.get("width", 1) or 0
        if not intersects(list(drawing["rect"]), rect, max(0.3, width / 2)):
            continue
        for item in drawing.get("items", []):
            code = item[0]
            if code == "l":
                a, b = item[1], item[2]
                box = [min(a.x, b.x), min(a.y, b.y), max(a.x, b.x), max(a.y, b.y)]
                if intersects(box, rect, max(0.3, width / 2)):
                    items.append({"kind": "line", "a": [a.x, a.y], "b": [b.x, b.y], "width": width, "box": box})
            elif code == "re":
                box = list(item[1])
                if intersects(box, rect, max(0.3, width / 2)):
                    # Thin filled rectangles sometimes encode the fraction rule.
                    if box[3] - box[1] <= 1.5:
                        y = (box[1] + box[3]) / 2
                        items.append({"kind": "line", "a": [box[0], y], "b": [box[2], y], "width": max(width, box[3] - box[1]), "box": box})
                    else:
                        items.append({"kind": "unsupported", "box": box})
            else:
                # Curves / arbitrary paths / quadrilaterals need diagram authoring.
                items.append({"kind": "unsupported", "box": list(drawing["rect"])})
    return items


def closest_digit_row(chars, x0, x1, y, above):
    values = []
    for c in chars:
        if c["c"].isspace():
            continue
        box = c["bbox"]
        center_x = (box[0] + box[2]) / 2
        # Origin-baseline distance, not font bbox, separates stacked fractions.
        delta = c["baseline"] - y
        if x0 - 1.2 <= center_x <= x1 + 1.2 and (-15 <= delta <= -1.0 if above else 3 <= delta <= 17):
            values.append(c)
    if not values:
        return []
    target = max(c["baseline"] for c in values) if above else min(c["baseline"] for c in values)
    row = [c for c in values if abs(c["baseline"] - target) < 1.8]
    row.sort(key=lambda c: c["bbox"][0])
    if any(not re.fullmatch(r"[A-Za-z0-9+\-]", c["c"]) for c in row):
        return []
    if any(b["bbox"][0] - a["bbox"][2] > 2.5 for a, b in zip(row, row[1:])):
        return []
    return row


def recover_tokens(chars, drawings):
    used, tokens, horizontal_blanks = set(), [], []
    for item in drawings:
        if item["kind"] != "line":
            raise Pending("native-diagram-or-table-needs-reconstruction")
        (x0, y0), (x1, y1) = item["a"], item["b"]
        if abs(y1 - y0) > 0.2 or item["width"] > 2:
            raise Pending("native-diagram-or-table-needs-reconstruction")
        x0, x1 = min(x0, x1), max(x0, x1)
        y = (y0 + y1) / 2
        numerator = closest_digit_row(chars, x0, x1, y, True)
        denominator = closest_digit_row(chars, x0, x1, y, False)
        if numerator and denominator and 3 <= x1 - x0 <= 70:
            ids = {c["id"] for c in numerator + denominator}
            if ids & used:
                raise Pending("overlapping-or-nested-fraction")
            top = "".join(c["c"] for c in numerator)
            bottom = "".join(c["c"] for c in denominator)
            if bottom in {"0", "+0", "-0"}:
                raise Pending("zero-fraction-denominator-in-source")
            nearby = [c for c in chars if c["id"] not in ids and not c["c"].isspace() and abs(c["baseline"] - y) <= 7]
            baseline = min(nearby, key=lambda c: abs(c["baseline"] - (y + 4)))["baseline"] if nearby else y + 4
            size = max(c["size"] for c in numerator + denominator)
            tokens.append(Token("math", rf"\frac{{{top}}}{{{bottom}}}", x0, x1, baseline, size, ids))
            used.update(ids)
        elif 16 <= x1 - x0 <= 140 and item["width"] <= 1.5:
            # An underline is a blank only if it sits below an ordinary text row
            # and occupies a genuinely empty horizontal space on that baseline.
            rows = [c for c in chars if not c["c"].isspace() and 0 <= y - c["baseline"] <= 4]
            if not rows:
                raise Pending("unbound-horizontal-vector")
            baseline = min(rows, key=lambda c: abs(c["baseline"] - y))["baseline"]
            inside = [c for c in chars if not c["c"].isspace() and abs(c["baseline"] - baseline) < 2 and c["bbox"][0] < x1 - 1 and c["bbox"][2] > x0 + 1]
            if inside:
                raise Pending("unbound-horizontal-vector")
            horizontal_blanks.append(Token("blank", "", x0, x1, baseline, 12, set()))
        else:
            raise Pending("unbound-horizontal-vector")
    for c in chars:
        if c["id"] not in used and not c["c"].isspace():
            box = c["bbox"]
            tokens.append(Token("char", c["c"], box[0], box[2], c["baseline"], c["size"], {c["id"]}))
    tokens.extend(horizontal_blanks)
    # Any unrecovered small glyph baseline, superscript, or stacked number must
    # not be flattened into a plausible-looking but wrong linear expression.
    for token in tokens:
        if token.kind == "char" and re.fullmatch(r"[0-9A-Za-z]", token.value):
            close = [t for t in tokens if t is not token and abs(t.baseline - token.baseline) <= 2.5 and abs(t.x0 - token.x0) < 50]
            other_rows = [t for t in tokens if t is not token and abs(t.baseline - token.baseline) > 3 and abs(t.x0 - token.x0) < 6 and abs(t.baseline - token.baseline) < 19]
            if not close and other_rows:
                raise Pending("unresolved-stacked-or-superscript-glyph")
    return tokens


def group_lines(tokens):
    lines = []
    for token in sorted(tokens, key=lambda t: (t.baseline, t.x0)):
        matches = [line for line in lines if abs(line[0].baseline - token.baseline) <= 2.5]
        if matches:
            min(matches, key=lambda line: abs(line[0].baseline - token.baseline)).append(token)
        else:
            lines.append([token])
    for line in lines:
        line.sort(key=lambda t: t.x0)
        for a, b in zip(line, line[1:]):
            if a.kind != "blank" and b.kind != "blank" and a.x1 > b.x0 + min(a.size, b.size) * 0.65:
                raise Pending("overlapping-native-character-order")
    return lines


def strip_source_label(lines):
    if not lines:
        return set()
    first = lines[0]
    joined = "".join(t.value if t.kind == "char" else "\ufffc" for t in first)
    match = LABEL.match(joined)
    if not match:
        return set()
    count, removed = len(match.group()), set()
    if any(t.kind != "char" for t in first[:count]):
        raise Pending("ambiguous-source-label")
    for token in first[:count]:
        removed.update(token.source)
    del first[:count]
    return removed


def bind_blanks(lines):
    for line in lines:
        index = 0
        while index < len(line):
            token = line[index]
            if token.kind == "char" and token.value in {"(", "（"}:
                if index + 1 < len(line) and line[index + 1].kind == "char" and line[index + 1].value in {")", "）"}:
                    right = line[index + 1]
                    # A tiny empty parenthesis can be punctuation, not an answer.
                    if right.x0 - token.x1 < 7:
                        raise Pending("ambiguous-empty-parenthesis")
                    line[index:index + 2] = [Token("blank", "", token.x0, right.x1, token.baseline, token.size, token.source | right.source)]
            if token.kind == "char" and token.value == "_":
                end = index + 1
                while end < len(line) and line[end].kind == "char" and line[end].value == "_":
                    end += 1
                run = line[index:end]
                line[index:end] = [Token("blank", "", run[0].x0, run[-1].x1, run[0].baseline, run[0].size, set().union(*(t.source for t in run)))]
            index += 1
    count = sum(t.kind == "blank" for line in lines for t in line)
    if count > 60:
        raise Pending("too-many-unreviewed-blanks")
    return count


def textual(lines):
    return "\n".join("".join(t.value if t.kind == "char" else "□" if t.kind == "blank" else "[fraction]" for t in line) for line in lines)


def guard_source_layout(lines):
    """Reject suspicious placement without guessing a new formula position."""
    visible = [line for line in lines if line]
    body = textual(visible)
    if SOURCE_FOOTER.search(body):
        raise Pending("source-footer-in-question-region")
    if (visible and all(t.kind == "math" for t in visible[0])
            and any(re.search(r"[\u4e00-\u9fff]", "".join(t.value for t in line)) for line in visible[1:])):
        # Full character coverage cannot establish a sentence's inline formula
        # order. A detached leading fraction row needs visual reconstruction.
        raise Pending("detached-leading-formula-row-needs-review")


def retained_paper_number(lines):
    """Diagnose only a clearly printed numeric prefix; never remove it here."""
    first = next((line for line in lines if line), [])
    value = "".join(t.value if t.kind == "char" else "\ufffc" for t in first)
    match = PAPER_NUMBER.match(value)
    return match.group() if match else None


def candidate_output_scope(base_output, record_ids, focused, include_verified, audit_digest, script_digest):
    if not focused:
        return base_output, {"kind": "full", "selectedRecordCount": len(record_ids)}
    fingerprint = sha256(json.dumps({
        "ids": record_ids, "includeVerified": include_verified,
        "auditSha256": audit_digest, "scriptSha256": script_digest,
    }, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()[:20]
    return base_output / "focused" / fingerprint, {
        "kind": "focused", "selectedRecordCount": len(record_ids), "fingerprint": fingerprint,
    }


def source_options(lines):
    # Only clearly printed, complete A/B/C(/D) option markers are recognized.
    value = textual(lines)
    found = re.findall(r"(?<![A-Za-z])([A-D])[．.、:：]", value)
    if not found:
        return []
    if len(found) != len(set(found)):
        raise Pending("repeated-or-ambiguous-choice-label")
    options = sorted(found)
    if options not in [["A", "B"], ["A", "B", "C"], ["A", "B", "C", "D"]]:
        raise Pending("incomplete-choice-options")
    return options


def to_blocks(lines, original_inputs):
    guard_source_layout(lines)
    blank_count = bind_blanks(lines)
    options = source_options(lines)
    if options and blank_count != 1:
        raise Pending("choice-multiple-or-missing-original-blanks")
    if not options and blank_count == 1 and len(original_inputs) == 1 and original_inputs[0].get("kind") == "choice":
        known = original_inputs[0].get("choices", [])
        if known and set(known) <= {"√", "×", "对", "错", "正确", "错误", "是", "否"}:
            # A judgement question normally prints only an empty parenthesis.
            # Reuse its public UI labels, not an answer key or the broken prompt.
            options = known
        else:
            raise Pending("printed-choice-options-not-recovered")
    if options:
        field_id = original_inputs[0]["id"] if len(original_inputs) == 1 else "answer"
        inputs = [{"id": field_id, "label": "选择一个选项", "kind": "choice", "choices": options}]
    elif blank_count:
        ids = [original_inputs[0]["id"]] if blank_count == 1 and len(original_inputs) == 1 else [f"blank-{i + 1}" for i in range(blank_count)]
        inputs = [{"id": value, "label": f"第 {i + 1} 空" if blank_count > 1 else "答案", "kind": "text"} for i, value in enumerate(ids)]
    else:
        body = textual(lines)
        if MULTI_RESULT.search(body) or body.count("？") + body.count("?") > 1:
            raise Pending("unresolved-multiple-result-response-boundaries")
        if len(original_inputs) != 1 or re.search(r"[（(][1-9][）)]|①|②|分别|各题|口算", body):
            raise Pending("unresolved-independent-response-boundaries")
        math_only = sum(not re.search(r"[\u4e00-\u9fff]", "".join(t.value for t in line)) for line in lines if line)
        if math_only > 1 or not re.search(r"多少|几分之几|解答|表示.*意义|计算|画", body):
            raise Pending("no-reliable-response-field-binding")
        if "画" in body:
            raise Pending("drawing-response-needs-native-authoring")
        inputs = [{"id": original_inputs[0]["id"], "label": "作答", "kind": "text"}]
    blocks, field_index = [], 0
    for line in lines:
        if not line:
            continue
        content, text_value, previous = [], "", None
        def flush():
            nonlocal text_value
            if text_value:
                content.append({"type": "text", "value": text_value})
                text_value = ""
        for token in line:
            if token.kind == "char" and token.value not in MATH_TEX:
                if previous and previous.kind == "char" and re.fullmatch(r"[A-Za-z]", previous.value) and re.fullmatch(r"[A-Za-z]", token.value) and token.x0 - previous.x1 > max(1.6, token.size * 0.20):
                    text_value += " "
                text_value += token.value
            else:
                flush()
                if token.kind == "blank":
                    content.append({"type": "blank", "fieldId": inputs[field_index]["id"]})
                    field_index += 1
                else:
                    content.append({"type": "math", "tex": token.value if token.kind == "math" else MATH_TEX[token.value]})
            previous = token
        flush()
        blocks.append({"type": "paragraph", "content": content})
    if blank_count == 0:
        blocks.append({"type": "response", "fieldId": inputs[0]["id"], "multiline": True})
    if not blocks or (blank_count and field_index != len(inputs)):
        raise Pending("input-reference-count-mismatch")
    return inputs, {"version": 1, "blocks": blocks}


def self_test():
    def c(i, value, x, baseline=24):
        return {"id": i, "c": value, "font": "Times", "size": 10, "bbox": [x, baseline - 10, x + 5, baseline + 2], "baseline": baseline}
    chars = [c(0, "3", 4, 16), c(1, "1", 1, 30), c(2, "0", 6, 30), c(3, "的", 15), c(4, "(", 30), c(5, ")", 65)]
    bar = {"kind": "line", "a": [0, 20], "b": [12, 20], "width": 0.5, "box": [0, 20, 12, 20]}
    tokens = recover_tokens(chars, [bar])
    assert tokens[0].kind == "math" and tokens[0].value == r"\frac{3}{10}"
    inputs, native = to_blocks(group_lines(tokens), [{"id": "answer-1", "kind": "text"}])
    assert inputs[0]["id"] == "answer-1"
    assert sum(n["type"] == "blank" for b in native["blocks"] for n in b.get("content", [])) == 1
    lines = [[Token("char", value, i * 12, i * 12 + 5, 24, 10, {i}) for i, value in enumerate("()，()")]]
    # Widen both original empty parentheses before binding.
    lines[0][1].x0, lines[0][1].x1 = 25, 30
    lines[0][3].x0, lines[0][3].x1 = 50, 55
    lines[0][4].x0, lines[0][4].x1 = 80, 85
    multi, _ = to_blocks(lines, [{"id": "old-catch-all", "kind": "text"}])
    assert [i["id"] for i in multi] == ["blank-1", "blank-2"]
    try:
        recover_tokens(chars, [bar, bar])
        raise AssertionError("duplicate fraction must fail")
    except Pending as issue:
        assert issue.reason == "overlapping-or-nested-fraction"
    try:
        recover_tokens(chars, [{"kind": "unsupported", "box": [0, 0, 10, 10]}])
        raise AssertionError("unhandled geometry must fail")
    except Pending as issue:
        assert issue.reason == "native-diagram-or-table-needs-reconstruction"
    def plain(value):
        return [Token("char", character, index * 12, index * 12 + 5, 24, 10, {index}) for index, character in enumerate(value)]
    def expect_pending(callback, reason):
        try:
            callback()
            raise AssertionError(f"Expected pending: {reason}")
        except Pending as issue:
            assert issue.reason == reason, issue.reason
    fraction = Token("math", r"\frac{1}{3}", 150, 162, 18, 10, {100})
    expect_pending(lambda: guard_source_layout([[fraction], plain("甲生产了这批零件的后，求多少个？")]), "detached-leading-formula-row-needs-review")
    expect_pending(lambda: guard_source_layout([plain("解答多少元？"), plain("101数学创作社")]), "source-footer-in-question-region")
    expect_pending(lambda: to_blocks([plain("甲、乙两数各是多少？")], [{"id": "answer", "kind": "text"}]), "unresolved-multiple-result-response-boundaries")
    expect_pending(lambda: to_blocks([plain("两校各有多少人？")], [{"id": "answer", "kind": "text"}]), "unresolved-multiple-result-response-boundaries")
    expect_pending(lambda: to_blocks([plain("甲有多少？乙有多少？")], [{"id": "answer", "kind": "text"}]), "unresolved-multiple-result-response-boundaries")
    # Ordinary single-result question and explicitly independent original blanks
    # remain eligible; decimal values are not mistaken for paper numbering.
    to_blocks([plain("两人各走了一段路，甲乙速度之比是多少？")], [{"id": "answer", "kind": "text"}])
    split_results, _ = to_blocks([plain("甲、乙各有多少？甲()、乙()")], [{"id": "old-combined", "kind": "text"}])
    assert len(split_results) == 2
    assert retained_paper_number([plain("12．长方形周长是多少？")]) == "12．"
    assert retained_paper_number([plain("0.25的倒数")]) is None
    base = Path("memory-only-candidate-scope")
    full, meta = candidate_output_scope(base, ["q1", "q2"], False, False, "audit", "script")
    focused, focus_meta = candidate_output_scope(base, ["q1"], True, False, "audit", "script")
    changed, _ = candidate_output_scope(base, ["q2"], True, False, "audit", "script")
    refreshed, _ = candidate_output_scope(base, ["q1"], True, False, "new-audit", "script")
    upgraded, _ = candidate_output_scope(base, ["q1"], True, False, "audit", "new-script")
    assert full == base and meta["kind"] == "full"
    assert focused.parent == base / "focused" and focus_meta["kind"] == "focused"
    assert focused != changed and focused != refreshed and focused != upgraded and focused != base
    print(json.dumps({"passed": True, "checks": ["one-level fraction rule", "original one-field ID", "independent original blanks", "overlapping fractions rejected", "unsupported geometry pending", "detached leading formula row rejected", "source footer rejected", "multiple-result response boundaries rejected", "single ratio result allowed", "paper-number diagnostic / decimal distinction", "focused outputs isolated by ID / audit / script scope"], "verifiedByThisScript": 0, "studentWrites": 0}))


def draft(record, original_inputs, docs):
    if record.get("scanned"):
        raise Pending("scanned-source-needs-manual-transcription")
    if record.get("hasRaster") or any(s.get("hasRaster") for s in record["segments"]):
        raise Pending("raster-object-in-original-rectangle")
    if record.get("sourceInspectionWarningCount"):
        raise Pending("source-pdf-object-warning-needs-review")
    all_lines, all_chars, covered, removed, fraction_count = [], [], set(), set(), 0
    for part, segment in enumerate(record["segments"]):
        filename = segment.get("sourcePdf", record["sourcePdf"])
        if filename not in docs:
            docs[filename] = fitz.open(filename)
        page = docs[filename][segment["page"] - 1]
        rect = segment["rect"]
        # Recheck the PDF, not just a potentially stale audit classification.
        if any(intersects(list(image["bbox"]), rect) for image in page.get_image_info()):
            raise Pending("raster-object-in-original-rectangle")
        chars = raw_chars(page, rect)
        offset = len(all_chars)
        for c in chars:
            c["id"] += offset
        all_chars.extend(chars)
        tokens = recover_tokens(chars, vector_items(page, rect))
        fraction_count += sum(t.kind == "math" for t in tokens)
        lines = group_lines(tokens)
        if part == 0:
            removed.update(strip_source_label(lines))
        all_lines.extend(lines)
        for line in lines:
            for token in line:
                if covered & token.source:
                    raise Pending("duplicate-native-character-consumption")
                covered.update(token.source)
    expected = {c["id"] for c in all_chars if not c["c"].isspace()}
    if expected != covered | removed:
        raise Pending("native-character-coverage-mismatch")
    if ANSWER_MARKER.search(textual(all_lines)):
        raise Pending("possible-answer-text-in-source-region")
    # Native charts / layout tables are never flattened into prose.
    if any(re.search(r"如下表|下表|填表|统计表|数轴|看图|图中|下面.*图|右图|左图", "".join(t.value for t in line)) for line in all_lines):
        raise Pending("figure-or-table-reference-needs-reconstruction")
    inputs, native = to_blocks(all_lines, original_inputs)
    paper_number = retained_paper_number(all_lines)
    return inputs, native, {
        "nativeCharacterCount": len(expected), "coveredCharacterCount": len(covered),
        "removedSourceLabelCharacterCount": len(removed), "recoveredSimpleFractions": fraction_count,
        "pdfLineCount": len(all_lines), "independentFieldCount": len(inputs),
        "paperQuestionNumberRetained": paper_number is not None,
        "paperQuestionNumberMarker": paper_number,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, default=WORKSPACE / "tmp/grade6-bank-native/audit.json")
    parser.add_argument("--output", type=Path, default=WORKSPACE / "tmp/grade6-bank-native/candidates")
    parser.add_argument("--ids", help="comma-separated IDs, only for focused local draft QA")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--include-verified", action="store_true", help="regenerate draft for known native rows as a regression check; never attest")
    parser.add_argument("--self-test", action="store_true", help="pure in-memory regression checks, no PDFs or output files")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive integer")
    output = args.output.resolve()
    allowed = (WORKSPACE / "tmp/grade6-bank-native").resolve()
    if output != allowed / "candidates" and allowed not in output.parents:
        parser.error("Candidate outputs must remain under workspace/tmp/grade6-bank-native")
    index = json_read(args.audit)
    # Inputs only. Deliberately do NOT read q['prompt'] or q['title'] here.
    public = json_read(APP / "content/grade6-bank/questions.public.json")
    by_id = {q["id"]: q["inputs"] for q in public}
    chosen = set(args.ids.split(",")) if args.ids else None
    records = [r for r in index["records"] if chosen is None or r["id"] in chosen]
    if chosen and chosen - {r["id"] for r in records}:
        parser.error("Unknown question ID")
    if args.limit is not None:
        records = records[:args.limit]
    record_ids = [r["id"] for r in records]
    if len(record_ids) != len(set(record_ids)):
        parser.error("Duplicate question IDs in audit selection")
    focused = chosen is not None or args.limit is not None or args.include_verified or set(record_ids) != set(by_id)
    output, scope = candidate_output_scope(output, record_ids, focused, args.include_verified,
        sha256(args.audit.read_bytes()).hexdigest(), sha256(Path(__file__).read_bytes()).hexdigest())
    output.mkdir(parents=True, exist_ok=True)
    counts, failures, rows, docs, hashes = Counter(), Counter(), [], {}, {}
    fitz.TOOLS.mupdf_display_errors(False)
    fitz.TOOLS.mupdf_display_warnings(False)
    fitz.TOOLS.mupdf_warnings()  # Clear old warning buffer; capture this run below.
    for record in records:
        qid = record["id"]
        if not IDENTIFIER.fullmatch(qid) or qid not in by_id:
            raise ValueError("Invalid index question ID")
        if record.get("verifiedNative") and not args.include_verified:
            counts["already-verified-not-regenerated"] += 1
            continue
        filename = record["sourcePdf"]
        if filename not in hashes:
            hashes[filename] = sha256(Path(filename).read_bytes()).hexdigest()
        result = {
            "version": 1, "id": qid, "status": "pending", "reviewStatus": "unreviewed",
            "notReleaseArtifact": True, "containsPrivateAnswers": False,
            "source": {"pdf": filename, "pdfSha256": hashes[filename], "segments": [{"page": s["page"], "rect": s["rect"]} for s in record["segments"]]},
        }
        try:
            inputs, native, diagnostics = draft(record, by_id[qid], docs)
            warnings = fitz.TOOLS.mupdf_warnings()
            if warnings.strip():
                raise Pending("source-pdf-object-warning-needs-review")
            result.update({"status": "candidate", "inputs": inputs, "native": native, "diagnostics": diagnostics})
            counts["candidate-unreviewed"] += 1
        except Pending as issue:
            fitz.TOOLS.mupdf_warnings()
            result["reasons"] = [issue.reason]
            counts["pending"] += 1
            failures[issue.reason] += 1
        except Exception as issue:
            fitz.TOOLS.mupdf_warnings()
            result["reasons"] = ["pdf-extraction-error-needs-review"]
            result["errorType"] = type(issue).__name__
            counts["pending"] += 1
            failures["pdf-extraction-error-needs-review"] += 1
        (output / f"{qid}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        rows.append({"id": qid, "status": result["status"], "reasons": result.get("reasons", [])})
    for doc in docs.values():
        doc.close()
    summary = {
        "version": 1, "scope": scope, "outputDirectory": str(output),
        "counts": dict(counts), "failureReasons": dict(failures), "rows": rows,
        "releaseReady": False, "verifiedByThisScript": 0, "privateAnswerFilesRead": 0, "studentWrites": 0,
        "notes": ["Unreviewed candidates require visual comparison to every original source region and paired answer before authoring.", "Unsupported tables/figures are pending, never silently flattened.", "No private answers or grading rules are generated.", "Zero-area PDF line rectangles are inspected with stroke-aware intersection.", "Focused runs are isolated under scope-specific subdirectories; only this summary's rows belong to this run.", "Printed paper question numbers are retained and explicitly diagnosed, never guessed away.", "Detached formula rows, source footers and unsplit multiple results require manual reconstruction."],
    }
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
