"""Read-only whole-corpus checks; suspicious PDF text needs visual review."""
from __future__ import annotations

import collections
import json
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP / "content" / "english-six"
GLUED = re.compile(r"\b(?:themorning|theafternoon|Itwas|Firsthe|schooltoday|onhis|tothe|inthe|alloverthe|thebook|toread|tosay)\b")


def main():
    index = json.loads((ROOT / "index.json").read_text(encoding="utf-8"))
    bank = json.loads((ROOT / "bank" / "index.json").read_text(encoding="utf-8"))
    errors, suspicious_questions, suspicious_resources = [], [], []
    counts = collections.Counter()
    ids = set()
    for entry in bank["papers"]:
        paper = json.loads((ROOT / "bank" / "papers" / f'{entry["id"]}.json').read_text(encoding="utf-8"))
        if len(paper["questions"]) != entry["questionCount"]:
            errors.append({"paper": entry["id"], "reason": "question-count"})
        for q in paper["questions"]:
            counts[q["kind"]] += 1
            reasons = []
            if q["id"] in ids:
                reasons.append("duplicate-id")
            ids.add(q["id"])
            if not q.get("answer", "").strip() or not q.get("explanation", "").strip():
                reasons.append("missing-answer-or-explanation")
            if q["options"]:
                option_ids = [o["id"] for o in q["options"]]
                if len(set(option_ids)) != len(option_ids) or q["answer"] not in option_ids:
                    reasons.append("invalid-choice-key")
            elif q["grading"] == "exact":
                blanks = len(re.findall(r"[_＿]{2,}", q["prompt"]))
                if len(q["accepted"]) != blanks:
                    reasons.append("blank-answer-slot-mismatch")
            if reasons:
                errors.append({"id": q["id"], "paper": entry["id"], "reasons": reasons})
            texts = [q["prompt"], q.get("context", ""), *[o["text"] for o in q["options"]]]
            if any(GLUED.search(t) or re.search(r"[A-Za-z] {4,}[A-Za-z]", t) for t in texts):
                suspicious_questions.append({"id": q["id"], "paper": entry["id"], "prompt": q["prompt"]})
    for resource in index["resources"]:
        data = json.loads((ROOT / "resources" / f'{resource["id"]}.json').read_text(encoding="utf-8"))
        pages = []
        for n, page in enumerate(data.get("pages", []), 1):
            text = "\n".join(b.get("text", "") for b in page["blocks"] if b["kind"] == "text")
            orphan_gaps = len(re.findall(r"\b[A-Za-z] {4,}(?=[A-Za-z]|$)", text, re.M))
            if orphan_gaps >= 3 or GLUED.search(text):
                pages.append({"page": n, "orphanInitials": orphan_gaps, "mergedWords": sorted(set(GLUED.findall(text)))})
        if pages:
            suspicious_resources.append({"id": resource["id"], "title": resource["title"], "extension": resource["extension"],
                                         "interactiveQuestions": sum(p["questionCount"] for p in bank["papers"] if p["sourceId"] == resource["id"]),
                                         "pages": pages})
    report = {"resourcesScanned": len(index["resources"]), "bankQuestionsScanned": sum(counts.values()),
              "kinds": dict(counts), "errors": errors, "suspiciousQuestions": suspicious_questions,
              "suspectReaderResources": suspicious_resources, "completeSourceConversion": bank["complete"],
              "scope": "Whole-corpus automated structure/text checks, not an assertion of semantic correctness for every source PDF."}
    out = APP / "tmp" / "english-six-content-audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in {"errors", "suspiciousQuestions", "suspectReaderResources"}}, ensure_ascii=False))
    print(json.dumps({"structuralErrors": len(errors), "suspectQuestions": len(suspicious_questions), "suspectReaders": len(suspicious_resources)}, ensure_ascii=False))
    for q in suspicious_questions:
        print(json.dumps(q, ensure_ascii=False))


if __name__ == "__main__":
    main()
