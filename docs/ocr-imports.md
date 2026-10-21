# CV imports and CPU OCR

## Privacy boundary

Own real CVs and fictional CVs may be imported and reviewed locally. This supersedes the earlier synthetic-only **local review** restriction. Server radar / optional RunPod remains fictional-only and requires its original two confirmations. As an additional safeguard, all imported documents (including fictional imports) are locked to local review; load the built-in fictional sample to enable optional server radar. Editing resets both radar confirmations.

The browser uses PDF.js's supported legacy build and matching worker to inspect every page (the modern build requires Map methods missing in some browsers). Usable selectable text means at least 40 ASCII letters/digits on that page; other pages are offered for OCR. The original PDF and selectable-text pages are never sent. English OCR may miss non-English text, layouts, handwriting, small text and complex columns. Text is assembled in original PDF page order. If an OCR page fails, selectable text already available for that page is retained and a page warning is shown. Blank/failed extraction keeps the old editor text. Undo last import restores the previous editor text after a non-empty import, including partial/truncated results; Clear and Load sample also clear this one-session undo buffer. No import automatically starts review or radar.

OCR consent is per import, not a persistent setting. It names the number of images/pages and is separate from radar consent. Upload attempt counts include failed/cancelled requests because a sent image cannot be recalled. The worker processes bytes and output in memory only: no CV files, database records, application cache, document logs or CV vectors. Responses use `Cache-Control: no-store`. Refresh restores the fictional built-in sample; imported content is never put in browser storage. Infrastructure-level transport handling is outside the application’s retention guarantees.

## Reproducible setup (no GPU)

Validated on Linux x86-64, Python 3.13.11, torch 2.10.0+cpu, torchvision 0.25.0+cpu, EasyOCR 1.7.2 and Pillow 12.1.1. See root `pyproject.toml` and `uv.lock` for the complete resolved dependency set. CPU wheels are explicitly sourced only for torch and torchvision, not EasyOCR. No paid infrastructure, third-party inference API, public worker port or GPU is used.

From the project root:

```sh
UV_PROJECT_ENVIRONMENT=.pythonlibs uv sync --frozen
.pythonlibs/bin/python artifacts/api-server/ocr/worker.py --provision
.pythonlibs/bin/python artifacts/api-server/ocr/check.py
pnpm --filter @workspace/api-server run test:ocr
pnpm --filter @workspace/api-server run test:imports
pnpm --filter @workspace/api-server run test:radar
pnpm run typecheck
```

Dependency provisioning uses the project-managed Python package directory, not a manually activated environment. Setup downloads EasyOCR's official CRAFT detector and `english_g2` recognition weights to `artifacts/api-server/ocr/models/` (excluded from Git). Reader configuration is explicitly `["en"]`, `recog_network="english_g2"`, `gpu=False`. Startup verifies the English character set and the expected checksums of both files from the pinned EasyOCR registry. A missing, mismatched or unavailable model fails closed; no substitute engine is used. Network is needed for setup only. Runtime has `download_enabled=False` and accepts no model paths from users. Re-run provisioning to restore missing/corrupt weights.

Post-merge setup installs the locked dependencies and provisions weights before workflow reconciliation. First-time downloads can take several minutes. Normal development workflow starts only the existing API; it lazily spawns a private sequential Python child over stdio. The CPU reader is reused. Killing/cancelling an active job destroys that worker's memory; unrelated waiting jobs can start a new reader. Missing runtime/weights produce a clear 503 response; the local app still works.

On the measured Linux host, one four-megapixel synthetic OCR process reached a 3,057 MiB (2.99 GiB) RSS high-water mark and raised total cgroup memory by about 3.10 GiB at peak. Keep at least 3.2 GiB free above the API's normal footprint for one OCR worker, plus roughly 100 MiB of headroom for three maximum-size base64 inputs and request buffers; maintain at least 2 GiB of additional cgroup headroom. The test image was a compact 189 KiB PNG, so the request-buffer allowance is a bound-based estimate, not a measurement of three 10 MiB uploads. Do not multiply this single-worker budget across replicas without a new host-level test. Package/model downloads need additional disk space. Production deployment and paid endpoint verification are not part of this change.

## Bounds and failures

- Original file: 10 MiB. Accepted content: PDF, single-frame PNG or JPEG. Names/extensions do not override content checks.
- Editor and each OCR output: 12,000 characters, with a truncation warning.
- PDF: 10 pages; at most 20 million rendered pixels total. Scanned page base dimensions must be at most 4,000 pixels per side and 4 million pixels; render scale is at most 2 with the same per-page caps.
- Raster: minimum 32 pixels each side, maximum 4,000 pixels each side, maximum 4 million pixels. Browser headers must fit in 128 KiB. Pillow validates actual format, frame count and decode before OCR.
- Private worker: one active request and at most two waiting requests. Global anonymous rate budget: 24 requests/minute, retaining only a counter/time, not IPs.
- API body: 14 MiB including base64; decoded image: 10 MiB. Input requires the OCR consent header plus `ocrConsent: true`.
- Startup: 120 seconds. Queue/initialization total: 180 seconds per waiting job. Active OCR: 60 seconds. Failure cooldown: 10 seconds. PDF import lifetime: 10 minutes including consent and remote processing.
- Browser cancellation aborts fetch/render and destroys PDF.js resources. Server disconnect cancels queued work or kills active worker. The worker is also killed if its API parent exits unexpectedly. Temporary canvas buffers are released. There are no uploaded temporary files to remove on any outcome.
- Request parsing, decoding, capacity, timeout and unavailable-worker errors are sanitized. The worker's stderr is discarded by the parent; stdout is used only as a bounded private result protocol. No document text or filenames are copied into logs.
- Input changes, Clear, Load sample, cancellation and a newer import invalidate old import results and reset radar confirmations. Existing editable text is replaced only by a successful non-empty extraction.

