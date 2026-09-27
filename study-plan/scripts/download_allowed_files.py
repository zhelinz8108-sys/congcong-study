from __future__ import annotations

import argparse
import csv
import re
import sys
import time
from dataclasses import dataclass
from email.message import Message
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
)


@dataclass(frozen=True)
class DownloadJob:
    url: str
    filename: str | None = None


def sanitize_filename(value: str) -> str:
    name = unquote(value).strip().replace("\\", "-").replace("/", "-")
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "-", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    return name[:180] or "download"


def filename_from_url(url: str) -> str:
    parsed = urlparse(url)
    candidate = Path(parsed.path).name
    if not candidate:
        candidate = parsed.netloc or "download"
    if "." not in candidate:
        candidate += ".pdf"
    return sanitize_filename(candidate)


def filename_from_headers(headers: Message) -> str | None:
    disposition = headers.get("Content-Disposition", "")
    match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', disposition, re.I)
    if not match:
        return None
    return sanitize_filename(match.group(1))


def parse_jobs(path: Path) -> list[DownloadJob]:
    jobs: list[DownloadJob] = []
    text = path.read_text(encoding="utf-8-sig")

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if "\t" in line:
            filename, url = line.split("\t", 1)
            jobs.append(DownloadJob(url=url.strip(), filename=sanitize_filename(filename)))
            continue

        if "," in line and not line.lower().startswith(("http://", "https://")):
            row = next(csv.reader([line]))
            if len(row) >= 2:
                jobs.append(
                    DownloadJob(url=row[1].strip(), filename=sanitize_filename(row[0]))
                )
                continue

        jobs.append(DownloadJob(url=line))

    return jobs


def iter_chunks(response, size: int = 1024 * 128) -> Iterable[bytes]:
    while True:
        chunk = response.read(size)
        if not chunk:
            break
        yield chunk


def download_one(
    job: DownloadJob,
    out_dir: Path,
    *,
    overwrite: bool,
    timeout: int,
    user_agent: str,
) -> tuple[str, Path | None]:
    filename = job.filename or filename_from_url(job.url)
    target = out_dir / filename
    partial = out_dir / f"{filename}.part"

    if target.exists() and not overwrite:
        return "skipped", target

    headers = {"User-Agent": user_agent}
    existing_size = partial.stat().st_size if partial.exists() and not overwrite else 0
    if existing_size:
        headers["Range"] = f"bytes={existing_size}-"

    request = Request(job.url, headers=headers)

    try:
        with urlopen(request, timeout=timeout) as response:
            if not job.filename:
                header_filename = filename_from_headers(response.headers)
                if header_filename:
                    target = out_dir / header_filename
                    partial = out_dir / f"{header_filename}.part"
                    if target.exists() and not overwrite:
                        return "skipped", target

            mode = "ab" if existing_size and response.status == 206 else "wb"
            with partial.open(mode) as file:
                for chunk in iter_chunks(response):
                    file.write(chunk)

        partial.replace(target)
        return "downloaded", target
    except HTTPError as error:
        return f"http_error_{error.code}", None
    except URLError as error:
        return f"url_error_{getattr(error.reason, 'errno', 'unknown')}", None
    except TimeoutError:
        return "timeout", None


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Download a user-provided list of allowed direct file URLs. "
            "This tool does not crawl sites or bypass logins."
        )
    )
    parser.add_argument("--urls", required=True, type=Path, help="UTF-8 text file of URLs.")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("downloads/reading"),
        help="Folder where files will be saved.",
    )
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between downloads.")
    parser.add_argument("--timeout", type=int, default=90, help="Per-file timeout in seconds.")
    parser.add_argument("--overwrite", action="store_true", help="Re-download existing files.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned downloads only.")
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
    args = parser.parse_args()

    jobs = parse_jobs(args.urls)
    if not jobs:
        print(f"No URLs found in {args.urls}", file=sys.stderr)
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Found {len(jobs)} URL(s). Output: {args.out_dir.resolve()}")

    for index, job in enumerate(jobs, start=1):
        filename = job.filename or filename_from_url(job.url)
        print(f"[{index}/{len(jobs)}] {filename}")
        if args.dry_run:
            print(f"  {job.url}")
            continue

        status, target = download_one(
            job,
            args.out_dir,
            overwrite=args.overwrite,
            timeout=args.timeout,
            user_agent=args.user_agent,
        )
        print(f"  {status}{f': {target}' if target else ''}")

        if index < len(jobs) and args.delay > 0:
            time.sleep(args.delay)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
