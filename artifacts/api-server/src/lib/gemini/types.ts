import type { RoastRole } from "@workspace/api-zod";
import type { MatchEvidence } from "../radar/service";

export type Seniority = "student" | "entry" | "mid" | "senior" | "unknown";

/**
 * Everything the roast generator is allowed to know about a CV. The full text
 * is deliberately absent: the model receives verified evidence spans and role
 * gaps, not another copy of the document.
 */
export type RoastContext = {
  seniority: Seniority;
  targetRoles: string[];
  evidence: MatchEvidence[];
  weakSkillIds: string[];
  roles: RoastRole[];
  missing: string[];
  weak: string[];
  score: number;
};
