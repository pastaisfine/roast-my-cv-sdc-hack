import { roles, skills } from "@workspace/radar-data";
import { classifyEvidence, keywordMatch } from "@workspace/radar-data/matching";
import { GeminiError, generateJson, getGeminiConfig } from "./client";
import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, extractionPrompt, extractionRepairPrompt } from "./prompts";
import type { MatchEvidence } from "../radar/service";
import type { Seniority } from "./types";

const SKILL_IDS = new Set<string>(skills.map((skill) => skill.id));
const ROLE_IDS = new Set<string>(roles.map((role) => role.id));
const MAX_QUOTE = 500;
const MIN_CONFIDENCE = 0.6;

export type ExtractionResult = {
  method: "llm" | "keyword-fallback";
  evidence: MatchEvidence[];
  targetRoles: string[];
  weakSkillIds: string[];
  seniority: Seniority;
  latencyMs: number;
  reason: string;
  failure: GeminiError["kind"] | "no-config" | null;
};

type ExtractionPayload = {
  skills?: unknown;
  targetRoles?: unknown;
  seniority?: unknown;
};

type ValidatedExtraction = {
  evidence: MatchEvidence[];
  weakSkillIds: string[];
  targetRoles: string[];
  seniority: Seniority;
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate a quoted span in the original document. Exact matches keep the
 * original indices; a whitespace-flexible, case-insensitive pass recovers
 * quotes across PDF/OCR line breaks without inventing a location.
 */
function findSpan(text: string, quote: string): { start: number; end: number } | null {
  const direct = text.indexOf(quote);
  if (direct >= 0) return { start: direct, end: direct + quote.length };
  const parts = quote.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 120) return null;
  try {
    const match = new RegExp(parts.map(escapeRegExp).join("\\s+"), "i").exec(text);
    if (!match) return null;
    return { start: match.index, end: match.index + match[0].length };
  } catch {
    return null;
  }
}

