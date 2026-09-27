from __future__ import annotations

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public" / "listening" / "yiben-grade-6"
DATA_PATH = ROOT / "src" / "data" / "listening" / "yiben-grade-6.json"
CACHE_ROOT = ROOT / "tmp" / "yiben-listening-ocr"

DEFAULT_EXERCISE_PDF = Path(
    r"D:\BaiduNetdiskDownload\听力\一本英语听力训练\2026版第5次一本英语听力训练100篇-6年级\2026版第5次一本英语听力训练100篇-6年级.pdf"
)
DEFAULT_ANSWER_PDF = Path(
    r"D:\BaiduNetdiskDownload\听力\一本英语听力训练\2026版第5次一本英语听力训练100篇-6年级\2026版第5次一本英语听力训练100篇-6年级-答案速查与听力原文.pdf"
)
DEFAULT_AUDIO_ZIP = Path(tempfile.gettempdir()) / "yiben-grade6-audio.zip"
DEFAULT_TRANSLATION_DOCX = Path(tempfile.gettempdir()) / "yiben-grade6-translation.docx"


TOPICS = [
    (1, 5, "人物介绍"),
    (6, 10, "兴趣爱好"),
    (11, 15, "情绪与健康"),
    (16, 20, "计划与安排"),
    (21, 25, "日常生活"),
    (26, 30, "学校生活"),
    (31, 35, "问路与指路"),
    (36, 40, "规则与标志"),
    (41, 45, "旅行见闻"),
    (46, 50, "国家与文化"),
    (51, 55, "天气与环境"),
    (56, 60, "长对话专项"),
    (61, 65, "短文理解专项（一）"),
    (66, 70, "短文理解专项（二）"),
    (71, 78, "小升初基础训练"),
    (79, 100, "小升初综合训练"),
]


def topic_for(number: int) -> tuple[str, str]:
    for start, end, title in TOPICS:
        if start <= number <= end:
            if end <= 55:
                return "话题训练", title
            if end <= 70:
                return "题型专练", title
            return "小升初综合训练", title
    raise ValueError(f"No topic for Exercise {number}")


def exercise_pdf_pages(number: int) -> list[int]:
    """Return zero-based PDF pages for the exercise workbook."""
    if number <= 78:
        return [number + 7]
    first = 2 * number - 72
    return [first, first + 1]


def render_exercise_pages(pdf_path: Path, force: bool = False) -> dict[int, list[str]]:
    output_dir = PUBLIC_ROOT / "pages"
    output_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)
    result: dict[int, list[str]] = {}

    for number in range(1, 101):
        result[number] = []
        for page_part, pdf_index in enumerate(exercise_pdf_pages(number), start=1):
            filename = f"exercise-{number:03d}-{page_part}.webp"
            output_path = output_dir / filename
            if force or not output_path.exists():
                page = document[pdf_index]
                scale = 1_500 / page.rect.width
                pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                image.save(output_path, "WEBP", quality=84, method=5)
            result[number].append(f"/listening/yiben-grade-6/pages/{filename}")

    document.close()
    return result


def extract_audio(audio_zip: Path, force: bool = False) -> dict[int, str]:
    output_dir = PUBLIC_ROOT / "audio"
    output_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        ffmpeg_runtime = ROOT.parent / "tmp" / "ffmpeg"
        if ffmpeg_runtime.exists():
            sys.path.insert(0, str(ffmpeg_runtime))
            try:
                import imageio_ffmpeg

                ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            except ImportError:
                pass
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to prepare the listening audio")

    discovered: dict[int, zipfile.ZipInfo] = {}
    with zipfile.ZipFile(audio_zip) as archive:
        for entry in archive.infolist():
            match = re.search(r"Exercise\s+(\d+)\D", entry.filename, re.IGNORECASE)
            if match and not entry.is_dir():
                discovered[int(match.group(1))] = entry

        if set(discovered) != set(range(1, 101)):
            missing = sorted(set(range(1, 101)) - set(discovered))
            raise RuntimeError(f"Audio archive is missing exercises: {missing}")

        with tempfile.TemporaryDirectory(prefix="yiben-audio-") as temp_dir:
            for number in range(1, 101):
                output_path = output_dir / f"exercise-{number:03d}.mp3"
                if output_path.exists() and not force:
                    continue
                source_path = Path(temp_dir) / f"source-{number:03d}.mp3"
                with archive.open(discovered[number]) as source, source_path.open("wb") as target:
                    shutil.copyfileobj(source, target)
                subprocess.run(
                    [
                        ffmpeg,
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-y",
                        "-i",
                        str(source_path),
                        "-vn",
                        "-ac",
                        "1",
                        "-ar",
                        "44100",
                        "-b:a",
                        "64k",
                        str(output_path),
                    ],
                    check=True,
                )

    return {
        number: f"/listening/yiben-grade-6/audio/exercise-{number:03d}.mp3"
        for number in range(1, 101)
    }


