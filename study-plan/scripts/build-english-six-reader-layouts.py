"""Recover native grammar tables without changing source blocks or question anchors."""
import hashlib
import json
import re
import unicodedata
from pathlib import Path

import pdfplumber

APP = Path(__file__).resolve().parents[1]
ROOT = APP / "content" / "english-six"
SOURCE = APP.parent / "六上" / "英语"


def compact(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))


def join_lines(text):
    lines = [re.sub(r"\s+", " ", s).strip() for s in (text or "").splitlines() if s.strip()]
    result = ""
    for line in lines:
        space = bool(result) and not (re.search(r"[\u3400-\u9fff]$", result) and re.match(r"[\u3400-\u9fff]", line))
        if result.endswith("-") and re.match(r"[a-z]", line):
            space = False
        result += (" " if space else "") + line
    return result


def table_range(blocks, pdf_page, table):
    lines = pdf_page.crop(table.bbox).extract_text_lines()
    target = compact("".join(line["text"] for line in lines))
    first = compact(lines[0]["text"])
    for start, block in enumerate(blocks):
        if block["kind"] != "text" or compact(block["text"]) != first:
            continue
        value = ""
        for end in range(start, len(blocks)):
            if blocks[end]["kind"] != "text":
                break
            value += compact(blocks[end]["text"])
            if len(value) >= len(target):
                if value == target:
                    return start, end + 1
                break
    raise ValueError(f"Cannot safely map table text: {first} / {target[:160]}")


def build():
    index = json.loads((ROOT / "index.json").read_text(encoding="utf-8"))
    manifest = {}
    for meta in index["resources"]:
        if "易错语法讲义" not in meta["title"]:
            continue
        raw = (ROOT / "resources" / f"{meta['id']}.json").read_bytes()
        resource = json.loads(raw)
        outline = []
        for p, page in enumerate(resource["pages"]):
            for b, block in enumerate(page["blocks"]):
                match = re.search(r"高频易错点\s*(\d+)\s*[：:]\s*(.+)", block.get("text", ""))
                if not match:
                    continue
                title, end = match[2].strip(), b + 1
                while end < len(page["blocks"]) and "易错精讲" not in page["blocks"][end].get("text", ""):
                    assert end - b < 3, "Review unexpected wrapped topic heading"
                    title = join_lines(title + "\n" + page["blocks"][end]["text"])
                    end += 1
                destination = p + 2 if end == len(page["blocks"]) else p + 1
                outline.append({"number": int(match[1]), "title": title, "page": p + 1,
                                "block": b, "end": end, "destination": destination})
        assert [x["number"] for x in outline] == [1, 2, 3]
        pages = {}
        with pdfplumber.open(SOURCE / meta["paths"][0]) as pdf:
            assert len(pdf.pages) == len(resource["pages"])
            for p, pdf_page in enumerate(pdf.pages):
                tables = []
                blocks = resource["pages"][p]["blocks"]
                for table in pdf_page.find_tables():
                    rows = table.extract()
                    if len(rows) < 2 or max(map(len, rows)) < 2 or table.bbox[3] > pdf_page.height + 2:
                        continue
                    start, end = table_range(blocks, pdf_page, table)
                    cleaned = [[join_lines(cell) for cell in row] for row in rows]
                    assert all(len(row) == len(cleaned[0]) for row in cleaned)
                    assert all(any(cell for cell in row) for row in cleaned)
                    tables.append({"start": start, "end": end, "rows": cleaned,
                                   "signature": "".join(blocks[n]["text"] for n in range(start, end))})
                if tables:
                    pages[str(p + 1)] = {"tables": tables}
        assert sum(len(p["tables"]) for p in pages.values()) == 3, meta["id"]
        manifest[meta["id"]] = {"sourceSha256": hashlib.sha256(raw).hexdigest(), "outline": outline, "pages": pages}
        print(json.dumps({"resource": meta["id"], "topics": len(outline), "tables": 3}, ensure_ascii=False), flush=True)
    assert len(manifest) == 8
    target = APP / "src" / "data" / "english-six-reader-layouts.public.json"
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Recovered 24 grammar tables and 24 topic headings; raw resources are unchanged.")


if __name__ == "__main__":
    build()
