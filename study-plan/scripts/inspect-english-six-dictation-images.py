"""Match existing extracted assets to original PDF image coordinates."""
import hashlib
import io
import json
from pathlib import Path
from pypdf import PdfReader

APP = Path(__file__).resolve().parents[1]
ROOT = APP / "content" / "english-six"
SOURCE = APP.parent / "六上" / "英语"
for ident in ["330c16070797", "13e01fe16f01", "e8877e808c6b", "3ea65d6362c6", "8b1aeaaae914", "b2dd515ff21d"]:
    data = json.loads((ROOT / "resources" / f"{ident}.json").read_text(encoding="utf-8"))
    pdf = PdfReader(SOURCE / data["meta"]["paths"][0])
    for n, page in enumerate(pdf.pages):
        assets = {b["asset"] for b in data["pages"][n]["blocks"] if b["kind"] == "image"}
        mapped, placed = {}, []
        for key in page.images.keys():
            image = page.images[key].image.convert("RGB")
            image.thumbnail((2100, 2100))
            stream = io.BytesIO()
            image.save(stream, format="WEBP", quality=86)
            asset = hashlib.sha256(stream.getvalue()).hexdigest()[:32]
            if asset in assets:
                mapped[key] = asset
        def visitor(op, args, cm, tm):
            if op == b"Do" and str(args[0]) in mapped:
                placed.append({"asset": mapped[str(args[0])], "x": round(cm[4]), "y": round(cm[5])})
        page.extract_text(visitor_operand_before=visitor)
        assert assets == {x["asset"] for x in placed}, (ident, n, mapped, placed)
        print(json.dumps({"id": ident, "page": n + 1, "images": sorted(placed, key=lambda x: (-x["y"], x["x"]))}))