def read_docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace)).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def split_translation_docx(path: Path) -> dict[int, str]:
    translations: dict[int, list[str]] = defaultdict(list)
    current: int | None = None
    for paragraph in read_docx_paragraphs(path):
        match = re.fullmatch(r"Exercise\s*(\d+)", paragraph, re.IGNORECASE)
        if match:
            current = int(match.group(1))
            continue
        if current is not None and not re.fullmatch(r"(?:Part|Topic)\s+\d+", paragraph, re.IGNORECASE):
            translations[current].append(paragraph)
    return {number: "\n".join(translations[number]).strip() for number in range(1, 101)}


_OCR_ENGINE = None
_OCR_PDF_PATH = ""
_OCR_SCALE = 1.8


def init_ocr_worker(pdf_path: str, scale: float, rapidocr_path: str) -> None:
    global _OCR_ENGINE, _OCR_PDF_PATH, _OCR_SCALE
    if rapidocr_path and rapidocr_path not in sys.path:
        sys.path.insert(0, rapidocr_path)
    from rapidocr_onnxruntime import RapidOCR

    _OCR_ENGINE = RapidOCR()
    _OCR_PDF_PATH = pdf_path
    _OCR_SCALE = scale


def ocr_page_worker(page_number: int) -> tuple[int, dict[str, Any]]:
    cache_path = CACHE_ROOT / f"page-{page_number:03d}-scale-{_OCR_SCALE:.1f}.json"
    if cache_path.exists():
        return page_number, json.loads(cache_path.read_text(encoding="utf-8"))

    document = fitz.open(_OCR_PDF_PATH)
    page = document[page_number - 1]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(_OCR_SCALE, _OCR_SCALE), alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    document.close()
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
        temp_path = Path(temp_file.name)
    try:
        image.save(temp_path)
        result, _ = _OCR_ENGINE(str(temp_path))
    finally:
        temp_path.unlink(missing_ok=True)

    lines = []
    for box, text, score in result or []:
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        cleaned = re.sub(r"\s+", " ", text).strip()
        if cleaned:
            lines.append(
                {
                    "x": round(min(xs), 2),
                    "y": round(min(ys), 2),
                    "w": round(max(xs) - min(xs), 2),
                    "h": round(max(ys) - min(ys), 2),
                    "text": cleaned,
                    "score": round(float(score), 4),
                }
            )
    payload = {"width": image.width, "height": image.height, "lines": lines}
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return page_number, payload


def ocr_pages(pdf_path: Path, pages: list[int], scale: float, workers: int, rapidocr_path: Path) -> dict[int, dict[str, Any]]:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    context = mp.get_context("spawn")
    with context.Pool(
        processes=workers,
        initializer=init_ocr_worker,
        initargs=(str(pdf_path), scale, str(rapidocr_path)),
    ) as pool:
        return dict(pool.imap_unordered(ocr_page_worker, pages))


def ordered_column_lines(payload: dict[str, Any]) -> list[str]:
    width = float(payload["width"])
    result: list[str] = []
    for side in (0, 1):
        candidates = [
            line
            for line in payload["lines"]
            if (line["x"] + line["w"] / 2 < width / 2) == (side == 0)
        ]
        candidates.sort(key=lambda line: (line["y"], line["x"]))
        grouped: list[list[dict[str, Any]]] = []
        for line in candidates:
            if grouped and abs(grouped[-1][0]["y"] - line["y"]) <= max(8, line["h"] * 0.45):
                grouped[-1].append(line)
            else:
                grouped.append([line])
        for group in grouped:
            group.sort(key=lambda line: line["x"])
            merged = " ".join(line["text"] for line in group)
            merged = re.sub(r"\s+", " ", merged).strip()
            if merged:
                result.append(merged)
    return result


