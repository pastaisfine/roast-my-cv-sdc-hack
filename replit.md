# Roast My CV

A Malaysian graduate CV-coaching prototype with local readiness analysis and a source-grounded Future Skills Radar.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Radar checks: `pnpm --filter @workspace/api-server run test:radar`
- OCR setup, CPU requirements, bounds and privacy: `docs/ocr-imports.md`
- OCR checks: `pnpm --filter @workspace/api-server run test:ocr`, `test:imports` and `smoke:ocr`
- Roast contract, consent, fallbacks and env: `docs/roast-endpoint.md`
- Roast deterministic checks: `pnpm --filter @workspace/api-server run test:roast`
- Roast live smoke (fixed synthetic fixtures, spends free-tier tokens):
  `ROAST_SMOKE_APPROVED=true ROAST_SMOKE_DELAY_MS=30000 pnpm --filter @workspace/api-server run smoke:roast`
- Workspace production builds need build-time `PORT` and `BASE_PATH`; use `PORT=5173 BASE_PATH=/ pnpm -r --if-present run build` for compilation checks. Managed workflows supply runtime values.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/radar-data` — versioned public reference snapshots, curated roles and shared evidence/pathway logic.
- `artifacts/api-server/src/lib/radar` — bounded RunPod adapter and matching service.
- `artifacts/api-server/src/lib/gemini` — Gemini client, extraction validation, deterministic gaps/score and template roast.
- `artifacts/api-server/src/routes/roast.ts` — unified `POST /api/roast` route.
- `artifacts/roast-my-cv/src/components/radar` — interactive explorer and role details.
- `docs/radar-sources.md` — verified official references and source discrepancies.
- `docs/radar-operator-guide.md` — cost proposal, approval gates, endpoint setup, evaluation and shutdown.
- `docs/roast-endpoint.md` — roast request/response, consent, validation, fallbacks and free-tier limits.

## Architecture decisions

- Keep radar matching separate from legacy readiness/scenario formulas; semantic similarity is not a qualification score.
- **The embedding model ranks occupations; it never decides whether a phrase is a skill claim.** The deterministic evidence classifier (`classifyEvidence` / `canInfer`) owns that decision, in English, Malay and Chinese. Measured on the live endpoint: the z-scores of true claims and of non-claims overlap completely, so no similarity threshold can separate them. Ranking needs no absolute threshold, which removes the miscalibration risk rather than retuning it.
- A live RunPod endpoint serves `intfloat/multilingual-e5-small` for occupation ranking. Endpoint id, GPU, latencies, rate and the three provisioning traps (CUDA constraint, Hub registry auth, `DTYPES=float16`) are recorded in `docs/radar-operator-guide.md` §5.1. It scales to zero, so it carries no standing charge.
- The embedding cache is an optimisation, never a dependency: a missing `DATABASE_URL` or a database outage fails open to a fresh embedding instead of silently disabling semantic matching.
- Use official workbook occupation-group counts for area; never distribute parent totals among editorial role examples.
- Own real CVs are permitted for import and local review. OCR is per-import opt-in to the app-owned CPU worker; external radar remains synthetic-only. All imported CVs are locked to local radar as an extra safeguard.
- Python OCR dependencies are locked in root `pyproject.toml` / `uv.lock`; setup provisions official English `english_g2` weights before use, and runtime downloads are disabled.
- The client calls relative `/api` paths. `artifacts/roast-my-cv/vite.config.ts` proxies `/api` to `127.0.0.1:8080` in dev and preview, so a local checkout can actually reach the API server. Without it every request silently falls back to the bundled reference data.
- **The roast endpoint uses Gemini for candidate extraction and prose, but never for the final skill decision or the score.** Every quoted span is checked against the document, `classifyEvidence` owns acceptance, skill ids are checked against the catalogue, and the score/gaps are server-computed. A provider failure falls back to keyword evidence and a deterministic template roast instead of returning a 5xx.
- Gemini free tier for `gemini-3.6-flash` is 5 requests/minute per project/model. One roast uses two calls, so the default `ROAST_RPM_LIMIT=5` supports roughly two LLM roasts per minute; beyond that the endpoint returns the deterministic fallback. Raise the limit only with a paid quota.
- The extraction response schema deliberately has no large enums: Gemini's structured-output validator rejects the 38-skill/30-role enums with `INVALID_ARGUMENT`. The prompt carries the catalogue and the server validates every id. Do not add large enums back to the schema.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `GEMINI_API_KEY` is server-side only. Never log it, never expose it to the
  frontend and never prefix it with `VITE_`. The API server loads
  `artifacts/api-server/.env` first and the workspace root `.env` second;
  both are gitignored.
- `ROAST_DEBUG=true` prints Gemini error bodies and is for local debugging
  only. Production logging records the failure class, never the CV or a
  provider body.
- Set `OCR_ENABLED=false` on Vercel. The OCR worker is a spawned Python
  process and is not available on serverless hosts; image roast requests then
  return `501` and users paste text instead.
- `/api/roast` is mounted before the app-wide 64kb JSON parser because images
  need up to 14mb. Keep this ordering in `app.ts`; moving the route after the
  global parser silently breaks image requests with a `413`.
- The roast response schema is hand-written in `lib/api-zod/src/roast.ts`
  rather than generated from OpenAPI. Regenerating the client will not remove
  it, but fold it into the spec before adding a frontend hook.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
