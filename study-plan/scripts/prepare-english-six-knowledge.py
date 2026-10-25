#!/usr/bin/env python3
"""Convert reviewed unit articles into native data; never log lesson text."""
import argparse
import hashlib
import json
import os
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


class Element:
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def has_class(self, name):
        return name in self.attrs.get("class", "").split()


class Document(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in self.VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if len(self.stack) < 2 or self.stack[-1].tag != tag:
            raise ValueError("Input HTML has mismatched structural tags")
        self.stack.pop()

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def descendants(element, tag=None):
    for child in element.children:
        if isinstance(child, Element):
            if tag is None or child.tag == tag:
                yield child
            yield from descendants(child, tag)


def plain(element):
    return "".join(child if isinstance(child, str) else "\n" if child.tag == "br" else plain(child) for child in element.children)


def elements(element):
    result = []
    for child in element.children:
        if isinstance(child, str):
            if child.strip():
                raise ValueError("Unexpected text outside a native block")
        else:
            result.append(child)
    return result


def inline(element):
    result = []

    def append(text, flags):
        if not text:
            return
        if result and {key: value for key, value in result[-1].items() if key != "text"} == flags:
            result[-1]["text"] += text
        else:
            result.append({"text": text, **flags})

    def visit(node, flags):
        if isinstance(node, str):
            append(node, flags)
            return
        if node.tag == "br":
            append("\n", flags)
            return
        if node.tag not in {"p", "td", "th", "b", "strong", "i", "em", "u", "span"}:
            raise ValueError("Unsupported inline element")
        flags = dict(flags)
        if node.tag in {"b", "strong"}:
            flags["bold"] = True
        if node.tag in {"i", "em"}:
            flags["italic"] = True
        if node.tag == "u":
            flags["underline"] = True
        if node.has_class("ipa"):
            flags["ipa"] = True
        for child in node.children:
            visit(child, flags)

    visit(element, {})
    return result


def runs_text(runs):
    return "".join(run["text"] for run in runs)


def row(element):
    cells = elements(element)
    if not cells or any(cell.tag not in {"td", "th"} or cell.attrs.get("colspan", "1") != "1" or cell.attrs.get("rowspan", "1") != "1" for cell in cells):
        raise ValueError("Unsupported table cell layout")
    return [inline(cell) for cell in cells]


def convert_table(element):
    headers = None
    rows = []
    for child in elements(element):
        if child.tag == "colgroup":
            continue
        if child.tag == "thead":
            head_rows = elements(child)
            if headers is not None or len(head_rows) != 1 or head_rows[0].tag != "tr":
                raise ValueError("Native tables require one explicit header row")
            headers = row(head_rows[0])
        elif child.tag in {"tbody", "tfoot"}:
            for item in elements(child):
                if item.tag != "tr":
                    raise ValueError("Unexpected table body element")
                rows.append(row(item))
        elif child.tag == "tr":
            rows.append(row(child))
        else:
            raise ValueError("Unsupported table element")
    width = len(headers) if headers is not None else len(rows[0]) if rows else 0
    if not width or any(len(cells) != width for cells in rows):
        raise ValueError("Table row widths differ")
    return {"kind": "table", **({"headers": headers} if headers is not None else {}), "rows": rows}


def source_caption(element, source_titles):
    return element.tag == "p" and " ".join(plain(element).split()) in source_titles


def convert_section(element, removed, source_titles, relocated):
    children = elements(element)
    if not children or children[0].tag != "h2":
        raise ValueError("Missing section title")
    title = re.sub(r"^\d+\.\d+\s*", "", plain(children[0]).strip())
    result = {"id": element.attrs["id"], "title": title, "blocks": []}
    for child in children[1:]:
        if child.tag in {"h3", "h4"}:
            result["blocks"].append({"kind": "heading", "level": int(child.tag[1]), "text": plain(child)})
        elif child.tag == "p":
            if plain(child).strip() == "练":
                removed.append(result["id"])
                continue
            if not plain(child).strip():
                continue
            if source_caption(child, source_titles):
                relocated.append(result["id"])
                continue
            result["blocks"].append({"kind": "paragraph", "runs": inline(child), **({"tone": "note"} if child.has_class("knowledge-note") else {})})
        elif child.tag == "table":
            result["blocks"].append(convert_table(child))
        elif child.tag == "div" and child.has_class("comparison"):
            paragraphs = elements(child)
            if not paragraphs or any(p.tag != "p" for p in paragraphs):
                raise ValueError("Unsupported comparison layout")
            result["blocks"].append({"kind": "callout", "paragraphs": [inline(p) for p in paragraphs]})
        else:
            raise ValueError("Unsupported native block element")
    return result


def source_visible(section, source_titles):
    # This walk is independent of the native block conversion. It includes all
    # table cells and line breaks, but excludes the section's separate h2 title.
    children = elements(section)[1:]
    return [plain(child) for child in children if not (child.tag == "p" and plain(child).strip() in {"", "练"}) and not source_caption(child, source_titles)]


def native_visible(section):
    result = []
    for block in section["blocks"]:
        if block["kind"] == "heading":
            result.append(block["text"])
        elif block["kind"] == "paragraph":
            result.append(runs_text(block["runs"]))
        elif block["kind"] == "callout":
            result.append("".join(runs_text(runs) for runs in block["paragraphs"]))
        else:
            rows = ([block["headers"]] if "headers" in block else []) + block["rows"]
            result.append("".join(runs_text(cell) for row in rows for cell in row))
    return result


def digest(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value, pretty=False):
    return json.dumps(value, ensure_ascii=False, indent=2 if pretty else None, separators=None if pretty else (",", ":")).encode("utf8")


def write_json(path, value, private=True):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with open(temporary, "wb") as file:
        os.chmod(temporary, 0o600 if private else 0o644)
        file.write(encoded(value, True) + b"\n")
    os.replace(temporary, path)


def prepare(input_path, output_path, manifest_path=None, public_manifest_path=None):
    raw = Path(input_path).read_bytes()
    document = Document()
    document.feed(raw.decode("utf8"))
    document.close()
    if len(document.stack) != 1:
        raise ValueError("Unclosed input HTML elements")
    articles = [node for node in descendants(document.root, "article") if node.has_class("unit")]
    if len(articles) != 8:
        raise ValueError("Expected eight reviewed unit articles")
    source_sections = [node for node in descendants(document.root, "section") if node.attrs.get("id") == "sources"]
    sources = []
    if source_sections:
        for paragraph in descendants(source_sections[0], "p"):
            text = plain(paragraph).strip()
            if text.startswith("•"):
                title = text[1:].strip()
                if title and title not in sources:
                    sources.append(title)
    source_titles = {" ".join(title.split()) for title in sources}
    removed = []
    relocated = []
    unit_data = []
    section_audit = []
    table_cells = 0
    for number, article in enumerate(articles, 1):
        if article.attrs.get("id") != f"unit-{number}":
            raise ValueError("Unit article order or identity differs")
        titles = list(descendants(article, "h1"))
        sections = [child for child in elements(article) if child.tag == "section"]
        if len(titles) != 1 or len(sections) != 8:
            raise ValueError("Expected one title and eight sections per unit")
        unit = {"number": number, "title": plain(titles[0]).strip(), "sections": []}
        for section in sections:
            native = convert_section(section, removed, source_titles, relocated)
            if not re.fullmatch(rf"unit-{number}-[a-z0-9]+(?:[_-][a-z0-9]+)*", native["id"]):
                raise ValueError("Section identity does not belong to unit")
            original_text = source_visible(section, source_titles)
            converted_text = native_visible(native)
            if original_text != converted_text:
                raise ValueError("Visible content differs in section " + native["id"])
            source_tables = list(descendants(section, "table"))
            native_tables = [block for block in native["blocks"] if block["kind"] == "table"]
            if len(source_tables) != len(native_tables):
                raise ValueError("Table count differs in section " + native["id"])
            for original, converted in zip(source_tables, native_tables):
                old = [plain(cell) for cell in descendants(original) if cell.tag in {"td", "th"}]
                rows = ([converted["headers"]] if "headers" in converted else []) + converted["rows"]
                new = [runs_text(cell) for row in rows for cell in row]
                if old != new:
                    raise ValueError("Table cell content differs in section " + native["id"])
                table_cells += len(old)
            section_audit.append({"id": native["id"], "blocks": len(native["blocks"]), "tables": len(native_tables), "visibleTextSha256": digest(encoded(original_text)), "nativeTextSha256": digest(encoded(converted_text))})
            unit["sections"].append(native)
        unit_data.append(unit)
    if len(removed) > 1:
        raise ValueError("Unexpected count of isolated OCR remnants")
    book = {"version": 1, "title": "六上知识点", "edition": "2026", "units": unit_data, **({"sources": sources} if sources else {})}
    counts = Counter()
    for unit in unit_data:
        for section in unit["sections"]:
            for block in section["blocks"]:
                counts[block["kind"]] += 1
    canonical = encoded(book)
    public = {"version": 1, "title": book["title"], "edition": book["edition"], "canonicalSha256": digest(canonical), "unitCount": 8, "sectionCount": len(section_audit), "blockCount": sum(counts.values()), "tableCount": counts["table"], "units": [{"number": unit["number"], "title": unit["title"], "sectionCount": len(unit["sections"]), "blockCount": sum(len(section["blocks"]) for section in unit["sections"]), "tableCount": sum(block["kind"] == "table" for section in unit["sections"] for block in section["blocks"])} for unit in unit_data]}
    manifest = {**public, "inputHtmlSha256": digest(raw), "authoringFileSha256": digest(encoded(book, True) + b"\n"), "blocksByKind": dict(counts), "tableCellsVerified": table_cells, "removedIsolatedOcrRemnants": removed, "sourceTitlesRelocatedToMetadata": relocated, "sections": section_audit}
    write_json(output_path, book)
    write_json(manifest_path or str(output_path) + ".manifest.json", manifest)
    if public_manifest_path:
        write_json(public_manifest_path, public, private=False)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--public-manifest")
    args = parser.parse_args()
    result = prepare(args.input, args.output, args.manifest, args.public_manifest)
    # No source, examples, tables or full native payload are printed.
    print(json.dumps({key: result[key] for key in ["unitCount", "sectionCount", "blockCount", "tableCount", "tableCellsVerified", "canonicalSha256", "blocksByKind"]}))


if __name__ == "__main__":
    main()
