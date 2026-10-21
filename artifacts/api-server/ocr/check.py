"""CPU model/output smoke plus format/resource checks. Uses synthetic content only."""
import json
import subprocess
import sys
from pathlib import Path
import base64
import fixtures
from worker import reader_setup, extract

fixtures.generate()
reader = reader_setup()
def read(name):
    return base64.b64encode((fixtures.OUT / name).read_bytes()).decode()
for name in ["clean.png", "clean.jpg", "rotated.png"]:
    result = extract(reader, read(name))
    assert "python" in result["text"].lower(), (name, "Expected synthetic skill missing")
    assert "sql" in result["text"].lower(), (name, "Expected synthetic skill missing")
    assert result["model"] == "english_g2" and result["device"] == "cpu"
    print(name, "expected synthetic phrases found")
degraded = extract(reader, read("low-quality.jpg"))
assert "sql" in degraded["text"].lower() and degraded["warnings"]
assert extract(reader, read("blank.png"))["warnings"]
for name in ["too-wide.png", "too-many-pixels.png", "unsupported.txt", "corrupt.pdf", "oversized.png"]:
    try:
        extract(reader, read(name))
        raise AssertionError("Expected rejection: " + name)
    except (ValueError, OSError):
        pass
# Real stdio worker lifecycle; no request data or output text printed.
worker = subprocess.Popen([sys.executable, "-u", str(Path(__file__).with_name("worker.py"))], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
try:
    assert json.loads(worker.stdout.readline())["ready"]
    worker.stdin.write(json.dumps({"imageBase64": read("clean.png")}) + "\n"); worker.stdin.flush()
    assert "python" in json.loads(worker.stdout.readline())["text"].lower()
finally:
    worker.kill(); worker.wait()
assert not list(Path(__file__).parent.glob("*.png"))
print("English CPU OCR smoke, blank/limits/invalid input, and private pipe checks passed.")
