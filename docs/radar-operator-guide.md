# Future Skills Radar: beginner-friendly handoff

## What works now

Open Roast My CV and use the **synthetic sample**. The radar explores 30 curated occupations in five broad groups. Rectangle size comes from DOSM online job-offering counts, not CV similarity. Demand, AI and SDG layers never call an embedding service. Selected-role pathways do not change the original readiness or disruption-scenario formulas.

The local keyword mode works without a server. With explicit consent, the server also offers evidence-checked keyword fallback. No RunPod endpoint has been provisioned, no RunPod charges have been authorised, and **live embedding integration and threshold calibration are pending**. Exposure rationales/scores are **draft**, not human-reviewed; numeric draft scores are not displayed as reviewed.

Source transcription, hashes, release conflicts and MASCO limitations: [radar-sources.md](radar-sources.md).

## 1. Understand what an embedding does

An embedding model converts a short phrase into a list of numbers so we can compare its meaning with our fixed skill catalogue. It does not write CV feedback or act as a chat model. A close vector is a *possible semantic match*, not proof that someone has the skill, a hiring probability, or “percent qualified”.

The evidence classifier runs first. “I used SQL” can be an explicit claim; “I want to learn SQL” is a learning interest; “I have never used SQL” is negated; “basic SQL exposure” and team claims are uncertain. Only affirmative action evidence can get an additional inferred match. Rules are conservative and incomplete, especially for mixed-language and complex negation; absence of a match is not proof of absence of skill.

**Understanding check:** If a fictional CV says “I want to learn Python”, should Python count as an existing skill? **No.**

## 2. Model choices and what remains unmeasured

| Candidate | Preprocessing / limits | Trade-off for this prototype |
|---|---|---|
| **intfloat/multilingual-e5-small** (proposed) | 384 dimensions, 512-token model limit. `query: ` for evidence, `passage: ` for catalogue retrieval; normalise vectors. Model card lists Malay, Chinese and English. | Smaller multilingual starting point. Current adapter supports this model only. Scores cluster high, so a threshold from another model is not transferable. |
| **BAAI/bge-m3** (alternative) | 1,024 dimensions; up to 8,192 tokens; no E5 prefixes. Dense vectors only for this use case. | Larger model with multilingual support; potentially useful if E5 misses paraphrases, but extra memory/cold-start cost. Requires a separate adapter dimension/prefix profile and calibration, not an environment-only model swap. |

