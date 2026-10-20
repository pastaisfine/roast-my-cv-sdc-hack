import { skills, version } from "@workspace/radar-data";
import { canInfer, extractPhrases, keywordMatch, roleMatches } from "@workspace/radar-data/matching";
import { catalogueVectors, cosine, embed, getEmbeddingConfig, MARGIN, MODEL, THRESHOLD } from "./embeddings";

let busy = false;
let cooldownUntil = 0;
let windowStart = 0;
let windowCalls = 0;
const MINUTE_LIMIT = 6;
const dailyBudget = { day: "", calls: 0 };

export async function matchRadarText(text: string, callerSignal?: AbortSignal) {
  const fallback = keywordMatch(text, "keyword-fallback", "RunPod is not approved or configured. Evidence-checked keyword fallback ran on the server; text was sent to this app, not to RunPod.");
  const config = getEmbeddingConfig();
  if (!config) return fallback;
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; windowCalls = 0; }
  const day = new Date().toISOString().slice(0, 10);
  if (dailyBudget.day !== day) { dailyBudget.day = day; dailyBudget.calls = 0; }
  // Conservative per-process hard caps. Operator guide explains replica/restart limits.
  if (busy || now < cooldownUntil || windowCalls >= MINUTE_LIMIT || dailyBudget.calls >= 100) {
    return { ...fallback, reason: "Semantic service capacity or cost-protection limit reached. Server keyword fallback; no RunPod request for this review." };
  }
  const phrases = extractPhrases(text).phrases.filter(canInfer);
  if (!phrases.length) return { ...fallback, reason: "No bounded affirmative action evidence was eligible for semantic matching. Server keyword fallback; no RunPod request." };
  busy = true;
  windowCalls++;
  dailyBudget.calls++;
  const signal = AbortSignal.any([AbortSignal.timeout(18_000), ...(callerSignal ? [callerSignal] : [])]);
  try {
    const catalogue = await Promise.race([
      catalogueVectors(config, signal),
      new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(new Error("aborted"));
        else signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    ]);
    const vectors = await embed(phrases.map(p => `query: ${p.text}`), config, signal);
    const evidence = [...fallback.evidence];
    phrases.forEach((phrase, index) => {
      const ranked = skills.map((s, i) => ({ id: s.id, score: cosine(vectors[index], catalogue[i]) }))
        .sort((a, b) => b.score - a.score);
      const top = ranked[0], second = ranked[1];
      if (!top || top.score < THRESHOLD || (second && top.score - second.score < MARGIN)) return;
      if (evidence.some(e => e.skillId === top.id && e.start === phrase.start)) return;
      evidence.push({ ...phrase, kind: "inferred", skillId: top.id, method: "semantic", similarity: Math.round(top.score * 1000) / 1000 });
    });
    return {
      version, mode: "semantic" as const,
      reason: "Keyword claims plus conservative semantic inferences. Similarity is not probability or percent qualified. Threshold is provisional; inferred evidence needs human confirmation.",
      model: `${MODEL}@${config.revision}`, threshold: THRESHOLD,
      evidence, roles: roleMatches(evidence), truncated: fallback.truncated,
      liveVerified: false, // Only an operator-recorded approved smoke test can change this claim.
    };
  } catch {
    cooldownUntil = Date.now() + 60_000;
    return { ...fallback, reason: "RunPod or its public-reference cache timed out, failed, or returned invalid vectors. Server keyword fallback. Eligible phrases may have reached RunPod before failure; no CV data is stored by this app." };
  } finally { busy = false; }
}
