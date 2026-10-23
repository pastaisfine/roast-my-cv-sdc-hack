import type { RoastRole } from "@workspace/api-zod";
import type { MatchEvidence } from "../radar/service";

const ACCEPTED = new Set(["explicit", "inferred"]);

/**
 * Skills required by at least one of the strongest roles and evidenced
 * nowhere. Sorted by how many of those roles require them.
 */
export function missingSkills(topRoles: RoastRole[]): string[] {
  const counts = new Map<string, number>();
  for (const role of topRoles) {
    for (const id of role.missingSkillIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
    .slice(0, 12);
}

/**
 * Skills the CV mentions only as an interest, negation or uncertain claim,
 * restricted to requirements of the strongest roles. A weak mention of a
 * skill nobody asked for is noise, not a gap.
 */
export function weakSkills(
  evidence: MatchEvidence[],
  weakSkillIds: string[],
  topRoles: RoastRole[],
): string[] {
  const accepted = new Set(
    evidence.filter((item) => ACCEPTED.has(item.kind)).map((item) => item.skillId),
  );
  const required = new Set(
    topRoles.flatMap((role) => [...role.matchedSkillIds, ...role.missingSkillIds]),
  );
  return [...new Set(weakSkillIds)]
    .filter((id) => required.has(id) && !accepted.has(id))
    .slice(0, 12);
}
