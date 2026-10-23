# Runpod serverless deployment — OCR worker

Public-facing Runpod endpoint wrapping [`../worker.py`](../worker.py) (EasyOCR
`english_g2` + CRAFT, CPU-only). The worker itself is untouched: this folder only
loads it. Weights are checksum-verified at build time and again at every boot.

## What's here

| File | Role |
| --- | --- |
| `handler.py` | Runpod queue handler; loads `worker.py` once per cold start. `--selftest` runs the full pipeline on a synthetic PNG. |
| `Dockerfile` | `uv sync --frozen` from the repo root (CPU torch wheels per `pyproject.toml`), provisions weights at build time. |
| `smoke_test.py` | `docker run --selftest` wrapper — the one-liner validation pass. |
| `/.dockerignore` (repo root) | Whitelist build context: `**` except `pyproject.toml`, `uv.lock`, `worker.py`, this folder. `.env`, `node_modules`, `.git`, local `models/` never enter the image. |

## Build (repo root)

```bash
docker build -f artifacts/api-server/ocr/runpod/Dockerfile -t <dockerhub-user>/roast-my-cv-ocr:latest .
```

Validate before pushing anything:

```bash
python artifacts/api-server/ocr/runpod/smoke_test.py
```

Expect `{"selftest": true, ...}` with recognized text `RUNPOD OCR 12345`. This
proves, offline and for free: the worker's PDEATHSIG guard is inert under PID 1,
both weight checksums verify inside the image, and the extraction path works.

## Push (your credentials, interactive)

```bash
docker login
docker push <dockerhub-user>/roast-my-cv-ocr:latest
```

## Deploy

Endpoint `roast-my-cv-ocr`, queue worker, image `<dockerhub-user>/roast-my-cv-ocr:latest`.
Hardware: CPU `cpu3c` Compute-Optimized, 2 vCPU (matches the worker's hardcoded
`OMP_NUM_THREADS=2`), 4 GB RAM. Scaling: min 0 / max 3. Workers **must be
CPU-only** (`device` in the worker's response is `"cpu"` by design; `gpu=False`
is a verified contract, not a limitation to fix on the cloud).

Cost as deployed: $0.072/worker-hr × at most 3 workers, $0 when idle
(scale-to-zero). A 2–8 s job spot-checks at ~1/20th of a cent of runtime.
Tune or tear down from the Runpod console → Serverless → `roast-my-cv-ocr`.

## Call

```bash
curl -X POST "https://api.runpod.ai/v2/<endpoint-id>/runsync" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"imageBase64":"'"$(base64 -w0 photo.png)"'"}}'
```

Response equals the worker's own envelope: `{"text", "warnings", "model",
"device"}` or `{"error": "invalid_image"}`.

Payload routing rule (verified against Runpod's operation reference):
`/runsync` accepts whole requests up to 20 MB and `?wait=300000` (ms) to cover
a cold start — at your API's ceiling of 10 MB raw / 13.98 MB base64 that is
*always* the route. `/run` caps at 10 MB whole-request, so only use it queued
with raw scans ≤ ~7.4 MB, then poll `/status/<id>`; `/runsync` result retention
is 60 s after completion.

## Wired into the application

`artifacts/api-server/src/lib/ocr-runpod.ts` is the client the API routes use
when `RUNPOD_OCR_URL` is set: it submits to `/runsync?wait=60000`, falls back
to `/status/<id>` polling when a cold start outlives the hold (total bound
180 s, mirroring the local pipe), maps the worker envelope 1:1, its
`invalid_image` envelope to the same 422 the local pipe produces, and caller
aborts to 499. With no `RUNPOD_OCR_URL`, `OcrWorker` keeps spawning the local
Python child exactly as before. Env contract:
`RUNPOD_OCR_URL=https://api.runpod.ai/v2/<endpoint-id>`,
`RUNPOD_API_KEY=<create/run key>`, optional `RUNPOD_OCR_POLL_MS` (default
`3000`; also the test seam). Tests: `pnpm --filter @workspace/api-server run
test:ocr-runpod`.
