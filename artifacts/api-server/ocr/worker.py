"""Private, sequential stdio worker. CV bytes/text live in memory, never files/logs."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import warnings

# On Linux, kill this private child if the API parent exits unexpectedly.
# No inference job may outlive its owning server.
if sys.platform == "linux":
    import ctypes
    import signal
    parent = os.getppid()
    ctypes.CDLL(None).prctl(1, signal.SIGKILL)
    if os.getppid() != parent:
        sys.exit(1)

os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"
MODEL_DIR = Path(__file__).resolve().parent / "models"
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 4_000_000


def reader_setup(download=False):
    import torch
    import easyocr
    from easyocr.config import recognition_models, detection_models
    from easyocr.utils import calculate_md5
    torch.set_num_threads(2)
    MODEL_DIR.mkdir(exist_ok=True)
    reader = easyocr.Reader(
        ["en"], gpu=False, recog_network="english_g2",
        model_storage_directory=str(MODEL_DIR),
        download_enabled=download, verbose=False,
    )
    # Verify identity and both weights, including the detector, at every startup.
    assert reader.model_lang == "english"
    assert reader.character == recognition_models["gen2"]["english_g2"]["characters"]
    for model in (recognition_models["gen2"]["english_g2"], detection_models["craft"]):
        assert calculate_md5(str(MODEL_DIR / model["filename"])) == model["md5sum"]
    return reader


def extract(reader, encoded):
    import numpy as np
    from PIL import Image, ImageOps
    raw = base64.b64decode(encoded, validate=True)
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("limit")
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("PNG", "JPEG") or getattr(source, "n_frames", 1) != 1:
                raise ValueError("format")
            w, h = source.size
            if w * h > MAX_PIXELS or max(w, h) > 4000 or min(w, h) < 32:
                raise ValueError("limit")
            source.verify()
        with Image.open(io.BytesIO(raw)) as source:
            image = np.array(ImageOps.exif_transpose(source).convert("RGB"))
    del raw
    def recognize(pixels):
        return reader.readtext(pixels, detail=1, paragraph=False, batch_size=1, workers=0, canvas_size=1800)
    results = recognize(image)
    rotated = False
    # Do not enable per-box rotation_info: on short English lines it can prefer
    # spurious one-character rotations. Compare whole-page orientations instead.
    quality = sum(float(row[2]) * sum(c.isalnum() for c in row[1]) for row in results)
    if results and (quality < 30 or quality / max(1, len(results)) < 6):
        for turns in (1, 2, 3):
            candidate = recognize(np.ascontiguousarray(np.rot90(image, turns)))
            score = sum(float(row[2]) * sum(c.isalnum() for c in row[1]) for row in candidate)
            if score > quality:
                results, quality, rotated = candidate, score, True
    # EasyOCR groups words into lines; retain line breaks in top-to-bottom order.
    results.sort(key=lambda row: (round(min(p[1] for p in row[0]) / 12), min(p[0] for p in row[0])))
    text = "\n".join(row[1] for row in results).strip()
    notes = []
    if rotated:
        notes.append("Page orientation was adjusted automatically. Check reading order and spelling.")
    if not text:
        notes.append("No readable English text found. Try a clearer, upright image or paste text.")
    elif len(text) < 40 or any(float(row[2]) < 0.5 for row in results):
        notes.append("Some text may be incomplete or inaccurate. Check and edit before reviewing.")
    if len(text) > 12000:
        notes.append("OCR output trimmed to 12,000 characters.")
    return {"text": text[:12000], "warnings": notes, "model": "english_g2", "device": "cpu"}


def main():
    try:
        reader = reader_setup("--provision" in sys.argv)
    except Exception:
        print(json.dumps({"error": "unavailable"}), flush=True)
        return 1
    print(json.dumps({"ready": True, "model": "english_g2", "device": "cpu"}), flush=True)
    if "--provision" in sys.argv:
        return 0
    while True:
        # Parent also bounds the request; refuse unexpectedly long protocol lines.
        line = sys.stdin.readline(14 * 1024 * 1024 + 1)
        if not line:
            return 0
        try:
            if len(line) > 14 * 1024 * 1024:
                return 1
            request = json.loads(line)
            result = extract(reader, request["imageBase64"])
        except Exception:
            result = {"error": "invalid_image"}
        finally:
            line = None
            request = None
        print(json.dumps(result), flush=True)
        result = None


if __name__ == "__main__":
    sys.exit(main())
