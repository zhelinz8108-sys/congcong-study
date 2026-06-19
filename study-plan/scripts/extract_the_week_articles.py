#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber


NOISE_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^theweekjunior\.co\.uk$",
        r"^making sense of the world$",
        r"^the week junior$",
        r"^junior$",
        r"^issue \d+",
        r"^\d{1,2} [A-Z][a-z]+ 2024",
        r"^photos:?",
        r"^getty",
        r"^alamy",
        r"^shutterstock",
        r"^contents$",
        r"^p\d+$",
        r"^page \d+$",
        r"^advertisement$",
    ]
]

SECTION_HINTS = [
    "this week's big news",
    "news",
    "home news",
    "around the world",
    "science and technology",
    "animals and the environment",
    "people",
    "sport",
    "entertainment",
    "book club",
    "on screen",
    "the big debate",
    "how to",
    "puzzles",
    "over to you",
]


@dataclass
class Line:
    text: str
    page_number: int
    x0: float
    x1: float
    top: float
    bottom: float
    max_size: float
    avg_size: float
    page_width: float

    @property
    def center_x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def width(self) -> float:
        return self.x1 - self.x0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract text-layer articles from The Week Junior PDFs."
    )
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--min-article-words", type=int, default=80)
    return parser.parse_args()


def clean_text(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = value.replace("(cid:29)", " ")
    value = value.replace("(cid:3)", " ")
    value = value.replace("(cid:79)", " ")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"([(\[{])\s+", r"\1", value)
    return value.strip()


def word_count(value: str) -> int:
    return len(re.findall(r"[A-Za-z]+(?:['-][A-Za-z]+)?|\d+", value))


def bad_text_ratio(value: str) -> float:
    if not value:
        return 1.0
    bad = value.count("(cid:") + value.count("\ufffd")
    return bad / max(1, len(value))


def looks_like_noise(value: str) -> bool:
    text = clean_text(value)
    if not text:
        return True
    if len(text) <= 2 and not text.isalpha():
        return True
    if any(pattern.search(text) for pattern in NOISE_PATTERNS):
        return True
    if re.fullmatch(r"[\d\s./:-]+", text):
        return True
    if word_count(text) == 0:
        return True
    return False


def parse_issue_date(file_name: str) -> str:
    match = re.search(r"(20\d{2})[.-](\d{2})[.-](\d{2})", file_name)
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{year}-{month}-{day}"


def slugify(value: str, fallback: str) -> str:
    text = value.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text[:80] or fallback


def build_lines(page: Any, page_number: int) -> list[Line]:
    words = page.extract_words(
        x_tolerance=1,
        y_tolerance=3,
        keep_blank_chars=False,
        use_text_flow=False,
        extra_attrs=["size", "fontname"],
    )
    if not words:
        return []

    grouped: list[list[dict[str, Any]]] = []
    for word in sorted(words, key=lambda item: (float(item["top"]), float(item["x0"]))):
        if not grouped:
            grouped.append([word])
            continue
        current = grouped[-1]
        current_top = sum(float(item["top"]) for item in current) / len(current)
        if abs(float(word["top"]) - current_top) <= 3.0:
            current.append(word)
        else:
            grouped.append([word])

    lines: list[Line] = []
    for group in grouped:
        group = sorted(group, key=lambda item: float(item["x0"]))
        text = clean_text(" ".join(str(item["text"]) for item in group))
        if not text:
            continue
        sizes = [float(item.get("size") or 0) for item in group]
        lines.append(
            Line(
                text=text,
                page_number=page_number,
                x0=min(float(item["x0"]) for item in group),
                x1=max(float(item["x1"]) for item in group),
                top=min(float(item["top"]) for item in group),
                bottom=max(float(item["bottom"]) for item in group),
                max_size=max(sizes) if sizes else 0,
                avg_size=sum(sizes) / len(sizes) if sizes else 0,
                page_width=float(page.width),
            )
        )
    return lines


def is_section_line(line: Line) -> bool:
    text = clean_text(line.text).lower()
    return any(text == hint or text.startswith(f"{hint} ") for hint in SECTION_HINTS)


def is_title_candidate(line: Line) -> bool:
    text = clean_text(line.text)
    wc = word_count(text)
    if looks_like_noise(text) or is_section_line(line):
        return False
    if wc < 2 or wc > 14:
        return False
    if len(text) < 8 or len(text) > 120:
        return False
    if line.max_size < 12.0:
        return False
    if text.isupper() and wc <= 3:
        return False
    return True


def reading_order(lines: list[Line]) -> list[Line]:
    def column_for(line: Line) -> int:
        if line.width > line.page_width * 0.55:
            return 0
        return min(2, max(0, int((line.center_x / line.page_width) * 3)))

    return sorted(lines, key=lambda line: (line.page_number, column_for(line), line.top, line.x0))


