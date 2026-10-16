"""Keep coordinate-stable editorial corrections when regenerating question banks."""
import json
from pathlib import Path


def quality_review(root):
    file = Path(root) / "quality-review.private.json"
    if not file.exists():
        return lambda question: question
    changes = {row["id"]: row for row in json.loads(file.read_text(encoding="utf-8"))["changes"]}

    def apply(question):
        change = changes.get(question["id"])
        if not change:
            return question
        for key, value in change["after"].items():
            if question.get(key) not in (change["before"].get(key), value):
                raise RuntimeError(f"Quality review source drift: {question['id']} / {key}")
            if value is None:
                question.pop(key, None)
            else:
                question[key] = value
        return question

    return apply
