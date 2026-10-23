"""Runpod queue handler for the private OCR worker.

Cold start: load and checksum-verify both EasyOCR weights exactly once, then
serve jobs that carry the same `imageBase64` envelope the stdio protocol in
worker.py expects. No code duplication: this file only loads worker.py.
"""
import base64
import importlib.util
import io
import json
import sys
from pathlib import Path

import runpod

HERE = Path(__file__).resolve().parent
_worker_spec = importlib.util.spec_from_file_location("deployed_ocr_worker", HERE / "worker.py")
ocr_worker = importlib.util.module_from_spec(_worker_spec)
_worker_spec.loader.exec_module(ocr_worker)

# Runs the worker's own identity + checksum assertions. A wrong or missing
# weight file fails this import, which fails the container boot in turn.
READER = ocr_worker.reader_setup(download=False)


def handler(event):
    job_input = (event or {}).get("input") or {}
    image_b64 = job_input.get("imageBase64")
    if not image_b64:
        return {"error": "invalid_image"}
    try:
        return ocr_worker.extract(READER, image_b64)
    except Exception:
        return {"error": "invalid_image"}


def _selftest() -> bool:
    """Full pipeline over a synthetic PNG; no network, no runpod transport needed."""
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (960, 320), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=72)
    draw.text((48, 110), "RUNPOD OCR 12345", fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)

    result = ocr_worker.extract(READER, base64.b64encode(buffer.getvalue()).decode("ascii"))
    text = (result or {}).get("text", "").upper()
    compact = "".join(text.split())
    ok = "RUNPOD" in compact and "12345" in compact
    print(json.dumps({"selftest": ok, "result": result}), flush=True)
    return ok


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if _selftest() else 1)
    runpod.serverless.start({"handler": handler})
