#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import edge_tts
import imageio_ffmpeg
from mutagen.mp3 import MP3


ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = ROOT / ".tmp-audio-rebuild"
STAGED_DIR = TMP_DIR / "generated"
REPORT_PATH = TMP_DIR / "english-audio-fix-report.json"
BACKUP_PATH = TMP_DIR / "english-subject-before.json"
API_BASE = "http://localhost:3000"
SUBJECT_NAME = "英语"
VOICE = "en-US-JennyNeural"
SENTENCE_GAP_SECONDS = 0.8
BITRATE = "64k"
KNOWN_BROKEN_PREFIXES = ("/audio2/", "/audio3/")
PRE_ROLL_SECONDS = 0.02
POST_ROLL_SECONDS = 0.08
NEXT_WORD_PADDING_SECONDS = 0.04
MAX_MATCH_LOOKAHEAD = 8
OUT_OF_RANGE_TOLERANCE = 0.25
NOW_ISO = datetime.now(timezone.utc).isoformat()

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Repair broken English sentence audio and word timings."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze and synthesize staged files, but do not overwrite public assets or update Supabase.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Only process the first N broken units for testing.",
    )
    parser.add_argument(
        "--rebuild-all",
        action="store_true",
        help="Rebuild every English unit instead of only the broken ones.",
    )
    return parser.parse_args()


def rel_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        raise FileNotFoundError(f"Missing env file: {path}")

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        env[key] = value
    return env


def fetch_json(url: str, headers: dict[str, str] | None = None) -> Any:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def post_json(url: str, payload: Any, headers: dict[str, str]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120):
            return
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"POST {url} failed: {exc.code} {details}") from exc