def split_exercises_from_ocr(pages: dict[int, dict[str, Any]]) -> dict[int, list[str]]:
    exercises: dict[int, list[str]] = defaultdict(list)
    current: int | None = None
    for page_number in sorted(pages):
        for line in ordered_column_lines(pages[page_number]):
            match = re.search(r"Exercise\s*(\d{1,3})", line, re.IGNORECASE)
            if match:
                number = int(match.group(1))
                if 1 <= number <= 100:
                    current = number
                    remainder = line[match.end() :].strip(" :：")
                    if remainder:
                        exercises[current].append(remainder)
                    continue
            if current is not None:
                exercises[current].append(line)
    return exercises


def clean_answer_lines(lines: list[str]) -> list[str]:
    output = []
    for line in lines:
        line = line.replace("I.", "1.").replace("l.", "1.")
        line = line.replace("—", "-").replace("–", "-")
        line = re.sub(r"(?<=\d)\s+(?=[A-FT])", ".", line)
        if re.fullmatch(r"\d{3}", line) or re.fullmatch(r"Topic\s*\d+", line, re.IGNORECASE):
            continue
        line = re.sub(r"\s*(?:短文专练[（(][一二][）)]|小升初综合训练)\s*$", "", line)
        output.append(line.strip())
    return output


def parse_answer_sections(number: int, lines: list[str]) -> list[dict[str, Any]]:
    lines = clean_answer_lines(lines)
    sections: list[dict[str, Any]] = []
    active_title = "整篇答案"
    active_lines: list[str] = []

    def flush() -> None:
        nonlocal active_lines
        if not active_lines:
            return
        raw = " ".join(active_lines).strip()
        if raw:
            sections.append({"title": active_title, "rawAnswer": raw})
        active_lines = []

    for line in lines:
        step = re.match(r"Step\s*([123])(?:\s*听(?:句子|对话|短文))?", line, re.IGNORECASE)
        chinese_step = re.match(r"^([一二三四五六])、", line)
        if step:
            flush()
            active_title = f"Step {step.group(1)}"
            remainder = line[step.end() :].strip(" :：")
            if remainder:
                active_lines.append(remainder)
        elif chinese_step:
            flush()
            active_title = f"第{chinese_step.group(1)}部分"
            remainder = line[chinese_step.end() :].strip(" :：")
            if remainder:
                active_lines.append(remainder)
        else:
            active_lines.append(line)
    flush()

    if not sections:
        sections = [{"title": "整篇答案", "rawAnswer": " ".join(lines).strip()}]

    item_counter = 0
    for section in sections:
        raw = section["rawAnswer"]
        items: list[dict[str, Any]] = []
        scan_raw = raw
        if "正确的顺序" in raw:
            order_match = re.search(r"正确的顺序为?[:：]?\s*([\d、,，\s-]+)", raw)
            if order_match:
                item_counter += 1
                answer = re.sub(r"\s+", "", order_match.group(1)).strip("、,，-")
                items.append(
                    {
                        "id": f"e{number:03d}-a{item_counter:02d}",
                        "label": "排列顺序",
                        "type": "order",
                        "answer": answer,
                    }
                )
                scan_raw = f"{raw[:order_match.start()]} {raw[order_match.end():]}"
        markers = list(re.finditer(r"(?<!\d)(\d{1,2})\s*[.、-]\s*", scan_raw))
        if markers:
            marker_answers = []
            for index, marker in enumerate(markers):
                end = markers[index + 1].start() if index + 1 < len(markers) else len(scan_raw)
                candidate = scan_raw[marker.end() : end].strip(" ;；,，")
                candidate = re.sub(r"\s*任务[一二三四五六]\s*[:：]?\s*$", "", candidate)
                marker_answers.append(candidate)
            compact_answers = [re.sub(r"\s+", "", answer.upper()) for answer in marker_answers]
            task_positions = [
                match.start()
                for match in re.finditer(r"任务[一二三四五六]\s*[:：]?", scan_raw)
            ]
            marker_groups = [
                sum(position <= marker.start() for position in task_positions)
                for marker in markers
            ]
            true_false_groups = {
                group
                for group in set(marker_groups)
                if all(
                    answer in {"T", "F"}
                    for answer, answer_group in zip(compact_answers, marker_groups)
                    if answer_group == group
                )
            }
            for index, marker in enumerate(markers):
                answer = marker_answers[index]
                if not answer:
                    continue
                item_counter += 1
                compact = re.sub(r"\s+", "", answer.upper())
                if compact in {"T", "F"} and marker_groups[index] in true_false_groups:
                    item_type = "true_false"
                elif re.fullmatch(r"[A-G]", compact):
                    item_type = "choice"
                elif re.fullmatch(r"[A-G](?:[、,，/][A-G])+", compact):
                    item_type = "multi_choice"
                else:
                    item_type = "fill_blank"
                items.append(
                    {
                        "id": f"e{number:03d}-a{item_counter:02d}",
                        "label": f"第 {index + 1} 题",
                        "type": item_type,
                        "answer": answer,
                    }
                )
        if not markers:
            named_markers = list(
                re.finditer(r"(?<![A-Za-z])([A-Za-z]+\.?)\s*[:：]", scan_raw)
            )
            if len(named_markers) >= 2:
                for index, marker in enumerate(named_markers):
                    end = (
                        named_markers[index + 1].start()
                        if index + 1 < len(named_markers)
                        else len(scan_raw)
                    )
                    answer = scan_raw[marker.end() : end].strip(" ;；,，。")
                    if not answer:
                        continue
                    item_counter += 1
                    items.append(
                        {
                            "id": f"e{number:03d}-a{item_counter:02d}",
                            "label": marker.group(1).rstrip("."),
                            "type": "fill_blank",
                            "answer": answer,
                        }
                    )
        if not items and raw:
            item_counter += 1
            items.append(
                {
                    "id": f"e{number:03d}-a{item_counter:02d}",
                    "label": "本部分",
                    "type": "fill_blank",
                    "answer": raw,
                }
            )
        section["items"] = items
    return sections


