import type { RadarEvidence, RadarMatch } from "@workspace/api-client-react";
import { roles, skills, version } from "./catalogue";

export const MAX_TEXT = 12000;
export const MAX_PHRASES = 48;
export type Phrase = { text: string; start: number; end: number; kind: RadarEvidence["kind"] };

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
  return roles.map(role => ({
    roleId: role.id,
    matchedSkillIds: role.skillIds.filter(id => accepted.has(id)),
    missingSkillIds: role.skillIds.filter(id => !accepted.has(id)),
  }));
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
