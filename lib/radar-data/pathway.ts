import type { RadarPathway } from "@workspace/api-client-react";
import { roles, skills } from "./catalogue";

export function makeRadarPathway(roleId: string, matchedSkillIds: string[]): RadarPathway {
  const role = roles.find(r => r.id === roleId);
  if (!role) throw new Error("Unknown role");
  const gaps = role.skillIds.filter(id => !matchedSkillIds.includes(id));
  const next = skills.find(s => s.id === gaps[0])?.label;
  const base = { roleId, title: role.title, noGaps: gaps.length === 0 };
  if (!role.pathway) return { ...base, available: false, reason: "A supported pathway has not been curated for this occupation.", steps: [] };
  return {
    ...base, available: true,
    reason: role.laterCareer ? "A later-career destination, not an entry-level hiring recommendation. Build supervised experience first." : "Editorial practice plan, not a qualification or hiring guarantee.",
    steps: [
      { phase: "Week 1", title: next ? `Practise ${next}` : "Deepen the evidence",
        learn: next ? `${next}: ${role.pathway.learn}` : `No taxonomy gaps detected. Validate depth rather than claiming new skills. ${role.pathway.learn}`,
        do: role.pathway.do, evidence: role.pathway.evidence },
      { phase: "Weeks 2–3", title: `Build proof for ${role.title}`, learn: `Study a real ${role.title} workflow and its quality and safety checks.`,
        do: role.pathway.do, evidence: `${role.pathway.evidence}; state your own contribution and limitations.` },
      { phase: "Week 4", title: "Explain your contribution", learn: `Compare your evidence with requirements for ${role.title}.`,
        do: "Write two action–method–result CV bullets using only work you actually completed; ask a knowledgeable person to review them.",
        evidence: `A ${role.title}-targeted CV and one reviewed work sample.` },
    ],
  };
}