def apply_answer_overrides(number: int, sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply corrections for answer-key rows that the scan OCR omits entirely."""
    if number == 11:
        step_three = next((section for section in sections if section["title"] == "Step 3"), None)
        if step_three is None:
            step_three = {"title": "Step 3", "rawAnswer": "", "items": []}
            sections.append(step_three)
        existing_count = sum(len(section["items"]) for section in sections)
        step_three["rawAnswer"] = "1.C 2.D 3.A 4.E 5.B"
        step_three["items"] = [
            {
                "id": f"e011-a{existing_count + index + 1:02d}",
                "label": f"第 {index + 1} 题",
                "type": "choice",
                "answer": answer,
            }
            for index, answer in enumerate(["C", "D", "A", "E", "B"])
        ]
    return sections


def clean_transcript(lines: list[str]) -> str:
    cleaned: list[str] = []
    for line in lines:
        if re.fullmatch(r"\d{3}", line) or re.fullmatch(r"Topic\s*\d+", line, re.IGNORECASE):
            continue
        line = re.sub(r"\s+([,.?!:;])", r"\1", line)
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            cleaned.append(line)
    return "\n".join(cleaned).strip()


def probe_audio(path: Path) -> float:
    try:
        from mutagen.mp3 import MP3

        return float(MP3(path).info.length)
    except (ImportError, OSError):
        pass
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 2.0 if path.stat().st_size > 10_000 else 0.0
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def validate(book: dict[str, Any]) -> None:
    exercises = book["exercises"]
    errors: list[str] = []
    if len(exercises) != 100:
        errors.append(f"Expected 100 exercises, got {len(exercises)}")
    if [exercise["number"] for exercise in exercises] != list(range(1, 101)):
        errors.append("Exercise numbering is not continuous")

    item_ids: set[str] = set()
    audio_hashes: dict[str, list[int]] = defaultdict(list)
    for exercise in exercises:
        number = exercise["number"]
        items = [item for section in exercise["sections"] for item in section["items"]]
        if not items:
            errors.append(f"Exercise {number}: no answer items")
        for item in items:
            if item["id"] in item_ids:
                errors.append(f"Duplicate answer item id: {item['id']}")
            item_ids.add(item["id"])
            if not item["answer"].strip():
                errors.append(f"Exercise {number}: blank answer for {item['id']}")
            compact_answer = re.sub(r"\s+", "", item["answer"].upper())
            if item["type"] == "choice" and not re.fullmatch(r"[A-G]", compact_answer):
                errors.append(f"Exercise {number}: invalid choice answer {item['answer']}")
            if item["type"] == "true_false" and compact_answer not in {"T", "F"}:
                errors.append(f"Exercise {number}: invalid true/false answer {item['answer']}")
            if item["type"] == "multi_choice" and not re.fullmatch(
                r"[A-G](?:[、,，/][A-G])+", compact_answer
            ):
                errors.append(f"Exercise {number}: invalid multiple-choice answer {item['answer']}")
        if len(exercise["transcript"].strip()) < 80:
            errors.append(f"Exercise {number}: transcript missing")
        if len(exercise["translation"].strip()) < 40:
            errors.append(f"Exercise {number}: translation missing")
        for relative in exercise["pageImages"]:
            if not (ROOT / "public" / relative.lstrip("/")).exists():
                errors.append(f"Exercise {number}: missing page image {relative}")
        audio_path = ROOT / "public" / exercise["audioSrc"].lstrip("/")
        if not audio_path.exists() or probe_audio(audio_path) <= 5:
            errors.append(f"Exercise {number}: invalid audio {exercise['audioSrc']}")
        elif audio_path.exists():
            digest = hashlib.sha256(audio_path.read_bytes()).hexdigest()
            audio_hashes[digest].append(number)

    for numbers in audio_hashes.values():
        if len(numbers) > 1:
            errors.append(f"Duplicate audio detected for exercises: {numbers}")

    if errors:
        raise RuntimeError("\n".join(errors))


def main() -> None:
    parser = argparse.ArgumentParser(description="Import 一本 Grade 6 listening book")
    parser.add_argument("--exercise-pdf", type=Path, default=DEFAULT_EXERCISE_PDF)
    parser.add_argument("--answer-pdf", type=Path, default=DEFAULT_ANSWER_PDF)
    parser.add_argument("--audio-zip", type=Path, default=DEFAULT_AUDIO_ZIP)
    parser.add_argument("--translation-docx", type=Path, default=DEFAULT_TRANSLATION_DOCX)
    parser.add_argument("--rapidocr-path", type=Path, default=ROOT.parent / "tmp" / "rapidocr")
    parser.add_argument("--workers", type=int, default=max(2, min(6, (os.cpu_count() or 4) // 2)))
    parser.add_argument("--force-assets", action="store_true")
    args = parser.parse_args()

    for required in (args.exercise_pdf, args.answer_pdf, args.audio_zip, args.translation_docx):
        if not required.exists():
            raise FileNotFoundError(required)

    print("Rendering exercise pages...")
    page_images = render_exercise_pages(args.exercise_pdf, args.force_assets)
    print("Preparing audio...")
    audio_sources = extract_audio(args.audio_zip, args.force_assets)
    print("Reading official Chinese translations...")
    translations = split_translation_docx(args.translation_docx)

    print("OCR: answer key pages 3-11...")
    answer_pages = ocr_pages(args.answer_pdf, list(range(3, 12)), 2.1, args.workers, args.rapidocr_path)
    answer_lines = split_exercises_from_ocr(answer_pages)
    print("OCR: transcript pages 12-66...")
    transcript_pages = ocr_pages(args.answer_pdf, list(range(12, 67)), 1.8, args.workers, args.rapidocr_path)
    transcript_lines = split_exercises_from_ocr(transcript_pages)

    exercises = []
    for number in range(1, 101):
        part, topic = topic_for(number)
        sections = apply_answer_overrides(
            number,
            parse_answer_sections(number, answer_lines.get(number, [])),
        )
        exercises.append(
            {
                "number": number,
                "title": f"Exercise {number}",
                "part": part,
                "topic": topic,
                "pageImages": page_images[number],
                "audioSrc": audio_sources[number],
                "sections": sections,
                "transcript": clean_transcript(transcript_lines.get(number, [])),
                "translation": translations.get(number, ""),
            }
        )

    book = {
        "id": "yiben-grade-6",
        "title": "2026 一本·小学英语听力训练100篇 六年级",
        "shortTitle": "一本听力 100 篇",
        "exerciseCount": 100,
        "parts": [
            {"title": "话题训练", "range": "1-55"},
            {"title": "题型专练", "range": "56-70"},
            {"title": "小升初综合训练", "range": "71-100"},
        ],
        "exercises": exercises,
    }
    validate(book)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(book, ensure_ascii=False, indent=2), encoding="utf-8")
    total_items = sum(len(section["items"]) for exercise in exercises for section in exercise["sections"])
    print(f"Wrote {DATA_PATH} with 100 exercises and {total_items} answer items")


if __name__ == "__main__":
    mp.freeze_support()
    main()