def page_section(lines: list[Line]) -> str:
    for line in sorted(lines, key=lambda item: (item.top, item.x0)):
        if is_section_line(line):
            return clean_text(line.text)
    return ""


def compatible_body_line(title: Line, line: Line) -> bool:
    if line.page_number != title.page_number:
        return False
    if line.top <= title.bottom:
        return False
    if looks_like_noise(line.text) or is_title_candidate(line):
        return False
    if line.max_size > 14.5 and word_count(line.text) <= 12:
        return False
    if title.width > title.page_width * 0.55:
        return True
    title_left = max(0, title.x0 - 45)
    title_right = min(title.page_width, title.x1 + 85)
    return title_left <= line.center_x <= title_right


def body_from_lines(title: Line, boundary: Line | None, lines: list[Line]) -> str:
    selected: list[Line] = []
    for line in reading_order(lines):
        if not compatible_body_line(title, line):
            continue
        if boundary and line.top >= boundary.top and line.center_x >= min(title.x0, boundary.x0) - 30:
            continue
        selected.append(line)
    paragraphs: list[str] = []
    current: list[str] = []
    previous_bottom = 0.0
    for line in selected:
        if current and line.top - previous_bottom > 12:
            paragraphs.append(clean_text(" ".join(current)))
            current = []
        current.append(line.text)
        previous_bottom = line.bottom
    if current:
        paragraphs.append(clean_text(" ".join(current)))
    return "\n\n".join(paragraph for paragraph in paragraphs if paragraph)


def fallback_page_article(lines: list[Line], issue_date: str, source_pdf: str, page_number: int) -> dict[str, Any] | None:
    usable = [line for line in reading_order(lines) if not looks_like_noise(line.text)]
    if not usable:
        return None
    title = max(usable, key=lambda line: (line.max_size, -line.top)).text
    body = clean_text(" ".join(line.text for line in usable if line.text != title))
    if word_count(body) < 50:
        return None
    return make_article(
        issue_date=issue_date,
        source_pdf=source_pdf,
        page_number=page_number,
        index=1,
        section=page_section(lines),
        title=title,
        body=body,
        confidence=0.35,
        review_reason="fallback_page_chunk",
    )


def make_article(
    issue_date: str,
    source_pdf: str,
    page_number: int,
    index: int,
    section: str,
    title: str,
    body: str,
    confidence: float,
    review_reason: str,
) -> dict[str, Any]:
    words = word_count(body)
    title_slug = slugify(title, f"article-{index:02d}")
    article_id = f"the-week-junior-{issue_date}-p{page_number:02d}-{index:02d}-{title_slug}"
    review_status = "ready"
    if confidence < 0.7 or words < 80 or review_reason or bad_text_ratio(body) > 0.01:
        review_status = "needs_review"
    return {
        "id": article_id,
        "source": "The Week Junior",
        "issue_date": issue_date,
        "source_pdf": source_pdf,
        "pages": [page_number],
        "section": section,
        "title": clean_text(title),
        "body": body,
        "word_count": words,
        "extraction_method": "text_layer",
        "confidence": round(confidence, 2),
        "review_status": review_status,
        "review_reason": review_reason,
    }


def extract_page_articles(
    lines: list[Line],
    issue_date: str,
    source_pdf: str,
    page_number: int,
) -> list[dict[str, Any]]:
    titles = [line for line in sorted(lines, key=lambda item: (item.top, item.x0)) if is_title_candidate(line)]
    articles: list[dict[str, Any]] = []
    section = page_section(lines)
    for index, title in enumerate(titles, start=1):
        next_title = titles[index] if index < len(titles) else None
        body = body_from_lines(title, next_title, lines)
        if word_count(body) < 35:
            continue
        confidence = 0.78
        reasons: list[str] = []
        if word_count(body) < 80:
            confidence -= 0.25
            reasons.append("short_body")
        if bad_text_ratio(body) > 0.01:
            confidence -= 0.2
            reasons.append("cid_or_corrupt_text")
        if not section:
            confidence -= 0.08
            reasons.append("section_unknown")
        articles.append(
            make_article(
                issue_date=issue_date,
                source_pdf=source_pdf,
                page_number=page_number,
                index=index,
                section=section,
                title=title.text,
                body=body,
                confidence=max(0.1, confidence),
                review_reason=";".join(reasons),
            )
        )

    if not articles:
        fallback = fallback_page_article(lines, issue_date, source_pdf, page_number)
        if fallback:
            articles.append(fallback)
    return articles


