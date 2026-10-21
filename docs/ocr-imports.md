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

Budget roughly 1–2 GB RAM for the model/dependencies plus bounded image intermediates; two CPU threads are used. Package/model downloads require additional disk space. Measure capacity on the actual host before production use. Production deployment and paid endpoint verification are not part of this change.

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

## Synthetic validation

`ocr/fixtures.py` generates clean PNG/JPEG, rotated and degraded images, blank images, scanned/text/mixed PDFs, corrupt/encrypted documents, oversized images and page/pixel-limit cases under ignored `generated-artifacts/cv-fixtures/`. Fixtures contain only fictional text. `ocr/check.py` checks expected phrases rather than exact OCR formatting and validates blank/resource/invalid input behavior. `test:ocr` verifies API consent, actual format validation, cache controls, worker failure, bounded queue/cancellation and absence of document logging. `test:imports` exercises the pipeline with deterministic PDF/render/OCR adapters: local-only PDFs, mixed ordering, pre-consent zero uploads, limits, encrypted/corrupt errors, cancellation, partial failures and truncation. Actual PDF.js canvas rendering and UI state are verified separately in the browser.

### Verification record — 2026-10-21

- CPU smoke passed: explicit English model/checksums, expected phrases in clean PNG/JPEG and rotated input, degraded-image warnings, blank output, malformed/oversized/pixel-limited images, private stdio lifecycle. Both model files were provisioned successfully.
- Five API/worker regression checks and eight import-pipeline checks passed. Existing 13 radar checks and the full workspace typecheck passed.
- Browser verification used only generated synthetic fixtures. Text PDFs produced zero OCR requests; consent decline produced zero uploads; image/scanned PDF imports used actual CPU OCR without starting review/radar. Mixed PDF uploaded only page 2 and retained exactly three page blocks; distinct page ordering also has a deterministic regression with unique first/middle/last text.
- Blank, corrupt, encrypted, unsupported, byte/page/pixel-limited imports retained existing editable text. Synthetic 503 and delayed responses after cancel/clear/sample/edit/new import did not overwrite current text. Undo restored the previous editor text. Refresh restored the fictional built-in sample. Consent actions fit a 390×844 viewport. No radar POST occurred.
- The first browser pass exposed a PDF.js modern-build compatibility failure limited to rendering. Switching to the supported legacy distribution and matching worker resolved it, confirmed by the same tester on the blocked and remaining flows.
- Browser regression script and evidence live in ignored `generated-artifacts/`; the managed browser executed the scenarios. The saved standalone script was syntax-checked, not run as a local Node command, because Playwright is not a declared workspace dependency.
- No real CV test data, production deployment, paid GPU/RunPod provisioning, or paid endpoint smoke test was used. Sustained host-load capacity is not measured by these functional checks.
