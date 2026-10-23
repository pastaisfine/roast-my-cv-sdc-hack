# `/api/roast` — unified CV roast

One request takes CV text (or an OCR image), extracts skills against the fixed
radar taxonomy, ranks the closest occupations, and returns a structured,
brutal-honesty roast.

## Request

`POST /api/roast` with `Content-Type: application/json`:

```json
{
  "text": "Aisyah Rahman\nJunior Software Developer ...",
  "consent": "roast-my-cv"
}
```

or, where the Python OCR worker is available:

```json
{
  "imageBase64": "<base64 PNG or JPEG>",
  "consent": "roast-my-cv",
  "ocrConsent": "server-image-processing"
}
```

- Exactly one of `text` (1–12,000 characters) or `imageBase64` (≤ 10 MB raw
  bytes) is required. Do not send both.
- `consent` is the single explicit permission to send the submitted content to
  Google Gemini for extraction and roasting.
- `ocrConsent` is required for images and acknowledges that the image is read
  by the app-owned CPU worker before the extracted text goes to Gemini.
- On serverless hosts set `OCR_ENABLED=false`; image requests then return `501`
  and users must paste text.

## Response

```json
{
  "version": "radar-2026q2-v1",
  "mode": "semantic",
  "reason": "…",
  "roast": {
    "summary": "…",
    "hardTruths": ["…", "…", "…"],
    "skillsGap": { "missing": ["statistics"], "weak": ["python"] },
    "actionItems": ["…", "…", "…"],
    "score": 54,
    "persona": "brutal-honesty",
    "fallback": false,
    "source": "llm"
  },
  "radar": {
    "evidence": [{ "skillId": "sql", "text": "…", "start": 0, "end": 0, "kind": "explicit", "method": "llm", "similarity": null }],
    "roles": [{ "roleId": "masco-2512", "title": "Software Developers", "matchedSkillIds": [], "missingSkillIds": [], "overlapScore": 0.6, "demandChange": -0.095, "topicalScore": null, "matchScore": null }],
    "truncated": false,
    "liveVerified": false
  },
  "extraction": {
    "method": "llm",
    "skillsFound": 4,
    "targetRoles": ["masco-2512"],
    "weakSkillIds": ["git"],
    "seniority": "entry",
    "latencyMs": 1200
  },
  "liveVerified": false
}
```

- `skillsGap.missing` and `weak` are catalogue skill **ids**.
- `missing` = required by a top role and not evidenced at all.
- `weak` = mentioned only as an interest, negation or uncertain claim. The two
  lists are disjoint.
- `extraction.weakSkillIds` is the raw weak list; `roast.skillsGap.weak` is
  restricted to skills required by the top roles, so a stray weak mention does
  not become a gap.
- `score` is deterministic and server-owned: the published radar blend when an
  embedding ran, otherwise 80% skill overlap plus 20% DOSM demand direction
  (neutral when demand is unavailable). The model never invents the score.
- `source` is `llm` for Gemini prose, `template` for the deterministic
  fallback. `fallback` mirrors the distinction.

## Extraction is verified, not trusted

1. Gemini receives the CV as untrusted data and returns candidate skill ids and
   exact quotes.
2. The server checks that every quote actually occurs in the document (exact,
   then whitespace/case-tolerant) and records the real span.
3. The existing deterministic `classifyEvidence` classifier has the final say:
   negations, interests, team/company claims and other uncertain phrases are
   dropped. A dropped mention becomes a `weak` gap, never evidence.
4. Every skill id is checked against `@workspace/radar-data`. Unknown ids are
   discarded.
5. If every quoted span fails verification, one stricter repair call is made.
   If that also fails, the local keyword classifier produces the evidence.

Gemini's structured-output validator rejects large string enums
(`INVALID_ARGUMENT`), so the extraction schema constrains shape only; the
catalogue vocabulary is enforced by the server.

## Fallback chain

- Gemini extraction unavailable → `keywordMatch()` (`extraction.method =
  "keyword-fallback"`).
- RunPod/embedding unavailable → local keyword occupation ranking
  (`mode = "keyword-fallback"`). Only skill labels ever reach RunPod, never CV
  text.
- Gemini roast unavailable → deterministic template roast
  (`roast.source = "template"`).
- Provider failures return `200` with a usable fallback, not a 5xx. Invalid
  input, oversized images, disabled OCR and rate limits keep their usual 4xx/5xx
  statuses.

## Rate limits and cost

The free tier for `gemini-3.6-flash` is **5 requests per minute and 20 requests
per day per project and model** (observed live: the daily 429 reports
`GenerateRequestsPerDayPerProjectPerModel-FreeTier` with `quotaValue: 20`). The
daily cap is the binding constraint: one roast uses two calls (extraction +
narrative), so the free tier supports roughly **10 LLM roasts per day**. A repair
attempt can add a third call and reduce that further.

The default local guards are:

| Env | Default | Meaning |
| --- | --- | --- |
| `ROAST_ENABLED` | `true` | `false` returns `501` |
| `ROAST_RPM_LIMIT` | `5` | Gemini calls per process per minute |
| `ROAST_DAILY_TOKEN_LIMIT` | `800000` | Process-local token budget |
| route window | 30/min | Anonymous requests per process |

These counters are per process and reset on restart/replica change. They are
cost guards, not a global quota. The provider's 20/day cap is global to the
project/model and is not affected by the per-process counters. When the Gemini
budget is exhausted the endpoint still answers with the deterministic roast.
The 429 cooldown means the fallback can stay active for a minute after the
provider rejects a call even if the provider quota resets sooner.

## Environment

```dotenv
GEMINI_API_KEY=            # server-side only; AQ. or AIza key
GEMINI_MODEL=gemini-3.6-flash
ROAST_ENABLED=true
ROAST_RPM_LIMIT=5
ROAST_DAILY_TOKEN_LIMIT=800000
OCR_ENABLED=true           # set false on Vercel/serverless
```

Vercel: add `GEMINI_API_KEY`, `GEMINI_MODEL`, `ROAST_ENABLED`,
`ROAST_RPM_LIMIT` and `ROAST_DAILY_TOKEN_LIMIT` to the project's server-side
environment, and set `OCR_ENABLED=false`. Never use a `VITE_` prefix for the
Gemini key.

## Smoke test

```bash
ROAST_SMOKE_APPROVED=true \
ROAST_SMOKE_DELAY_MS=30000 \
pnpm --filter @workspace/api-server run smoke:roast
```

The smoke test sends fixed synthetic fixtures only and prints a compact report
(no CV bodies, no provider responses, no credentials). The 30-second delay
keeps the run inside the free tier's 5 RPM limit. A full five-fixture run uses
roughly 10 calls, about half of the 20/day free-tier allowance, so do not loop
the smoke test on a free key. Use `ROAST_SMOKE_ONLY=<fixture-name>` for one
fixture. `ROAST_DEBUG=true` prints provider error bodies on failure when
`NODE_ENV` is not `production`; it is ignored in production builds.

The deterministic suite does not touch the network:

```bash
pnpm --filter @workspace/api-server run test:roast
```

It covers request exclusivity/consent, quote verification (including line
breaks), negation/interest rejection, the repair-then-keyword fallback,
score weights, template roast bounds and the response contract.
