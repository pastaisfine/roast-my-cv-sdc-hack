#!/usr/bin/env python3
"""Local container smoke test for the OCR worker image.

Runs the runnable handler's --selftest inside the built image: boots the full
runtime (prctl guard under PID 1, torch import, EasyOCR weight checksums) and
runs one synthetic OCR pass end to end. No network, no Runpod involved.

Usage: python smoke_test.py [image-tag]
"""
import subprocess
import sys

IMAGE = sys.argv[1] if len(sys.argv) > 1 else "docker.io/pastaisfine/roast-my-cv-ocr:latest"

proc = subprocess.run(
    ["docker", "run", "--rm", IMAGE, "python", "/app/handler.py", "--selftest"],
    capture_output=True,
    text=True,
)

print(proc.stdout.strip())
if proc.returncode != 0:
    print(proc.stderr, file=sys.stderr)
    print(f"SELFTEST FAILED on {IMAGE}", file=sys.stderr)
sys.exit(proc.returncode)
