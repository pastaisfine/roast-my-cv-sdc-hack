import { writeFile } from "node:fs/promises";
import { evaluationFixtures } from "@workspace/radar-data/evaluation-fixtures";
import { roles, skills } from "@workspace/radar-data";
import { buildProfileQuery, keywordMatch, MATCH_WEIGHTS, TOPICAL_RANGE } from "@workspace/radar-data/matching";
import { embed, getEmbeddingConfig, publicTexts, MODEL, MODEL_REVISION, WORKER, cosine, roleVectors } from "./embeddings";

/**
 * Evaluates occupation ranking on labelled synthetic fixtures only. It never accepts a
 * runtime CV, and it never prints a provider response, a body, a credential or an
 * exception detail. The output is the operator's live-verification record.
 */
async function main() {
  const config = getEmbeddingConfig();
  if (!config || process.env.RADAR_PAID_SMOKE_APPROVED !== "true") throw new Error("Approved configuration required.");
  const signal = AbortSignal.timeout(60_000);

  const catalogue: number[][] = [];
  for (let i = 0; i < publicTexts.length; i += 32) catalogue.push(...await embed(publicTexts.slice(i, i + 32), config, signal));
  const occupations = roleVectors(catalogue);

  // Build one evidenced profile per fixture. The deterministic evidence classifier runs
  // first: a phrase that is not a skill claim never becomes a profile.
  const profiles: { index: number; text: string; query: string; skillIds: string[] }[] = [];
  const blocked: { index: number; text: string; language: string; expected: string; accepted: boolean }[] = [];
  for (const [index, fixture] of evaluationFixtures.entries()) {
    const local = keywordMatch(fixture.text);
    const skillIds = [...new Set(local.evidence.filter(e => e.kind === "explicit").map(e => e.skillId))];
    if (!skillIds.length) {
      blocked.push({ index, text: fixture.text, language: fixture.language, expected: fixture.skillId, accepted: fixture.accepted });
      continue;
    }
    profiles.push({ index, text: fixture.text, query: buildProfileQuery(skillIds), skillIds });
  }

  const vectors = profiles.length ? await embed(profiles.map(p => p.query), config, signal) : [];

  const rows = profiles.map((profile, i) => {
    const ranked = roles.map((role, j) => ({ roleId: role.id, title: role.title, score: cosine(vectors[i], occupations[j]) }))
      .sort((a, b) => b.score - a.score);
    // The strongest occupation that actually asks for the expected skill.
    const relevant = roles.filter(r => r.skillIds.includes(evaluationFixtures[profile.index].skillId));
    const best = relevant.map(r => ranked.find(x => x.roleId === r.id)!).filter(Boolean)[0] ?? null;
    const spread = ranked.length > 4 ? ranked[0].score - ranked[4].score : 0;
    return {
      language: evaluationFixtures[profile.index].language,
      expectedSkill: evaluationFixtures[profile.index].skillId,
      accepted: evaluationFixtures[profile.index].accepted,
      evidencedSkills: profile.skillIds,
      top5: ranked.slice(0, 5).map(r => ({ roleId: r.roleId, title: r.title, score: Math.round(r.score * 1000) / 1000 })),
      expectedSkillOccupation: best ? { roleId: best.roleId, title: best.title, score: Math.round(best.score * 1000) / 1000, rank: ranked.findIndex(x => x.roleId === best.roleId) + 1 } : null,
      expectedSkillOccupationInTop5: best ? ranked.slice(0, 5).some(x => x.roleId === best.roleId) : false,
      top5Spread: Math.round(spread * 1000) / 1000,
    };
  });

  const withProfiles = rows.filter(r => r.accepted);
  const report = {
    date: new Date().toISOString(),
    model: MODEL,
    revision: MODEL_REVISION,
    worker: WORKER,
    contractPassed: true,
    status: "operator review required; not automatically live-verified",
    method: "Occupation ranking. The evidenced skill profile is embedded and compared with each occupation's skill profile. Similarity is topical fit, not a qualification score and not a probability. The deterministic evidence classifier decides what counts as a skill claim; similarity never widens that set.",
    weights: MATCH_WEIGHTS,
    topicalRange: TOPICAL_RANGE,
    summary: {
      fixtures: evaluationFixtures.length,
      profilesBuilt: rows.length,
      blockedByEvidenceClassifier: blocked.length,
      acceptedProfiles: withProfiles.length,
      expectedOccupationInTop5: withProfiles.filter(r => r.expectedSkillOccupationInTop5).length,
      expectedOccupationRank1: withProfiles.filter(r => r.expectedSkillOccupation?.rank === 1).length,
      medianTop5Spread: withProfiles.length ? withProfiles.map(r => r.top5Spread).sort((a, b) => a - b)[Math.floor(withProfiles.length / 2)] : null,
    },
    blocked,
    rows,
  };
  await writeFile(new URL("./radar-smoke-result.json", import.meta.url), JSON.stringify(report, null, 2));
  process.stdout.write("Synthetic-only occupation-ranking evaluation completed. See generated-artifacts/radar-smoke-result.json; inspect billing and shut down the endpoint.\n");
}
main().catch(() => {
  // Never print provider responses, request bodies, credentials or exception details.
  process.stderr.write("Evaluation failed. Check configuration, contract, cold start and provider status. No live-verification claim was recorded.\n");
  process.exitCode = 1;
});