function validateExtraction(data: unknown, text: string): ValidatedExtraction {
  const payload = (data ?? {}) as ExtractionPayload;
  const evidence: MatchEvidence[] = [];
  const weak = new Set<string>();
  const seen = new Set<string>();

  if (Array.isArray(payload.skills)) {
    for (const raw of payload.skills.slice(0, 40)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const skillId = typeof item.skillId === "string" ? item.skillId : "";
      const quote = typeof item.quote === "string" ? item.quote.trim() : "";
      const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? item.confidence
        : 0;
      const kind = item.kind === "inferred" ? "inferred" : "explicit";
      if (!SKILL_IDS.has(skillId) || !quote || quote.length > MAX_QUOTE || confidence < MIN_CONFIDENCE) continue;
      const span = findSpan(text, quote);
      if (!span) continue;
      // The deterministic classifier owns the final say: an interest, a
      // negation or an uncertain team claim can never become evidence.
      if (classifyEvidence(quote) !== "explicit") {
        weak.add(skillId);
        continue;
      }
      const key = `${skillId}:${span.start}:${span.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({
        skillId,
        text: quote,
        start: span.start,
        end: span.end,
        kind,
        method: "llm",
        similarity: null,
      });
    }
  }

  const targetRoles = Array.isArray(payload.targetRoles)
    ? [...new Set(payload.targetRoles.filter(
      (id): id is string => typeof id === "string" && ROLE_IDS.has(id),
    ))].slice(0, 3)
    : [];

  const seniority = (
    typeof payload.seniority === "string" &&
    ["student", "entry", "mid", "senior", "unknown"].includes(payload.seniority)
      ? payload.seniority
      : "unknown"
  ) as Seniority;

  return { evidence, weakSkillIds: [...weak], targetRoles, seniority };
}

function keywordExtraction(
  text: string,
  started: number,
  reason: string,
  failure: GeminiError["kind"] | "no-config" | null,
): ExtractionResult {
  const match = keywordMatch(text, "keyword-fallback", reason);
  const evidence: MatchEvidence[] = match.evidence.map((item) => ({ ...item, method: "keyword" as const }));
  const weakSkillIds = unique(
    evidence
      .filter((item) => item.kind !== "explicit" && item.kind !== "inferred")
      .map((item) => item.skillId),
  );
  const top = [...match.roles]
    .filter((role) => role.overlapScore > 0)
    .sort((a, b) => b.overlapScore - a.overlapScore || a.roleId.localeCompare(b.roleId))
    .slice(0, 3);
  return {
    method: "keyword-fallback",
    evidence,
    targetRoles: top.map((role) => role.roleId),
    weakSkillIds,
    seniority: "unknown",
    latencyMs: Date.now() - started,
    reason,
    failure,
  };
}

function describeGeminiFailure(error: unknown): string {
  if (!(error instanceof GeminiError)) return "Gemini extraction failed.";
  switch (error.kind) {
    case "capacity": return "Gemini extraction capacity or cost-protection limit was reached.";
    case "rate-limited": return "Gemini extraction hit its rate limit.";
    case "auth": return "Gemini authentication failed.";
    case "blocked": return "Gemini blocked the extraction request.";
    case "timeout": return "Gemini extraction timed out.";
    default: return "Gemini returned an unusable extraction response.";
  }
}

/**
 * Extract catalogue skills from CV text.
 *
 * The LLM proposes quotes; the server verifies that each quote actually occurs
 * in the document and that the deterministic classifier considers it an
 * affirmative claim. Anything unverifiable is dropped, not trusted.
 */
export async function extractSkills(
  text: string,
  signal?: AbortSignal,
  transport?: typeof fetch,
): Promise<ExtractionResult> {
  const started = Date.now();
  const config = getGeminiConfig();
  if (!config) {
    return keywordExtraction(
      text,
      started,
      "Gemini is not configured or roasting is disabled, so the local keyword classifier produced the evidence. No CV text left this app for extraction.",
      "no-config",
    );
  }

  try {
    let payload = await generateJson<ExtractionPayload>(
      config,
      EXTRACTION_SYSTEM,
      extractionPrompt(text),
      EXTRACTION_SCHEMA,
      { signal, transport, maxOutputTokens: 4_096 },
    );
    let result = validateExtraction(payload, text);

    const proposed = Array.isArray(payload.skills) ? payload.skills.length : 0;
    if (!result.evidence.length && proposed > 0) {
      // Every quote failed verification. One stricter pass is cheaper than
      // silently losing a real skill to a paraphrased quote.
      payload = await generateJson<ExtractionPayload>(
        config,
        EXTRACTION_SYSTEM,
        extractionRepairPrompt(text),
        EXTRACTION_SCHEMA,
        { signal, transport, maxOutputTokens: 4_096 },
      );
      result = validateExtraction(payload, text);
    }

    const affirmed = result.evidence.filter(
      (item) => item.kind === "explicit" || item.kind === "inferred",
    );
    if (!affirmed.length) {
      const keyword = keywordExtraction(
        text,
        started,
        "Gemini returned no verifiable affirmative skill evidence, so the local keyword classifier was used instead.",
        "invalid-response",
      );
      if (keyword.evidence.some((item) => item.kind === "explicit" || item.kind === "inferred")) {
        return keyword;
      }
      // Genuinely empty CV: keep the LLM's target roles and seniority, which
      // are still useful for explaining the absence of evidence.
    }

    return {
      method: "llm",
      evidence: result.evidence,
      targetRoles: result.targetRoles,
      weakSkillIds: result.weakSkillIds,
      seniority: result.seniority,
      latencyMs: Date.now() - started,
      reason: "Gemini extracted skill evidence from the submitted CV text. Every quoted span was checked against the document and screened by the deterministic evidence classifier; occupations were then ranked from the verified skills.",
      failure: null,
    };
  } catch (error) {
    return keywordExtraction(
      text,
      started,
      `${describeGeminiFailure(error)} The local keyword classifier produced the evidence instead.`,
      error instanceof GeminiError ? error.kind : "invalid-response",
    );
  }
}
