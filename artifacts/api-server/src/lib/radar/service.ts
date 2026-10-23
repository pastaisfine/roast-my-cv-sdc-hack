import type { RadarMatch } from "@workspace/api-zod";
import { version } from "@workspace/radar-data";
import { blendMatchScore, buildProfileQuery, keywordMatch, roleMatches } from "@workspace/radar-data/matching";
import { catalogueVectors, cosine, embed, getEmbeddingConfig, MODEL, roleVectors, THRESHOLD } from "./embeddings";

let busy = false;
let cooldownUntil = 0;
let windowStart = 0;
let windowCalls = 0;
const MINUTE_LIMIT = 6;
const dailyBudget = { day: "", calls: 0 };

export type RadarEvidenceKind = "explicit" | "inferred" | "interest" | "negated" | "uncertain";
/** "llm" is used only by the roast pipeline after the quoted span is verified. */
export type MatchEvidenceMethod = "llm" | "keyword" | "semantic";

export type MatchEvidence = {
  skillId: string;
  text: string;
  start: number;
  end: number;
  kind: RadarEvidenceKind;
  method: MatchEvidenceMethod;
  similarity: number | null;
};

export type RadarRanking = {
  version: string;
  mode: "semantic" | "keyword-fallback";
  reason: string;
  model: string | null;
  threshold: number | null;
  evidence: MatchEvidence[];
  roles: ReturnType<typeof roleMatches>;
  truncated: boolean;
  liveVerified: boolean;
};

/**
 * The embedding model ranks occupations by topical fit. It never decides whether a
 * phrase is a skill claim: that is the deterministic evidence classifier's job, and a
 * similarity score cannot separate "I used SQL" from "I want to learn SQL".
 */
const SEMANTIC_REASON =
  "Occupation ranking from the embedding model, combined with keyword overlap and the demand direction of each occupation's DOSM group. Topical fit is not a qualification score and not a probability. Match scores use published weights and stay provisional.";

/**
 * Rank occupations from an evidence set produced elsewhere (keyword or the
 * LLM-assisted extractor). Only skill labels — never CV text — reach RunPod.
 */
async function rankEvidence(
  evidence: MatchEvidence[],
  truncated: boolean,
  fallbackReason: string,
  callerSignal?: AbortSignal,
  transport?: typeof fetch,
): Promise<RadarRanking> {
  const fallback: RadarRanking = {
    version,
    mode: "keyword-fallback",
    reason: fallbackReason,
    model: null,
    threshold: null,
    evidence,
    roles: roleMatches(evidence),
    truncated,
    liveVerified: false,
  };
  const config = getEmbeddingConfig();
  if (!config) return fallback;
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; windowCalls = 0; }
  const day = new Date().toISOString().slice(0, 10);
  if (dailyBudget.day !== day) { dailyBudget.day = day; dailyBudget.calls = 0; }
  // Conservative per-process hard caps. Operator guide explains replica/restart limits.
  if (busy || now < cooldownUntil || windowCalls >= MINUTE_LIMIT || dailyBudget.calls >= 100) {
    return { ...fallback, reason: "Embedding service capacity or cost-protection limit reached. Server keyword fallback; no RunPod request for this review." };
  }
  // The profile is built only from skills the CV claims outright. A similarity model
  // must never widen that set on its own.
  const skillIds = [...new Set(evidence.filter(e => e.kind === "explicit" || e.kind === "inferred").map(e => e.skillId))];
  if (!skillIds.length) {
    return { ...fallback, reason: "No bounded affirmative skill evidence was found, so there was no evidenced profile to rank occupations with. Server keyword fallback; no RunPod request." };
  }
  busy = true;
  windowCalls++;
  dailyBudget.calls++;
  const signal = AbortSignal.any([AbortSignal.timeout(18_000), ...(callerSignal ? [callerSignal] : [])]);
  try {
    const catalogue = await Promise.race([
      catalogueVectors(config, signal, transport),
      new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(new Error("aborted"));
        else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    ]);
    const vectors = await embed([buildProfileQuery(skillIds)], config, signal, transport);
    const occupationVectors = roleVectors(catalogue);
    const profile = vectors[0];
    const ranked = roleMatches(evidence)
      .map((roleMatch, index) => {
        const topical = occupationVectors[index] ? cosine(profile, occupationVectors[index]) : null;
        return {
          ...roleMatch,
          topicalScore: topical == null ? null : Math.round(topical * 1000) / 1000,
          matchScore: blendMatchScore(topical, roleMatch.overlapScore, roleMatch.demandChange),
        };
      })
      .sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1) || b.overlapScore - a.overlapScore || a.roleId.localeCompare(b.roleId));
    return {
      ...fallback,
      mode: "semantic",
      reason: SEMANTIC_REASON,
      model: `${MODEL}@${config.revision}`,
      threshold: THRESHOLD,
      roles: ranked,
    };
  } catch {
    cooldownUntil = Date.now() + 60_000;
    return { ...fallback, reason: "RunPod or its public-reference cache timed out, failed, or returned invalid vectors. Server keyword fallback. Eligible skill labels may have reached RunPod before failure; no CV data is stored by this app." };
  } finally { busy = false; }
}

export async function matchRadarText(text: string, callerSignal?: AbortSignal, transport?: typeof fetch): Promise<RadarMatch> {
  const fallback = keywordMatch(text, "keyword-fallback", "RunPod is not approved or configured. Evidence-checked keyword fallback ran on the server; text was sent to this app, not to RunPod.");
  // matchRadarText only ever supplies keyword evidence, so narrowing the method
  // back to the public RadarMatch union is safe.
  return await rankEvidence(fallback.evidence, fallback.truncated, fallback.reason, callerSignal, transport) as unknown as RadarMatch;
}

/** Used by /api/roast: the caller already resolved evidence (LLM or keyword). */
export async function matchRadarEvidence(
  evidence: MatchEvidence[],
  truncated: boolean,
  fallbackReason: string,
  callerSignal?: AbortSignal,
  transport?: typeof fetch,
): Promise<RadarRanking> {
  return rankEvidence(evidence, truncated, fallbackReason, callerSignal, transport);
}