def write_markdown(issue_date: str, articles: list[dict[str, Any]], out_dir: Path) -> None:
    markdown_dir = out_dir / "markdown-preview"
    markdown_dir.mkdir(parents=True, exist_ok=True)
    path = markdown_dir / f"{issue_date}.md"
    lines = [f"# The Week Junior {issue_date}", ""]
    for article in articles:
        lines.extend(
            [
                f"## {article['title']}",
                "",
                f"- Source PDF: `{article['source_pdf']}`",
                f"- Pages: {', '.join(str(page) for page in article['pages'])}",
                f"- Section: {article['section'] or 'Unknown'}",
                f"- Words: {article['word_count']}",
                f"- Status: {article['review_status']}",
                f"- Confidence: {article['confidence']}",
                "",
                article["body"],
                "",
                "---",
                "",
            ]
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def process_pdf(pdf_path: Path, source_dir: Path, min_article_words: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    issue_date = parse_issue_date(pdf_path.name)
    source_pdf = str(Path(source_dir.name) / pdf_path.name)
    articles: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "file": source_pdf,
        "issue_date": issue_date,
        "pages": 0,
        "text_pages": 0,
        "text_chars": 0,
        "status": "unknown",
        "article_count": 0,
        "ready_count": 0,
        "needs_review_count": 0,
        "notes": [],
    }
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            report["pages"] = len(pdf.pages)
            page_lines: list[tuple[int, list[Line]]] = []
            for page_number, page in enumerate(pdf.pages, start=1):
                text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
                if len(text) > 200:
                    report["text_pages"] += 1
                report["text_chars"] += len(text)
                lines = build_lines(page, page_number)
                page_lines.append((page_number, lines))

            if report["text_pages"] < 2 or report["text_chars"] < 1000:
                report["status"] = "needs_ocr"
                report["notes"].append("No usable text layer detected; OCR required.")
                return [], report

            report["status"] = "text_layer"
            for page_number, lines in page_lines:
                if not lines:
                    continue
                articles.extend(extract_page_articles(lines, issue_date, source_pdf, page_number))
    except Exception as exc:  # noqa: BLE001
        report["status"] = "failed"
        report["notes"].append(str(exc))
        return [], report

    for article in articles:
        if article["word_count"] < min_article_words and "short_body" not in article["review_reason"]:
            article["review_status"] = "needs_review"
            article["review_reason"] = ";".join(
                item for item in [article["review_reason"], "short_body"] if item
            )

    report["article_count"] = len(articles)
    report["ready_count"] = sum(1 for article in articles if article["review_status"] == "ready")
    report["needs_review_count"] = sum(
        1 for article in articles if article["review_status"] == "needs_review"
    )
    if not articles:
        report["notes"].append("Text layer found, but no article-sized chunks were extracted.")
    return articles, report


def main() -> None:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(source_dir.glob("*.pdf"))
    if args.limit:
        pdfs = pdfs[: args.limit]

    all_articles: list[dict[str, Any]] = []
    reports: list[dict[str, Any]] = []
    for index, pdf_path in enumerate(pdfs, start=1):
        print(f"[{index}/{len(pdfs)}] {pdf_path.name}")
        articles, report = process_pdf(pdf_path, source_dir, args.min_article_words)
        all_articles.extend(articles)
        reports.append(report)
        if articles:
            write_markdown(report["issue_date"], articles, out_dir)

    articles_path = out_dir / "articles.jsonl"
    with articles_path.open("w", encoding="utf-8", newline="\n") as handle:
        for article in all_articles:
            handle.write(json.dumps(article, ensure_ascii=False) + "\n")

    report_payload = {
        "source_dir": str(source_dir),
        "output_dir": str(out_dir),
        "pdf_count": len(pdfs),
        "article_count": len(all_articles),
        "ready_count": sum(1 for article in all_articles if article["review_status"] == "ready"),
        "needs_review_count": sum(
            1 for article in all_articles if article["review_status"] == "needs_review"
        ),
        "text_layer_pdf_count": sum(1 for report in reports if report["status"] == "text_layer"),
        "needs_ocr_pdf_count": sum(1 for report in reports if report["status"] == "needs_ocr"),
        "failed_pdf_count": sum(1 for report in reports if report["status"] == "failed"),
        "pdfs": reports,
    }
    (out_dir / "extraction-report.json").write_text(
        json.dumps(report_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "pdf_count": report_payload["pdf_count"],
                "article_count": report_payload["article_count"],
                "ready_count": report_payload["ready_count"],
                "needs_review_count": report_payload["needs_review_count"],
                "text_layer_pdf_count": report_payload["text_layer_pdf_count"],
                "needs_ocr_pdf_count": report_payload["needs_ocr_pdf_count"],
                "failed_pdf_count": report_payload["failed_pdf_count"],
                "articles_path": str(articles_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
