import { labourSnapshot, roles, type RoleProfile } from "./roles";

export type RankedRole = { role: RoleProfile; matched: string[]; score: number };
export type PathwayStep = { phase: string; title: string; learn: string; do: string; evidence: string };
export type Scenario = { label: string; note: string; roles: RankedRole[] };
export type Assessment = {
  text: string;
  score: number;
  matchedSkills: string[];
  gaps: string[];
  rankedRoles: RankedRole[];
  pathway: PathwayStep[];
  scenarios: [Scenario, Scenario];
};

const skillUniverse = [...new Set(roles.flatMap((role) => role.skills))].sort((a, b) => b.length - a.length);
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ");
const containsSkill = (text: string, skill: string) => {
  const term = normalise(skill);
  return new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`, "i").test(text);
};

function rankRoles(text: string, scenario: "copilot" | "automation"): RankedRole[] {
  const clean = normalise(text);
  return roles.map((role) => {
    const matched = role.skills.filter((skill) => containsSkill(clean, skill));
    const coverage = matched.length / role.skills.length;
    const relevance = Math.min(1, coverage * 1.6 + (matched.length ? .12 : 0));
    const scenarioFactor = scenario === "copilot"
      ? 1 - role.taskExposure * .18
      : 1 - role.taskExposure * .48;
    return { role, matched, score: Math.round((relevance * 72 + scenarioFactor * 28) * 10) / 10 };
  }).sort((a, b) => b.score - a.score || a.role.title.localeCompare(b.role.title));
}

function makePathway(ranked: RankedRole[], gaps: string[]): PathwayStep[] {
  const top = ranked[0];
  const nextSkill = gaps.find((skill) => top && top.role.skills.includes(skill)) ?? top?.role.skills[0] ?? "Excel";
  return [
    { phase: "Week 1", title: `Learn ${nextSkill}`, learn: `Work through one beginner module on ${nextSkill}; focus on the parts used in ${top?.role.title ?? "your target role"}.`, do: `Recreate a small example using a public or synthetic dataset.`, evidence: `${nextSkill} mini-exercise + short notes` },
    { phase: "Weeks 2–3", title: "Build one useful proof", learn: `Practise the ${top?.role.title ?? "target role"} workflow: frame a question, choose a method, explain a result.`, do: "Create a compact project with a README and clear before/after or decision.", evidence: "One portfolio link with your contribution stated" },
    { phase: "Week 4", title: "Make the CV earn its space", learn: "Review role descriptions and note recurring requirements.", do: "Rewrite two bullets using action + tool + measurable outcome; ask one person to review.", evidence: "One-page role-specific CV and 3 tailored applications" },
  ];
}

export function analyzeCv(text: string): Assessment {
  const clean = normalise(text);
  const matchedSkills = skillUniverse.filter((skill) => containsSkill(clean, skill));
  const gaps = skillUniverse.filter((skill) => !matchedSkills.includes(skill));
  const baseRoles = rankRoles(text, "copilot");
  const score = Math.min(92, Math.max(18, Math.round(18 + (matchedSkills.length / Math.min(14, skillUniverse.length)) * 66 + (clean.length > 550 ? 6 : 0))));
  const co = baseRoles.slice(0, 4);
  const automation = rankRoles(text, "automation").slice(0, 4);
  return {
    text, score, matchedSkills, gaps: gaps.slice(0, 10), rankedRoles: co.slice(0, 5),
    pathway: makePathway(co, gaps),
    scenarios: [
      { label: "AI as co-pilot", note: "Assumes AI helps with routine drafts and analysis while people retain review, context and accountability. Task exposure has a modest ranking effect.", roles: co },
      { label: "Rapid automation", note: "Assumes routine, repeatable tasks automate faster; roles with higher task exposure move down. This is a stress-test heuristic, not a forecast.", roles: automation },
    ],
  };
}

export const scoreMethod = "Readiness = 18 base points + up to 66 points from distinct matched skills across our role library + 6 points for a CV text sample over 550 characters; capped at 92. Role fit combines matched-skill coverage (72%) and scenario-adjusted task exposure (28%). Keyword presence is not proof of proficiency.";

export const labourReference = labourSnapshot;
