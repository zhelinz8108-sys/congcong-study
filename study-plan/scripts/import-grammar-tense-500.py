from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from docx import Document


QUESTION_RE = re.compile(r"^(\d+)\.\s*(.+)$")
ANSWER_RE = re.compile(r"^答案：([ABCD])\s+解析：(.*)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert the 500-question tense DOCX into the website JSON format."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def split_options(line: str) -> list[str]:
    parts = re.split(r"\s+(?=[ABCD]\.\s*)", line.strip())
    options: list[str] = []
    for letter, part in zip("ABCD", parts, strict=False):
        match = re.match(rf"^{letter}\.\s*(.*)$", part)
        if not match:
            raise ValueError(f"Could not parse option {letter}: {line}")
        options.append(match.group(1).strip())
    if len(options) != 4:
        raise ValueError(f"Expected four options: {line}")
    return options


def main() -> None:
    args = parse_args()
    paragraphs = [
        paragraph.text.strip()
        for paragraph in Document(args.source).paragraphs
        if paragraph.text.strip()
    ]

    if len(paragraphs) < 8:
        raise ValueError("The document does not contain the expected question-bank structure.")

    title, subtitle = paragraphs[0], paragraphs[1]
    topics: list[dict[str, object]] = []
    questions: list[dict[str, object]] = []
    current_topic: dict[str, object] | None = None
    index = 5

    while index < len(paragraphs):
        line = paragraphs[index]
        question_match = QUESTION_RE.match(line)

        if not question_match:
            current_topic = {
                "id": len(topics) + 1,
                "title": line,
                "questionCount": 0,
            }
            topics.append(current_topic)
            index += 1
            continue

        if current_topic is None:
            raise ValueError(f"Question {question_match.group(1)} has no topic heading.")
        if index + 2 >= len(paragraphs):
            raise ValueError(f"Question {question_match.group(1)} is incomplete.")

        question_id = int(question_match.group(1))
        options = split_options(paragraphs[index + 1])
        answer_match = ANSWER_RE.match(paragraphs[index + 2])
        if not answer_match:
            raise ValueError(f"Could not parse answer for question {question_id}.")

        answer = answer_match.group(1)
        answer_index = ord(answer) - ord("A")
        questions.append(
            {
                "id": question_id,
                "topicId": current_topic["id"],
                "prompt": question_match.group(2).strip(),
                "options": options,
                "answer": answer,
                "answerText": options[answer_index],
                "explanation": answer_match.group(2).strip(),
            }
        )
        current_topic["questionCount"] = int(current_topic["questionCount"]) + 1
        index += 3

    expected_ids = list(range(1, 501))
    actual_ids = [int(question["id"]) for question in questions]
    if actual_ids != expected_ids:
        raise ValueError(
            f"Expected question IDs 1-500 in order; parsed {len(questions)} questions."
        )
    if sum(int(topic["questionCount"]) for topic in topics) != 500:
        raise ValueError("Topic question counts do not add up to 500.")

    payload = {
        "title": title,
        "subtitle": subtitle,
        "sourceFile": args.source.name,
        "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "topics": topics,
        "questions": questions,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Imported {len(questions)} questions across {len(topics)} topics to {args.output}"
    )


if __name__ == "__main__":
    main()