References checked 20 October 2026: [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small), [BGE-M3 model card](https://huggingface.co/BAAI/bge-m3).

The labelled English/Malay/Chinese fixtures are in `lib/radar-data/evaluation-fixtures.ts`. The ordinary tests exercise evidence safeguards and deterministic fallback. They **do not benchmark either model's semantic accuracy**. After paid approval, evaluate each candidate separately on these same examples plus a larger held-out set of near-neighbour and hard-negative examples. Compare accepted-match precision, missed matches, false positives, latency and billable duration by language. The fixture set is small and editorial, not a representative evaluation dataset.

Current design: the embedding model **ranks occupations**, it does not decide what counts as a skill claim. The deterministic evidence classifier (`classifyEvidence` / `canInfer`) owns that decision, in English, Malay and Chinese, for free. The profile that gets embedded contains only skills the CV claims outright.

> **Measured correction, 22 October 2026.** The previous design inferred *skills* from similarity using a gate of cosine ≥ **0.87** and gap-to-runner-up ≥ **0.04**. Measured against the live endpoint on the labelled fixtures, that gate produced **zero** inferences: every accepted fixture's top score was below 0.87 (max 0.8636) and every gap was below 0.04 (max 0.0289). A wider measurement showed the reason is fundamental, not a tuning miss — the z-scores of true claims (2.17–4.80) and of non-claims (2.59–4.80) **overlap completely**, because "I want to learn machine learning" genuinely *is* about machine learning. **No similarity threshold can separate a claim from a non-claim.** Ranking needs no absolute threshold, so the occupation-ranking design removes the miscalibration risk instead of retuning it.

Ranking terms, all published so the number is reproducible: `matchScore` = 0.45 × topical fit + 0.40 × keyword overlap + 0.15 × demand direction, where topical fit maps cosine 0.75–0.95 onto 0–1 and demand direction maps a ±25 % quarterly change onto ±1. Weights and floor live in `lib/radar-data/matching.ts` (`MATCH_WEIGHTS`, `TOPICAL_RANGE`). Match scores are **provisional** and never feed the legacy readiness/scenario formulas. Operator evaluator: `pnpm --filter @workspace/api-server run smoke:radar` (gated; see below) writes `generated-artifacts/radar-smoke-result.json` with the top-ranked occupations per fixture, the rank of the skill-appropriate occupation, and the top-5 spread. Do not automatically promote anything from this small fixture set.

A larger model was tested and rejected: **BAAI/bge-m3** (1,024 dimensions) ranked the correct occupation top for only 3 of 8 accepted fixtures against E5-small's 6 of 8, and produced no true positive at any tested threshold/gap. E5-small remains the deployed model.

## 3. Cost proposal — approved trial, 22 October 2026

Worker: **runpod/worker-infinity-embedding:1.1.4**, torch backend, E5-small, one flex worker on the **16 GB GPU tier** (A4000/A4500/RTX 4000/RTX 2000 as available). The operator approved a trial and it was provisioned; see the live deployment record in section 5.1 for the endpoint id, GPU, latencies and rate actually observed. Model + batching fit on the chosen GPU was confirmed by a real job.

The [public pricing page](https://www.runpod.io/pricing) retrieved 20 October 2026 lists the 16 GB serverless tier at **US$0.58 per running hour**, and the 24 GB L4/A5000/3090 tier at **US$0.69/hour**. Recheck the console's actual selected worker rate immediately before approval; these are not a quote or guarantee.

At $0.58/hour, 10 total billable minutes would be about **$0.10 compute**, and one billable hour **$0.58 compute**. These are examples, **not a per-CV estimate**. Model loading, execution and idle time can be billable; storage is separate. Provider documentation lists container disk around $0.10/GB/month. An always-on worker can incur continuous charges even without CVs. See [billing details](https://docs.runpod.io/serverless/pricing).

Proposed first trial: **at most $2 total spend authorised separately**, zero minimum workers, one maximum worker, short trial, monitor billing and shut down afterwards. The app's own counters are not a provider spending cap. No “free trial” is assumed. **This trial was approved and run on 22 October 2026**; it stayed inside the authorised envelope because the endpoint scales to zero and was only warm while a job was running.

**Before creating anything, ask:** “Do you approve a RunPod trial using E5-small on one 16 GB flex worker, up to $2 total including compute/storage, followed by shutdown?” Do not infer approval from approval of the software implementation. Re-approval is required for any change that raises the standing cost — for example keeping a worker warm for the remaining days at about **US$41.76**.

**Understanding check:** Does “scale to zero” mean the service can never charge while idle? **No: a running worker's configured idle timeout and any retained storage may still cost money.**

## 4. Provision only after that separate approval

1. In the user's RunPod account, select the pinned worker release above; inspect its image digest and record it in a verification note. Do not use `latest`. Upstream [README](https://github.com/runpod-workers/worker-infinity-embedding/tree/1.1.4), [handler](https://github.com/runpod-workers/worker-infinity-embedding/blob/1.1.4/src/handler.py) and [configuration](https://github.com/runpod-workers/worker-infinity-embedding/blob/1.1.4/src/config.py) were inspected; Infinity version in this release is 0.0.76.
2. Use `MODEL_NAMES=intfloat/multilingual-e5-small`, `BATCH_SIZES=8`, `BACKEND=torch`, `DTYPES=float16`, `INFINITY_QUEUE_SIZE=64`, `RUNPOD_MAX_CONCURRENCY=1`. Set min workers **0**, max workers **1**, idle timeout **300 seconds**, provider execution timeout **300 seconds**. Confirm these settings and actual GPU availability before creating.

   > **`DTYPES` must be `float16`, not `fp16`.** The upstream worker README and the earlier version of this guide both said `fp16`. Infinity 0.0.76's `Dtype` enum in `infinity_emb/primitives.py` accepts only `float32`, `float16`, `bfloat16`, `int8`, `fp8` and `auto`. `fp16` raises `KeyError: 'fp16'` and the worker exits with `startup failed: 'fp16'` on every container start.

   > **Pin the CUDA constraint to stock that exists.** The release declares `allowedCudaVersions: ["12.7","12.6","12.5","12.4"]` and its image is built on CUDA 12.4. Measured on 22 October 2026, **no card in the `AMPERE_16` pool reported 12.4–12.7 as available**, so the release as published acquires **zero workers** and the endpoint looks deployed but never runs. Live `get-capacity` showed stock on **12.8** (RTX A4500) and **13.2** (RTX 2000 Ada). Create the endpoint with `allowedCudaVersions: ["12.8","13.2"]`; a CUDA 12.4 container runs correctly on those hosts.

   > **Deploy through the Hub release, then set the CUDA constraint on the endpoint.** The image `registry.runpod.net/runpod-workers-worker-infinity-embedding-main-dockerfile:8ef2eed50` is a Hub build. A hand-made template pointing at it fails with `Failed to get Hub registry auth` and the container never starts. Deploy the Hub release to obtain a template that carries the registry auth, then create the endpoint from that template with the corrected CUDA constraint and the env above.

   > **Never `update-endpoint` a Hub-derived endpoint.** An update rolls a new container version that loses the Hub registry binding, so workers can no longer pull the image. An update also **replaces** the whole `env` map rather than merging it, which silently deletes `MODEL_NAMES` and kills the worker. Get every setting right at create time.
3. Pin model weights to Hugging Face revision **614241f622f53c4eeff9890bdc4f31cfecc418b3**, verified through the public model API. **Important:** vanilla `MODEL_NAMES` does not expose a revision setting. Pre-cache this exact snapshot in the worker's HF cache, make the cached model's `refs/main` point to it, and enable `HF_HUB_OFFLINE=1` for runtime (or build an equivalent pinned derivative outside this workspace). Verify startup resolves these bytes while preserving the served model ID. Do not treat setting our app's revision variable as actually pinning remote weights. Record the built image digest/cache manifest. If this cannot be confirmed, leave the app disabled.
4. Disable request/body debug logging in the worker and verify RunPod's request retention/deletion settings and privacy terms. The app can guarantee only its own non-retention. Never test with a real CV.
5. Add `RUNPOD_API_KEY` through the workspace **Secrets** flow, not chat or frontend variables. Configure non-secret `RUNPOD_ENDPOINT_ID` and `RADAR_MODEL_REVISION` through workspace environment settings. Only after approval set `RADAR_RUNPOD_APPROVED=true`. Keep all these server-side; never use `VITE_` keys.
6. Apply the additive `radar_public_cache` table with `pnpm --filter @workspace/db run push` in development (already applied in this task workspace). The merge script installs workspace dependencies and applies the schema. Production migration/deployment is not authorised here.
7. Restart the API workflow once after configuration changes.

## 5. Endpoint contract and smoke test

The adapter uses only:

```
POST https://api.runpod.ai/v2/<endpoint-id>/openai/v1/embeddings
Authorization: Bearer <server-side secret>
Content-Type: application/json
{"model":"intfloat/multilingual-e5-small","input":["query: synthetic evidence"]}
```

Expected OpenAI-compatible response: `model` equals the configured ID; `data` has exactly one indexed row per input; each `embedding` is 384 finite numbers with nonzero norm. Wrong models, dimensions, indices, NaNs, zero vectors, malformed JSON, oversized responses and provider errors all fail closed to keyword fallback. The worker's internal handler can return a list for the OpenAI route; the gateway's actual unwrapping must be verified with the live endpoint. Do **not** quietly guess a new transport shape.

After approval, temporarily set non-secret `RADAR_PAID_SMOKE_APPROVED=true` and run the gated smoke/evaluation command above. Remove that flag afterwards. It sends only fixed synthetic fixtures and public skill/role descriptions, checks the contract and writes a report under ignored `generated-artifacts/`. It does not store CVs.

Then, in the UI, confirm:
- Both unchecked disclosures are required before sending; simply opening a page or layer sends no text.
- A fresh local review keeps readiness and scenario values unchanged.
- Approved server review returns mode `semantic`; negations/interests remain excluded; the response says threshold is provisional.
- Cold-start failure returns labelled fallback. Warm the endpoint once with **approved synthetic input**, then explicitly retry; no automatic paid retries.
- Clear/edit/consent withdrawal cancels pending work, and delayed results do not overwrite current text/results. Cancellation cannot recall text already sent or guarantee cancellation of provider billing.
- Changing all three layers, groups, details or pathways adds **zero** embedding requests.

Record date, worker digest, model revision, GPU, vector shape, fixture results, cold/warm latencies, actual billable cost, retention configuration and approval. Live status remains `liveVerified:false` until this evidence has been reviewed and the status is deliberately updated in code.

### 5.1 Live deployment record — 22 October 2026

A live endpoint was provisioned and proven for this project. The operator approved a trial, then chose the **warm-during-recording, scale-to-zero** policy.

| Field | Value |
|---|---|
| Endpoint id | `oqdvb7vyxw2eio` |
| Worker image | `registry.runpod.net/runpod-workers-worker-infinity-embedding-main-dockerfile:8ef2eed50` (Hub release `runpod-workers/worker-infinity-embedding` **1.1.4**, git `8ef2eed509bcb9f67c9d4cc9da409742b6d099e2`) |
| Model / revision | `intfloat/multilingual-e5-small`, 384 dimensions, revision `614241f622f53c4eeff9890bdc4f31cfecc418b3` |
| GPU | pool `AMPERE_16`, `allowedCudaVersions ["12.8","13.2"]` → **NVIDIA RTX A4500, EU-RO-1** |
| Type / scaling | `QUEUE`, `QUEUE_DELAY` 5 s, FlashBoot on, job timeout 300 s, container disk 20 GB |
| Workers | min **0**, max **1**, idle timeout 300 s → scale to zero, no standing charge |
| Serverless rate | **US$0.58 / running hour** (`AMPERE_16`); billing is charged only while a worker runs |
| Proven jobs | 5 completed, 0 failed. Warm latency **216–750 ms** per job; first-job cold start ≈ 30 s |
| Response shape | `{ model: "intfloat/multilingual-e5-small", data: [{ index, object: "embedding", embedding: 384 finite numbers }] }` — matches `validateVectors` exactly |

**Budget note:** the trial ran on the 16 GB tier for well under the authorised US$2. Leaving one worker warm across the full remaining 3 days would have cost about **US$41.76**, which is outside that authorisation — hence scale-to-zero plus a warm window only during the recording. The endpoint still exists; the shutdown order in section 6 applies whenever it is no longer needed.

## 6. Limits, fallback and shutdown

- CV input: 12,000 characters; up to 48 evidence clauses; clauses over 350 characters are skipped, not sliced into falsely affirmative fragments. Truncation is disclosed.
- Remote request budget: 18 seconds overall; no retries; a 60-second failure cooldown.
- Application protects the endpoint with one in-flight match, 6 attempts/minute and 100 attempts/day **per process**. Restarts/replicas reset/multiply these limits. They are not a global spending guarantee; this is a single-instance synthetic prototype, not a public paid API.
- Cache keys include taxonomy version, model/revision, worker and exact public-text digest. Only fixed public taxonomy/role vectors go into PostgreSQL. CV phrases/vectors are temporary request memory; responses are `no-store`; request logs omit bodies/headers. The public source snapshots are persisted as versioned source modules.
- If the cache/database is unavailable, the semantic path **fails open to a fresh embedding** rather than to keyword fallback: the cache is an optimisation, never a dependency. A missing `DATABASE_URL`, a database outage or a corrupt row must not silently disable semantic matching. Corrupt cache entries are recomputed; repeated corruption needs operator investigation.
- Fallback explains whether text stayed in the browser, reached this app, or may have reached RunPod. The public explorer remains available even if the API is down.

**To stop charges:** disable the app flag first, then stop/delete the endpoint in RunPod, confirm no active worker/job remains, inspect retained disks/volumes, and remove unneeded storage. Revoke the API key when finished. Turning off the app flag alone does not stop a provider worker already running.

## 7. Human review and validation

Exposure estimates are editorial hypotheses, not DOSM findings. A named reviewer must explicitly approve each role score/rationale against the fixed rubric before changing `status` to `reviewed` and adding a review date. Do not bulk-mark scores reviewed. No group-average AI colour is permitted, even after approval.

Checks:

```
pnpm --filter @workspace/api-server run test:radar
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm -r --if-present run build
node lib/radar-data/verify-sources.mjs
```

The build command supplies non-secret build-time placeholders because each Vite package requires a port/base path; managed workflows supply their own runtime values. Source verification downloads public source bytes and compares hashes; it does not refresh counts automatically.

**Final understanding checks:** Why can a large group rectangle contain a role with no verified role-level count? Why does switching CVs not resize the map? Why is “0.90 similarity” not “90% qualified”?

Answers: the area belongs to the parent group only; DOSM reference counts are independent of CVs; cosine measures vector direction, not competence or probability.