## Sustained CPU load check

Run the following on the intended Linux host while the API Server workflow is running:

```sh
OCR_SOAK_DURATION_MS=150000 pnpm --filter @workspace/api-server run soak:ocr
```

The harness creates a synthetic 2000×2000 PNG (the worker's four-million-pixel limit), bundles and instantiates the production `OcrWorker` class, then keeps its one active slot and two waiting slots saturated. It checks that a fourth request gets 429, cancels one active job while two synthetic jobs wait, measures when the queued work restarts and completes, and aborts queued work at the end of the measurement window. During saturation it samples `/api/healthz`, `/api/radar/reference`, and the local-only `/api/radar/pathway`; it does not call `/api/radar/match`, RunPod, or any external inference service. No real CVs are read or used.

The report is written to ignored `generated-artifacts/ocr-soak-report.json`; it includes host CPU/RAM limits, per-worker RSS/high-water memory, cgroup memory, queue/service delay percentiles, cancellation and process-exit results, and the local action latencies. A default 180-second load can be selected by omitting the override. This direct class harness intentionally goes around the HTTP OCR request-rate limiter so it can sustain a full worker queue; HTTP validation/rate limiting remains covered by `test:ocr`. Treat the result as a single-worker, single-host budget, not as a production guarantee or a basis for adding replicas.

### Soak result — 2026-10-21

- Synthetic-only 150-second saturation on Linux x86-64 with a four-CPU quota and an 8 GiB cgroup memory limit. The harness processed five four-megapixel jobs during the measured window (2 jobs/minute); active OCR time was 26.7 seconds at p50 and 28.1 seconds at p95. Queue delay was 52.8 seconds at p50 and 56.1 seconds at p95 with all three worker slots saturated for all 150 one-second samples.
- The worker's sampled RSS peaked at 3,045 MiB (3,057 MiB high-water mark). Total cgroup memory peaked at 5,150 MiB from a 1,975 MiB baseline, a 3,176 MiB increase; after cleanup it was 2,424 MiB. First-to-last decile worker RSS median increased by 81 MiB during the load window. This is a short-run allocation trend, not evidence of zero long-term growth; the worker and queue held no job/image references after cleanup.
- Active cancellation returned 499 and killed its child. Queued work resumed after 8.5 seconds and both queued jobs completed within 70.2 seconds of cancellation. Both observed worker PIDs exited, with no pending jobs or retained image references after final cancellation.
- While saturated, 50 samples per endpoint all returned 200. p95 latency was 19.7 ms for health, 18.8 ms for radar reference, and 14.3 ms for the local pathway; the slowest observed action was 34.4 ms.
- These results support a one-worker budget on this host, not production guarantees. The measured 81 MiB within-run RSS increase should be tracked in a longer soak before making claims about long-term stability or increasing queue/concurrency limits.

## Synthetic validation

`ocr/fixtures.py` generates clean PNG/JPEG, rotated and degraded images, blank images, scanned/text/mixed PDFs, corrupt/encrypted documents, oversized images and page/pixel-limit cases under ignored `generated-artifacts/cv-fixtures/`. Fixtures contain only fictional text. `ocr/check.py` checks expected phrases rather than exact OCR formatting and validates blank/resource/invalid input behavior. `test:ocr` verifies API consent, actual format validation, cache controls, worker failure, bounded queue/cancellation and absence of document logging. `test:imports` exercises the pipeline with deterministic PDF/render/OCR adapters: local-only PDFs, mixed ordering, pre-consent zero uploads, limits, encrypted/corrupt errors, cancellation, partial failures and truncation. Actual PDF.js canvas rendering and UI state are verified separately in the browser.

### Verification record — 2026-10-21

- CPU smoke passed: explicit English model/checksums, expected phrases in clean PNG/JPEG and rotated input, degraded-image warnings, blank output, malformed/oversized/pixel-limited images, private stdio lifecycle. Both model files were provisioned successfully.
- Five API/worker regression checks and eight import-pipeline checks passed. Existing 13 radar checks and the full workspace typecheck passed.
- Browser verification used only generated synthetic fixtures. Text PDFs produced zero OCR requests; consent decline produced zero uploads; image/scanned PDF imports used actual CPU OCR without starting review/radar. Mixed PDF uploaded only page 2 and retained exactly three page blocks; distinct page ordering also has a deterministic regression with unique first/middle/last text.
- Blank, corrupt, encrypted, unsupported, byte/page/pixel-limited imports retained existing editable text. Synthetic 503 and delayed responses after cancel/clear/sample/edit/new import did not overwrite current text. Undo restored the previous editor text. Refresh restored the fictional built-in sample. Consent actions fit a 390×844 viewport. No radar POST occurred.
- The first browser pass exposed a PDF.js modern-build compatibility failure limited to rendering. Switching to the supported legacy distribution and matching worker resolved it, confirmed by the same tester on the blocked and remaining flows.
- Browser regression script and evidence live in ignored `generated-artifacts/`; the managed browser executed the scenarios. The saved standalone script was syntax-checked, not run as a local Node command, because Playwright is not a declared workspace dependency.
- No real CV test data, production deployment, paid GPU/RunPod provisioning, or paid endpoint smoke test was used. The synthetic sustained-load measurement is documented above.
