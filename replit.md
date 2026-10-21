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
- `artifacts/roast-my-cv/src/components/radar` — interactive explorer and role details.
- `docs/radar-sources.md` — verified official references and source discrepancies.
- `docs/radar-operator-guide.md` — cost proposal, approval gates, endpoint setup, evaluation and shutdown.

## Architecture decisions

- Keep radar matching separate from legacy readiness/scenario formulas; semantic similarity is not a qualification score.
- Use official workbook occupation-group counts for area; never distribute parent totals among editorial role examples.
- Model calibration and live endpoint verification require separately approved infrastructure. Current runtime has keyword fallback.
- Own real CVs are permitted for import and local review. OCR is per-import opt-in to the app-owned CPU worker; external radar remains synthetic-only. All imported CVs are locked to local radar as an extra safeguard.
- Python OCR dependencies are locked in root `pyproject.toml` / `uv.lock`; setup provisions official English `english_g2` weights before use, and runtime downloads are disabled.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
