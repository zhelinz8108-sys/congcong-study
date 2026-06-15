#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path
from typing import Any

import edge_tts


ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synthesize static lesson audio jobs.")
    parser.add_argument("jobs_json", type=Path)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=5)
    return parser.parse_args()


def resolve_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / path


async def synthesize_job(job: dict[str, Any], out_path: Path) -> None:
    communicator = edge_tts.Communicate(
        str(job["text"]),
        voice=str(job["voice"]),
        rate=str(job.get("rate", "+0%")),
        volume=str(job.get("volume", "+0%")),
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    with tmp_path.open("wb") as audio_file:
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
    tmp_path.replace(out_path)


async def main() -> None:
    args = parse_args()
    payload = json.loads(args.jobs_json.read_text(encoding="utf-8"))
    jobs: list[dict[str, Any]] = list(payload["jobs"])
    if args.limit:
        jobs = jobs[: args.limit]

    semaphore = asyncio.Semaphore(max(1, args.concurrency))

    async def process_job(index: int, job: dict[str, Any]) -> tuple[str, dict[str, str] | None]:
        out_path = resolve_path(str(job["outPath"]))
        if out_path.exists() and out_path.stat().st_size > 1024 and not args.force:
            return "skipped", None

        label = str(job.get("id", out_path.name))
        async with semaphore:
            print(f"[{index}/{len(jobs)}] {label}")
            for attempt in range(1, 4):
                try:
                    await synthesize_job(job, out_path)
                    await asyncio.sleep(0.08)
                    return "created", None
                except Exception as exc:  # noqa: BLE001
                    if attempt >= 3:
                        print(f"  failed: {exc}")
                        return "failed", {"id": label, "error": str(exc)}
                    await asyncio.sleep(1.5 * attempt)
        return "failed", {"id": label, "error": "unknown failure"}

    created = 0
    skipped = 0
    failed: list[dict[str, str]] = []

    tasks = [asyncio.create_task(process_job(index, job)) for index, job in enumerate(jobs, start=1)]
    for task in asyncio.as_completed(tasks):
        status, failure = await task
        if status == "created":
            created += 1
        elif status == "skipped":
            skipped += 1
        elif failure:
            failed.append(failure)

    report = {
        "total": len(jobs),
        "created": created,
        "skipped": skipped,
        "failed": failed,
        "timestamp": time.time(),
    }
    report_path = ROOT / ".tmp-audio-jobs-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
