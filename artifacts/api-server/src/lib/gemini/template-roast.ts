import type { RoastRole } from "@workspace/api-zod";
import { groups, roles, skills } from "@workspace/radar-data";
import type { RoastContext } from "./types";

const skillLabel = new Map<string, string>(skills.map((skill) => [skill.id, skill.label]));
const roleById = new Map<string, (typeof roles)[number]>(roles.map((role) => [role.id, role]));
const groupTitle = new Map<string, string>(groups.map((group) => [group.id, group.title]));

/** Human-readable label, falling back to the taxonomy id if it is unknown. */
export function label(id: string): string {
  return skillLabel.get(id) ?? id;
}

const MAX_LINE = 300;

function trimTo(value: string, max = MAX_LINE): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Deterministic employability score, 0-100. When an embedding ran we reuse the
 * published radar blend. Otherwise the fallback is a conservative overlap-plus-
 * demand estimate: 80% skill overlap, 20% demand direction, neutral when the
 * demand comparison is unavailable. No top role means no score.
 */
export function computeScore(rankedRoles: RoastRole[]): number {
  const top = rankedRoles.filter((role) => role.overlapScore > 0).slice(0, 3);
  if (!top.length) return 0;
  const weights = [0.5, 0.3, 0.2].slice(0, top.length);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const blended = top.reduce((sum, role, index) => {
    const value = role.matchScore != null
      ? role.matchScore
      : 100 * (
        0.8 * role.overlapScore +
        0.2 * (role.demandChange == null ? 0.5 : Math.max(0, Math.min(1, role.demandChange / 0.25)))
      );
    return sum + value * weights[index];
  }, 0) / weightTotal;
  return Math.max(0, Math.min(100, Math.round(blended)));
}

/**
 * Deterministic fallback roast. It must still be useful: every line names a
 * catalogue skill, a role requirement or a demand fact, never a generic
 * encouragement.
 */
export function templateRoast(context: RoastContext): {
  summary: string;
  hardTruths: string[];
  actionItems: string[];
} {
  const top = context.roles[0] ?? null;
  const accepted = context.evidence.filter((item) => item.kind === "explicit" || item.kind === "inferred");
  const acceptedSkills = unique(accepted.map((item) => item.skillId));
  const missingLabels = unique(context.missing.map(label));
  const weakLabels = unique(context.weak.map(label));
  const quotes = unique(accepted.map((item) => item.text));
  const hasNumbers = quotes.some((quote) => /\d/.test(quote));
  const topTitle = top?.title ?? "the roles in this catalogue";
  const overlap = top ? Math.round(top.overlapScore * 100) : 0;
  const group = top ? roleById.get(top.roleId)?.groupId : null;
  const groupName = group ? groupTitle.get(group) : null;
  const demand = top?.demandChange ?? null;

  const summary = !acceptedSkills.length
    ? "There is no affirmative skill evidence in this CV, so a recruiter has nothing concrete to screen. The document needs evidence before it needs better adjectives."
    : top
      ? `Your CV evidences ${acceptedSkills.length} catalogue skill${acceptedSkills.length === 1 ? "" : "s"}, and the closest occupation is ${topTitle} at ${overlap}% skill overlap. ${missingLabels.length ? `You are missing ${missingLabels.slice(0, 3).join(", ")} for that role, so the match is not yet credible.` : "The overlap is there, but the evidence still needs depth and measurable outcomes."}`
      : "Your CV contains skill claims but does not line up with any catalogue occupation. That usually means the evidence is generic rather than directed at a role.";

  const truths: string[] = [];
  if (!acceptedSkills.length) {
    truths.push("The CV gives no affirmative skill claim that survives the evidence check. Interests and negations do not count as skills.");
    truths.push(`Without evidence, the closest role cannot be defended: ${topTitle} needs proof, not potential.`);
    truths.push("A recruiter cannot quote a single line from this CV to justify an interview.");
    if (weakLabels.length) {
      truths.push(`You mention ${weakLabels.slice(0, 3).join(", ")} only as an interest, a negation or an uncertain claim. A mention is not evidence.`);
    }
  } else {
    truths.push(`The CV evidences ${acceptedSkills.length} catalogue skill${acceptedSkills.length === 1 ? "" : "s"}${top ? `; ${topTitle} lists ${top.matchedSkillIds.length + top.missingSkillIds.length} required skills and you cover ${top.matchedSkillIds.length}` : ""}.`);
    if (top && missingLabels.length) {
      truths.push(`For ${topTitle}, you are missing ${missingLabels.slice(0, 4).join(", ")}. Those are not optional extras; they are core requirements of the role.`);
    }
    if (weakLabels.length) {
      truths.push(`You mention ${weakLabels.slice(0, 3).join(", ")} only as an interest, a negation or an uncertain claim. A mention is not evidence.`);
    }
    if (demand != null && demand < 0 && groupName) {
      truths.push(`Demand for ${groupName} is down ${Math.abs(Math.round(demand * 1000) / 10)}% quarter-on-quarter, so the competition for this role is not getting easier.`);
    }
    if (!hasNumbers) {
      truths.push("Nothing in the evidence shows a measurable result. There is no number a reviewer can check.");
    }
    truths.push("In the evidence provided here, no project shows what you owned, what you decided and what changed as a result.");
  }

  const actions: string[] = [];
  if (missingLabels.length) {
    actions.push(trimTo(`Build one project that demonstrates ${missingLabels.slice(0, 2).join(" and ")}; publish the artefact and state the result.`));
  }
  if (weakLabels.length) {
    actions.push(trimTo(`Replace the vague mention of ${weakLabels[0]} with a completed task, the tool used and the outcome.`));
  }
  if (acceptedSkills.length) {
    actions.push(`Rewrite your strongest evidence line with the scale, the method and the decision it changed.`);
  }
  if (top) {
    const catalogueRole = roleById.get(top.roleId);
    if (catalogueRole?.pathway) {
      actions.push(trimTo(`For ${topTitle}: ${catalogueRole.pathway.do} Then show ${catalogueRole.pathway.evidence}`));
    }
  }
  actions.push("Cut any skill you cannot support with a quoted example; an unsupported skill is a liability in an interview.");
  if (!acceptedSkills.length) {
    actions.push("Start with one real project: what you built, the tools, the size of the data and the result.");
  }
  // The response contract requires at least three of each. These fallbacks are
  // still specific to the absence of verifiable evidence, not generic praise.
  for (const line of [
    "Add one quantified project that shows the skill in use: the task, the tool, the scale and the result.",
    "Ask a reviewer to name the role this CV is for after one read; if they cannot, rewrite the objective and evidence.",
  ]) {
    if (unique(actions).length >= 3) break;
    actions.push(line);
  }
  for (const line of [
    "The evidence provided here is too thin to defend a role-specific claim.",
    "A reviewer cannot see a measurable outcome anywhere in the evidence.",
    "The document lists potential but does not show a finished piece of work.",
  ]) {
    if (unique(truths).length >= 3) break;
    truths.push(line);
  }

  return {
    summary: trimTo(summary, 500),
    hardTruths: unique(truths).slice(0, 5).map((line) => trimTo(line)),
    actionItems: unique(actions).slice(0, 5).map((line) => trimTo(line)),
  };
}
