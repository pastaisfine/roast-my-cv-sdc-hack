#!/bin/bash
set -e
pnpm install --frozen-lockfile
UV_PROJECT_ENVIRONMENT=.pythonlibs uv sync --frozen
.pythonlibs/bin/python artifacts/api-server/ocr/worker.py --provision
pnpm --filter @workspace/db run push
