import type { RadarEvidence, RadarMatch } from "@workspace/api-client-react";
import { groups, roles, skills, version } from "./catalogue";

export const MAX_TEXT = 12000;
export const MAX_PHRASES = 48;
export type Phrase = { text: string; start: number; end: number; kind: RadarEvidence["kind"] };

/** Quarter-on-quarter change for a DOSM major group, or null when the comparison is unavailable. */
export function groupDemandChange(groupId: string): number | null {
  const group = groups.find((g) => g.id === groupId);
  if (!group || group.current == null || group.previous == null || group.previous === 0) return null;
  return (group.current - group.previous) / group.previous;
}

/** Query text for topical occupation ranking: the skills we can evidence, as one concept list. */
export function buildProfileQuery(skillIds: string[]): string {
  if (!skillIds.length) return "";
  const labels = skillIds.map((id) => skills.find((s) => s.id === id)?.label ?? id);
  return `query: ${labels.join(", ")}`;
}

/** Blend weights for the occupation match score. Published so the number is reproducible. */
export const MATCH_WEIGHTS = { topical: 0.45, overlap: 0.4, demand: 0.15 } as const;
/** Topical credit is zero at or below the floor and reaches one across the span. */
export const TOPICAL_RANGE = { floor: 0.75, span: 0.2 } as const;

/**
 * Occupation match score, 0-100. Three published terms: topical similarity from the
 * embedding model, keyword overlap against the occupation skill list, and the demand
 * direction of the occupation's DOSM group. Similarity is never a qualification claim.
 */
export function blendMatchScore(
  topical: number | null,
  overlap: number,
  demand: number | null,
): number | null {
  if (topical == null) return null;
  const t = Math.max(0, Math.min(1, (topical - TOPICAL_RANGE.floor) / TOPICAL_RANGE.span));
  const d = demand == null ? 0 : Math.max(-1, Math.min(1, demand / 0.25));
  const blended = MATCH_WEIGHTS.topical * t + MATCH_WEIGHTS.overlap * overlap + MATCH_WEIGHTS.demand * d;
  return Math.round(Math.max(0, Math.min(1, blended)) * 1000) / 10;
}

// Deliberately conservative: one negative/intent cue suppresses the whole clause.
// This is evidence classification, not a language-understanding or proficiency claim.
export function classifyEvidence(text: string): RadarEvidence["kind"] {
  const t = text.toLowerCase();
  if (/\b(no|not|never|without|cannot|can't|don['’]t|didn['’]t|haven['’]t|lack|lacking|unable|belum|tidak|tiada|tanpa|bukan)\b|不会|未曾|没有|没用过|不懂|不熟|尚未/.test(t)) return "negated";
  if (/\b(want|wish|hope|plan|learning|learn|interested|interest|aspir|seeking|study|studying|ingin|mahu|berminat|belajar|mempelajari)\w*\b|想学|希望|正在学|学习|感兴趣/.test(t)) return "interest";
  if (/\b(maybe|perhaps|might|could|exposure|familiar|basic|beginner|assisted|helped|observed|unsure|team|department|company|required|requirements|responsibilities|must|should|mungkin|asas|membantu|pasukan|syarikat)\b|可能|或许|初学|基础|协助|了解|团队|公司|要求|需要/.test(t)) return "uncertain";
  return "explicit";
}

export function extractPhrases(text: string): { phrases: Phrase[]; truncated: boolean } {
  const bounded = text.slice(0, MAX_TEXT);
  // Do not split on commas: "no SQL, Python or Excel" must stay negated.
  const spans = [...bounded.matchAll(/[^\n\r.!?;。！？；]+/gu)];
  const phrases: Phrase[] = [];
  let truncated = text.length > MAX_TEXT;
  for (const span of spans) {
    const raw = span[0], trimmed = raw.trim();
    if (!trimmed) continue;
    if (phrases.length >= MAX_PHRASES) { truncated = true; break; }
    // Long unpunctuated PDF blocks are not chopped into apparently affirmative clauses.
    if (trimmed.length > 350) { truncated = true; continue; }
    const start = span.index! + raw.indexOf(trimmed);
    phrases.push({ text: trimmed, start, end: start + trimmed.length, kind: classifyEvidence(trimmed) });
  }
  return { phrases, truncated };
}

export function containsAlias(text: string, alias: string): boolean {
  const escaped = alias.normalize("NFKC").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // CJK has no space word boundaries; Latin aliases require token boundaries.
  const cjk = /[\u3400-\u9fff]/u.test(alias);
  return new RegExp(cjk ? escaped : `(?<![\\p{Script=Latin}\\p{N}])${escaped}(?![\\p{Script=Latin}\\p{N}])`, "iu")
    .test(text.normalize("NFKC"));
}

export function roleMatches(evidence: RadarEvidence[]) {
  const accepted = new Set(evidence.filter(e => e.kind === "explicit" || e.kind === "inferred").map(e => e.skillId));
  return roles.map(role => {
    const matchedSkillIds = role.skillIds.filter(id => accepted.has(id));
    return {
      roleId: role.id,
      matchedSkillIds,
      missingSkillIds: role.skillIds.filter(id => !accepted.has(id)),
      overlapScore: role.skillIds.length ? matchedSkillIds.length / role.skillIds.length : 0,
      demandChange: groupDemandChange(role.groupId),
      topicalScore: null as number | null,
      matchScore: null as number | null,
    };
  });
}

export function keywordMatch(
  text: string,
  mode: "keyword-local" | "keyword-fallback" = "keyword-local",
  reason = "On-device keyword matching. No CV text was sent for this analysis.",
): RadarMatch {
  const { phrases, truncated } = extractPhrases(text);
  const evidence: RadarEvidence[] = [];
  for (const phrase of phrases) {
    for (const skill of skills) {
      if ([skill.label, ...skill.aliases].some(alias => containsAlias(phrase.text, alias))) {
        evidence.push({ ...phrase, skillId: skill.id, method: "keyword", similarity: null });
      }
    }
  }
  return { version, mode, reason, model: null, threshold: null, evidence, roles: roleMatches(evidence), truncated, liveVerified: false };
}

/** Semantics may only extend affirmative, first-person/action evidence, not interests,
 * job descriptions, team claims, or a generic mention of an occupation. */
export function canInfer(phrase: Phrase): boolean {
  return phrase.kind === "explicit" &&
    !/\b(team|department|company|required|requirements|responsibilities|candidate|must|should|kami|pasukan|syarikat)\b|团队|公司|要求|需要/iu.test(phrase.text) &&
    /\b(i |built|created|used|developed|analysed|analyzed|implemented|designed|prepared|managed|tested|wrote|saya|membina|menggunakan|menganalisis|menyediakan)\b|我|开发了|使用了|分析了|创建了/u.test(phrase.text.toLowerCase());
}