def chunked(items: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def dedupe_rows_by_id(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for row in rows:
        unique[str(row["id"])] = row
    return list(unique.values())


def find_subject(subjects: list[dict[str, Any]], name: str) -> dict[str, Any]:
    for subject in subjects:
        if subject.get("name") == name:
            return subject
    raise RuntimeError(f"Could not find subject named {name!r}.")


def compact_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return "".join(ch.lower() for ch in normalized if ch.isalnum())


def spoken_word_text(text: str) -> str:
    cleaned = re.sub(r"[.?!;,:]+$", "", text.strip())
    return cleaned or text.strip()


def resolve_audio_material(unit: dict[str, Any]) -> dict[str, Any] | None:
    for material in unit.get("materials", []):
        if material.get("file_type") == "audio":
            return material
    return None


def default_audio_path(unit: dict[str, Any]) -> str:
    sentence_number_match = re.search(r"(\d+)$", unit.get("name", ""))
    sentence_number = int(sentence_number_match.group(1)) if sentence_number_match else 1
    group_name = unit.get("group_name", "")

    if "小学" in group_name:
        return f"/audio/{sentence_number:03d}.mp3"
    if "初中" in group_name:
        return f"/audio2/{sentence_number:02d}.mp3"
    return f"/audio3/{sentence_number:03d}.mp3"


def public_audio_path(file_path: str) -> Path:
    return ROOT / "public" / file_path.lstrip("/").replace("/", os.sep)


def staged_audio_path(file_path: str) -> Path:
    return STAGED_DIR / file_path.lstrip("/").replace("/", os.sep)


def get_mp3_length(path: Path) -> float:
    return float(MP3(rel_path(path)).info.length)


def is_known_broken_path(file_path: str | None) -> bool:
    if not file_path:
        return False
    return file_path.startswith(KNOWN_BROKEN_PREFIXES)


def unit_sentence_text(unit: dict[str, Any], material: dict[str, Any] | None) -> str:
    sentence = ((unit.get("sentenceText") or {}).get("english") or "").strip()
    if sentence:
        return sentence
    if material and material.get("name"):
        return str(material["name"]).strip()
    return str(unit.get("name", "")).strip()


def needs_rebuild(unit: dict[str, Any]) -> tuple[bool, str]:
    material = resolve_audio_material(unit)
    file_path = material.get("file_path") if material else None

    if material is None:
        return True, "missing_audio_material"
    if not file_path:
        return True, "missing_audio_path"
    if is_known_broken_path(file_path):
        return True, "known_broken_audio_set"

    audio_path = public_audio_path(file_path)
    if not audio_path.exists():
        return True, "missing_audio_file"

    words = unit.get("words", [])
    for word in words:
        start = word.get("audio_start")
        end = word.get("audio_end")
        if start is None or end is None:
            return True, "missing_word_timing"
        if float(end) <= float(start):
            return True, "invalid_word_window"

    if not words:
        return False, ""

    duration = get_mp3_length(audio_path)
    max_end = max(float(word["audio_end"]) for word in words if word.get("audio_end") is not None)
    if max_end > duration + OUT_OF_RANGE_TOLERANCE:
        return True, "word_timing_exceeds_audio"

    return False, ""


async def synthesize_mp3(text: str, out_path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    communicator = edge_tts.Communicate(text, voice=VOICE, boundary="WordBoundary")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("wb") as audio_file:
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                events.append(
                    {
                        "offset": int(chunk["offset"]),
                        "duration": int(chunk["duration"]),
                        "text": str(chunk["text"]),
                    }
                )
    return events


def concat_audio(sentence_mp3: Path, words_mp3: Path, out_mp3: Path) -> None:
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    command = [
        FFMPEG,
        "-y",
        "-loglevel",
        "error",
        "-i",
        rel_path(sentence_mp3),
        "-f",
        "lavfi",
        "-t",
        str(SENTENCE_GAP_SECONDS),
        "-i",
        "anullsrc=channel_layout=mono:sample_rate=24000",
        "-i",
        rel_path(words_mp3),
        "-filter_complex",
        "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
        "-map",
        "[a]",
        "-b:a",
        BITRATE,
        rel_path(out_mp3),
    ]
    subprocess.run(command, check=True, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def match_word_boundaries(
    word: str, boundaries: list[dict[str, Any]], start_index: int
) -> tuple[int, int, int]:
    target = compact_text(word)
    if not target:
        raise ValueError(f"Cannot match empty word text: {word!r}")

    max_index = min(len(boundaries), start_index + MAX_MATCH_LOOKAHEAD)
    for end_index in range(start_index + 1, max_index + 1):
        candidate = compact_text("".join(boundary["text"] for boundary in boundaries[start_index:end_index]))
        if candidate == target:
            return start_index, end_index - 1, end_index

    preview = [boundary["text"] for boundary in boundaries[start_index : start_index + MAX_MATCH_LOOKAHEAD]]
    raise ValueError(f"Failed to match word {word!r} against boundaries starting at {preview!r}")


def calculate_word_timings(
    words: list[dict[str, Any]],
    boundaries: list[dict[str, Any]],
    sentence_duration: float,
    words_duration: float,
) -> list[dict[str, Any]]:
    offset_seconds = sentence_duration + SENTENCE_GAP_SECONDS
    updates: list[dict[str, Any]] = []
    boundary_index = 0

    for word_index, word in enumerate(words):
        start_idx, end_idx, boundary_index = match_word_boundaries(
            spoken_word_text(str(word["word"])), boundaries, boundary_index
        )
        first_boundary = boundaries[start_idx]
        last_boundary = boundaries[end_idx]
        next_boundary = boundaries[boundary_index] if boundary_index < len(boundaries) else None

        start_seconds = max(
            offset_seconds,
            offset_seconds + (first_boundary["offset"] / 10_000_000) - PRE_ROLL_SECONDS,
        )
        token_end_seconds = offset_seconds + (
            (last_boundary["offset"] + last_boundary["duration"]) / 10_000_000
        )
        if next_boundary:
            next_start_seconds = offset_seconds + (next_boundary["offset"] / 10_000_000)
        else:
            next_start_seconds = offset_seconds + words_duration

        end_seconds = min(
            offset_seconds + words_duration,
            max(token_end_seconds + POST_ROLL_SECONDS, next_start_seconds - NEXT_WORD_PADDING_SECONDS),
        )
        if end_seconds <= start_seconds:
            end_seconds = start_seconds + max(0.18, last_boundary["duration"] / 10_000_000)

        updated_word = dict(word)
        updated_word["audio_start"] = round(start_seconds, 3)
        updated_word["audio_end"] = round(end_seconds, 3)
        updates.append(updated_word)

    if boundary_index != len(boundaries):
        remaining = [boundary["text"] for boundary in boundaries[boundary_index:boundary_index + 10]]
        raise ValueError(f"Unused boundaries remain after mapping words: {remaining!r}")

    return updates


async def rebuild_unit(
    unit: dict[str, Any],
    index: int,
    total: int,
) -> dict[str, Any]:
    material = resolve_audio_material(unit)
    sentence_text = unit_sentence_text(unit, material)
    if not sentence_text:
        raise RuntimeError(f"{unit['group_name']} / {unit['name']} has no sentence text.")

    if material and material.get("file_path"):
        file_path = str(material["file_path"])
    else:
        file_path = default_audio_path(unit)

    temp_unit_dir = TMP_DIR / "work" / f"{index:03d}-{unit['id']}"
    if temp_unit_dir.exists():
        shutil.rmtree(temp_unit_dir)
    temp_unit_dir.mkdir(parents=True, exist_ok=True)

    sentence_mp3 = temp_unit_dir / "sentence.mp3"
    words_mp3 = temp_unit_dir / "words.mp3"
    staged_mp3 = staged_audio_path(file_path)

    words = unit.get("words", [])
    spoken_words = [spoken_word_text(str(word["word"])) for word in words]
    word_list_text = ". ".join(spoken_words) + "."

    print(f"[{index}/{total}] rebuilding {unit['group_name']} / {unit['name']} -> {file_path}")
    await synthesize_mp3(sentence_text, sentence_mp3)
    word_boundaries = await synthesize_mp3(word_list_text, words_mp3)
    concat_audio(sentence_mp3, words_mp3, staged_mp3)

    sentence_duration = get_mp3_length(sentence_mp3)
    words_duration = get_mp3_length(words_mp3)
    updated_words = calculate_word_timings(words, word_boundaries, sentence_duration, words_duration)
    staged_size = staged_mp3.stat().st_size

    if material is None:
        material = {
            "id": str(uuid.uuid4()),
            "unit_id": unit["id"],
            "name": sentence_text,
            "file_path": file_path,
            "file_type": "audio",
            "file_size": staged_size,
            "sort_order": 1,
            "created_at": NOW_ISO,
        }
    else:
        material = dict(material)
        material["name"] = sentence_text
        material["file_path"] = file_path
        material["file_size"] = staged_size
        material["file_type"] = "audio"

    return {
        "unit_id": unit["id"],
        "group_name": unit["group_name"],
        "unit_name": unit["name"],
        "file_path": file_path,
        "staged_file": rel_path(staged_mp3),
        "sentence_text": sentence_text,
        "word_count": len(updated_words),
        "material": material,
        "words": updated_words,
    }


def write_public_assets(repairs: list[dict[str, Any]]) -> None:
    for repair in repairs:
        staged_file = ROOT / repair["staged_file"]
        target_file = public_audio_path(repair["file_path"])
        target_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(staged_file, target_file)


def upsert_rows(
    base_url: str,
    service_role_key: str,
    table_name: str,
    rows: list[dict[str, Any]],
    batch_size: int,
) -> None:
    rows = dedupe_rows_by_id(rows)
    if not rows:
        return

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    url = f"{base_url}/rest/v1/{table_name}?on_conflict=id"
    for batch_number, batch in enumerate(chunked(rows, batch_size), start=1):
        print(f"upserting {table_name} batch {batch_number} ({len(batch)} rows)")
        post_json(url, batch, headers=headers)


def apply_database_updates(env: dict[str, str], repairs: list[dict[str, Any]]) -> None:
    base_url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required to update audio mappings.")

    material_rows = [repair["material"] for repair in repairs]
    word_rows: list[dict[str, Any]] = []
    for repair in repairs:
        word_rows.extend(repair["words"])

    upsert_rows(base_url, service_role_key, "study_materials", material_rows, batch_size=100)
    upsert_rows(base_url, service_role_key, "study_words", word_rows, batch_size=250)


def audit_subject(subject: dict[str, Any]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    durations: dict[str, float] = {}

    for unit in subject["units"]:
        material = resolve_audio_material(unit)
        file_path = material.get("file_path") if material else None
        if not file_path:
            issues.append(
                {
                    "group_name": unit["group_name"],
                    "unit_name": unit["name"],
                    "issue": "missing_audio_path",
                }
            )
            continue

        audio_path = public_audio_path(str(file_path))
        if not audio_path.exists():
            issues.append(
                {
                    "group_name": unit["group_name"],
                    "unit_name": unit["name"],
                    "issue": "missing_audio_file",
                    "file_path": file_path,
                }
            )
            continue

        duration = get_mp3_length(audio_path)
        durations[unit["id"]] = duration
        for word in unit.get("words", []):
            start = word.get("audio_start")
            end = word.get("audio_end")
            if start is None or end is None:
                issues.append(
                    {
                        "group_name": unit["group_name"],
                        "unit_name": unit["name"],
                        "issue": "missing_word_timing",
                        "word": word["word"],
                    }
                )
                continue
            if float(end) <= float(start):
                issues.append(
                    {
                        "group_name": unit["group_name"],
                        "unit_name": unit["name"],
                        "issue": "invalid_word_window",
                        "word": word["word"],
                        "audio_start": start,
                        "audio_end": end,
                    }
                )
                continue
            if float(end) > duration + OUT_OF_RANGE_TOLERANCE:
                issues.append(
                    {
                        "group_name": unit["group_name"],
                        "unit_name": unit["name"],
                        "issue": "word_timing_exceeds_audio",
                        "word": word["word"],
                        "audio_end": end,
                        "duration": duration,
                    }
                )

    return {
        "unit_count": len(subject["units"]),
        "word_count": sum(len(unit.get("words", [])) for unit in subject["units"]),
        "issue_count": len(issues),
        "issues": issues[:200],
        "durations": durations,
    }


def fetch_english_subject() -> dict[str, Any]:
    subjects = fetch_json(f"{API_BASE}/api/subjects")
    subject_rows = subjects["subjects"] if isinstance(subjects, dict) else subjects
    english_subject = find_subject(subject_rows, SUBJECT_NAME)
    return fetch_json(f"{API_BASE}/api/subjects/{english_subject['id']}")


async def generate_repairs(
    subject: dict[str, Any], limit: int = 0, rebuild_all: bool = False
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected_units: list[dict[str, Any]] = []
    skipped_units: list[dict[str, Any]] = []

    for unit in subject["units"]:
        broken, reason = needs_rebuild(unit)
        if rebuild_all or broken:
            selected_units.append({"unit": unit, "reason": reason or "rebuild_all"})
        else:
            skipped_units.append({"unit": unit, "reason": "already_ok"})

    if limit > 0:
        selected_units = selected_units[:limit]

    repairs: list[dict[str, Any]] = []
    total = len(selected_units)
    for index, item in enumerate(selected_units, start=1):
        repair = await rebuild_unit(item["unit"], index, total)
        repair["reason"] = item["reason"]
        repairs.append(repair)

    return repairs, skipped_units


def main() -> int:
    args = parse_args()
    os.chdir(ROOT)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    STAGED_DIR.mkdir(parents=True, exist_ok=True)

    print("fetching English subject data...")
    subject = fetch_english_subject()
    BACKUP_PATH.write_text(json.dumps(subject, ensure_ascii=False, indent=2), encoding="utf-8")

    started_at = time.time()
    repairs, skipped_units = asyncio.run(
        generate_repairs(subject, limit=args.limit, rebuild_all=args.rebuild_all)
    )

    if not repairs:
        print("No broken units detected.")
        return 0

    if args.dry_run:
        print("dry-run complete: staged files generated, no public assets or database rows changed.")
    else:
        print("copying repaired audio into public/ ...")
        write_public_assets(repairs)

        print("writing updated timings to Supabase ...")
        env = read_env(ROOT / ".env.local")
        apply_database_updates(env, repairs)

    print("running verification audit ...")
    refreshed_subject = fetch_english_subject()
    audit = audit_subject(refreshed_subject)

    report = {
        "dry_run": args.dry_run,
        "voice": VOICE,
        "repaired_units": len(repairs),
        "skipped_units": len(skipped_units),
        "elapsed_seconds": round(time.time() - started_at, 2),
        "repairs": repairs,
        "audit": audit,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"repaired_units={len(repairs)}")
    print(f"verification_issue_count={audit['issue_count']}")
    print(f"report={rel_path(REPORT_PATH)}")

    return 0 if audit["issue_count"] == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
