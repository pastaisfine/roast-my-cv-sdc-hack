# syntax=docker/dockerfile:1.7
# Build from the repo root so pyproject.toml / uv.lock are in context:
#   docker build -f artifacts/api-server/ocr/runpod/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Runtime system libs for opencv-python-headless + torch on slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Exact dependency graph from uv.lock (torch CPU wheels, easyocr==1.7.2)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Runpod's queue handler SDK, layered on top of the synced venv
RUN uv pip install --python /app/.venv/bin/python "runpod>=1.7,<2"

# Only the OCR worker and the handler reach the image — build context is
# whitelisted in the repo-root .dockerignore.
COPY artifacts/api-server/ocr/worker.py /app/worker.py
COPY artifacts/api-server/ocr/runpod/handler.py /app/handler.py

# Bake the CRAFT + english_g2 weights in at build time. This runs the worker's
# full md5/identity verification; a corrupt download fails the build here.
RUN /app/.venv/bin/python worker.py --provision

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

CMD ["python", "/app/handler.py"]
