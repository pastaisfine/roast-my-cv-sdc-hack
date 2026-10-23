import assert from "node:assert/strict";
import { RoastObject } from "@workspace/api-zod";
import { roleMatches } from "@workspace/radar-data/matching";
import { extractSkills } from "./extract";
import { generateRoast } from "./roast";
import { computeScore } from "./template-roast";
import { missingSkills, weakSkills } from "./gaps";
import type { RoastRole } from "@workspace/api-zod";

/**
 * Gated live smoke test. It sends fixed synthetic fixtures to Gemini and checks
 * the response contract; it never accepts a runtime CV and never prints a key,
 * a provider body or an exception detail.
 */
const fixtures = [
  {
    name: "junior-developer",
    text: `Aisyah Rahman
Junior Software Developer | Kuala Lumpur

EXPERIENCE
Software Developer Intern, Kakitangan Digital (2025)
- Built a customer support dashboard in React and TypeScript.
- Used SQL to query PostgreSQL and prepared monthly reports in Excel.
- Wrote unit tests with Jest and fixed 20 defects.
- Used Git for version control in a team of four.

SKILLS
React, TypeScript, SQL, Excel, Git`,
    expectSkills: 2,
  },
  {
    name: "senior-analyst-with-gaps",
    text: `Daniel Tan
Senior Data Analyst | 6 years

EXPERIENCE
Senior Data Analyst, Retail Group (2021-2026)
- Built forecasting models in Python with pandas and scikit-learn for demand planning.
- Built Power BI dashboards used by 40 managers.
- Wrote SQL transformations on a 2 TB warehouse.
- Managed two junior analysts.
- I have not worked with cloud platforms or deployed models to production.

SKILLS
Python, SQL, Power BI, forecasting`,
    expectSkills: 2,
  },
  {
    name: "non-tech",
    text: `Nurul Izzah
Customer Service Executive | 3 years

EXPERIENCE
Customer Service Executive, Telekom Retail (2022-2025)
- Handled 60 calls per day and resolved billing disputes.
- Trained five new agents on the refund process.
- Used the company CRM to log cases.`,
    expectSkills: 1,
  },
  {
    name: "weak-empty",
    text: "I am a hardworking graduate who wants to learn Python and machine learning. I have no work experience yet.",
    expectSkills: 0,
  },
  {
    name: "multilingual-malay",
    text: `Saya menggunakan SQL untuk menggabungkan jadual jualan. Saya membina carta interaktif dengan Power BI. Saya belum menggunakan Python.`,
    expectSkills: 2,
    expectSkillsAny: ["sql", "data-visualisation"],
  },
] as const;

async function main() {
  if (process.env.ROAST_SMOKE_APPROVED !== "true") {
    throw new Error("Live roast smoke test disabled. Set ROAST_SMOKE_APPROVED=true to spend free-tier Gemini tokens.");
  }
  const report: Array<Record<string, unknown>> = [];
  const selected = process.env.ROAST_SMOKE_ONLY
    ? fixtures.filter((fixture) => fixture.name === process.env.ROAST_SMOKE_ONLY)
    : fixtures;
  if (!selected.length) throw new Error(`No fixture named ${process.env.ROAST_SMOKE_ONLY}.`);
  const delayMs = Math.max(0, Number(process.env.ROAST_SMOKE_DELAY_MS ?? 0) || 0);

  for (const [index, fixture] of selected.entries()) {
    if (index > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    // A fresh budget per fixture: the shared run can span several free-tier
    // quota windows when ROAST_SMOKE_DELAY_MS paces the calls.
    const fixtureSignal = AbortSignal.timeout(180_000);
    const extraction = await extractSkills(fixture.text, fixtureSignal);
    const ranked = roleMatches(extraction.evidence)
      .sort((a, b) => b.overlapScore - a.overlapScore || a.roleId.localeCompare(b.roleId));
    const topRoles: RoastRole[] = ranked.filter((role) => role.overlapScore > 0).slice(0, 3);
    const weak = weakSkills(extraction.evidence, extraction.weakSkillIds, topRoles);
    const weakSet = new Set(weak);
    const missing = missingSkills(topRoles).filter((id) => !weakSet.has(id));
    const score = computeScore(ranked);
    const generation = await generateRoast({
      seniority: extraction.seniority,
      targetRoles: extraction.targetRoles.length ? extraction.targetRoles : topRoles.map((role) => role.roleId),
      evidence: extraction.evidence,
      weakSkillIds: extraction.weakSkillIds,
      roles: topRoles,
      missing,
      weak,
      score,
    }, fixtureSignal);

    RoastObject.parse(generation.roast);
    const accepted = extraction.evidence.filter((item) => item.kind === "explicit" || item.kind === "inferred");
    assert(accepted.length >= fixture.expectSkills, `${fixture.name}: expected at least ${fixture.expectSkills} accepted skills, got ${accepted.length}`);
    assert(generation.roast.hardTruths.length >= 3 && generation.roast.hardTruths.length <= 5, `${fixture.name}: hardTruths length`);
    assert(generation.roast.actionItems.length >= 3 && generation.roast.actionItems.length <= 5, `${fixture.name}: actionItems length`);
    assert(generation.roast.score >= 0 && generation.roast.score <= 100, `${fixture.name}: score range`);
    assert(generation.roast.summary.length > 0 && generation.roast.summary.length <= 500, `${fixture.name}: summary length`);
    for (const id of [...generation.roast.skillsGap.missing, ...generation.roast.skillsGap.weak]) {
      assert(typeof id === "string" && id.length > 0, `${fixture.name}: gap id`);
    }
    if ("expectSkillsAny" in fixture) {
      for (const expected of fixture.expectSkillsAny) {
        assert(accepted.some((item) => item.skillId === expected), `${fixture.name}: expected skill ${expected}`);
      }
    }

    report.push({
      fixture: fixture.name,
      extraction: extraction.method,
      extractionFailure: extraction.failure,
      acceptedSkills: accepted.length,
      acceptedSkillIds: [...new Set(accepted.map((item) => item.skillId))],
      weakSkillIds: extraction.weakSkillIds,
      seniority: extraction.seniority,
      topRole: topRoles[0]?.roleId ?? null,
      topRoleOverlap: topRoles[0] ? Math.round(topRoles[0].overlapScore * 100) : null,
      score,
      roastSource: generation.source,
      roastFailure: generation.failure,
      hardTruths: generation.roast.hardTruths.length,
      actionItems: generation.roast.actionItems.length,
      summaryPreview: generation.roast.summary.slice(0, 120),
    });
    process.stdout.write(`✔ ${index + 1}/${selected.length} ${fixture.name}\n`);
  }

  process.stdout.write(`${JSON.stringify({ fixtures: report.length, report }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Roast smoke test failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
