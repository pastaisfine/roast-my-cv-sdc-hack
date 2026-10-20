import { writeFile } from "node:fs/promises";
import { evaluationFixtures } from "@workspace/radar-data/evaluation-fixtures";
import { skills } from "@workspace/radar-data";
import { canInfer, extractPhrases, keywordMatch } from "@workspace/radar-data/matching";
import { embed, getEmbeddingConfig, publicTexts, MODEL, MODEL_REVISION, WORKER, cosine, MARGIN } from "./embeddings";

// A CLI for fixed public fixtures only. No runtime/request CV is accepted.
async function main() {
  const config = getEmbeddingConfig();
  if (!config || process.env.RADAR_PAID_SMOKE_APPROVED !== "true") throw new Error("Approved configuration required.");
  const signal = AbortSignal.timeout(60_000);
  const catalogue: number[][] = [];
  for (let i = 0; i < publicTexts.length; i += 32) catalogue.push(...await embed(publicTexts.slice(i, i + 32), config, signal));
  const vectors = await embed(evaluationFixtures.map(f => `query: ${f.text}`), config, signal);
  const rows = evaluationFixtures.map((fixture, i) => {
    const ranked = skills.map((s, j) => ({ skillId: s.id, score: cosine(vectors[i], catalogue[j]) })).sort((a, b) => b.score - a.score);
    const local = keywordMatch(fixture.text);
    return {
      language: fixture.language, expected: fixture.skillId, expectedAccepted: fixture.accepted,
      eligible: extractPhrases(fixture.text).phrases.some(canInfer),
      keyword: local.evidence.some(e => e.skillId === fixture.skillId && e.kind === "explicit"),
      top: ranked[0], margin: ranked[0].score - ranked[1].score,
    };
  });
  const thresholds = [.8, .85, .87, .9, .93].map(threshold => {
    let truePositive = 0, falsePositive = 0, falseNegative = 0;
    for (const row of rows) {
      const semantic = row.eligible && row.top.score >= threshold && row.margin >= MARGIN;
      const correct = row.keyword || (semantic && row.top.skillId === row.expected);
      if (correct && row.expectedAccepted) truePositive++;
      if ((correct && !row.expectedAccepted) || (semantic && row.top.skillId !== row.expected)) falsePositive++;
      if (!correct && row.expectedAccepted) falseNegative++;
    }
    return { threshold, truePositive, falsePositive, falseNegative };
  });
  const report = {
    date: new Date().toISOString(), model: MODEL, revision: MODEL_REVISION, worker: WORKER,
    contractPassed: true, status: "operator review required; not automatically live-verified",
    rows, thresholds,
  };
  await writeFile(new URL("./radar-smoke-result.json", import.meta.url), JSON.stringify(report, null, 2));
  process.stdout.write("Synthetic-only endpoint contract/evaluation completed. See generated-artifacts/radar-smoke-result.json; inspect billing and shut down the endpoint.\n");
}
main().catch(() => {
  // Never print provider responses, request bodies, credentials or exception details.
  process.stderr.write("Smoke test failed. Check configuration, contract, cold start and provider status. No live-verification claim was recorded.\n");
  process.exitCode = 1;
});
