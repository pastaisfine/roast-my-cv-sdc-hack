import { test } from "node:test";
import assert from "node:assert/strict";
import { blendMatchScore, buildProfileQuery, canInfer, classifyEvidence, extractPhrases, groupDemandChange, keywordMatch, roleMatches } from "@workspace/radar-data/matching";
import { makeRadarPathway } from "@workspace/radar-data/pathway";
import { groups, roles, skills } from "@workspace/radar-data";
import { validateVectors, embed, MODEL, MODEL_REVISION, DIMENSIONS, cosine, THRESHOLD, MARGIN, ROLE_VECTOR_OFFSET } from "./embeddings";
import { matchRadarText } from "./service";
import { analyzeCv } from "../../../../roast-my-cv/src/lib/analyze";
import { layoutTreemap, qoq } from "../../../../roast-my-cv/src/components/radar/treemap-layout";
import { evaluationFixtures } from "@workspace/radar-data/evaluation-fixtures";

test("official non-overlapping counts and compatible QoQ", () => {
  assert.equal(groups.reduce((n, g) => n + (g.current ?? 0), 0), 533288);
  assert.equal(groups.reduce((n, g) => n + (g.previous ?? 0), 0), 600080);
  assert.equal(groups.length, 5);
  assert.equal(new Set(groups.map(g => g.id)).size, 5);
  assert.equal(Math.round((87950 / 99447 - 1) * 1000) / 10, -11.6);
  assert.equal(roles.length, 30);
  assert(roles.every(r => r.exposure.status === "draft" && !r.exposure.reviewedBy));
});
test("treemap rectangles encode counts exactly, never CV or layer", () => {
  const items = groups.map(g => ({ id: g.id, value: g.current! }));
  const rects = layoutTreemap(items, 100, 75);
  const total = items.reduce((n, i) => n + i.value, 0);
  for (const r of rects) assert(Math.abs(r.w * r.h / 7500 - items.find(i => i.id === r.id)!.value / total) < 1e-10);
  assert.deepEqual(layoutTreemap(items, 100, 75), rects);
  assert.equal(qoq(null, 10), null);
  assert.equal(qoq(10, null), null);
  assert.equal(qoq(10, 0), null);
  assert.equal(qoq(10, 10), 0);
});
test("multilingual claims preserve exact source spans", () => {
  const text = "I used SQL to analyse records.\nSaya menggunakan Python untuk projek.\n我使用了统计分析。";
  const r = keywordMatch(text);
  for (const id of ["sql", "python", "statistics"]) assert(r.evidence.some(e => e.skillId === id && e.kind === "explicit"));
  for (const e of r.evidence) assert.equal(text.slice(e.start, e.end), e.text);
});
test("negations, interests, uncertain and team claims do not count as possession", () => {
  const fixtures = [
    ["No SQL, Python or Excel experience", "negated"],
    ["I have never used SQL", "negated"],
    ["Saya belum menggunakan Python", "negated"],
    ["我没有使用过Python", "negated"],
    ["I want to learn Python", "interest"],
    ["Saya ingin belajar SQL", "interest"],
    ["我想学习Python", "interest"],
    ["I have basic Python exposure", "uncertain"],
    ["Our team used SQL", "uncertain"],
  ] as const;
  for (const [text, kind] of fixtures) {
    const result = keywordMatch(text);
    assert.equal(classifyEvidence(text), kind, text);
    assert(result.evidence.length > 0, text);
    assert(result.roles.every(r => !r.matchedSkillIds.length), text);
    assert(result.evidence.every(e => e.kind === kind), text);
  }
});
test("aliases use word boundaries and unknown text does not match", () => {
  assert(!keywordMatch("I am an excellent guitarist").evidence.some(e => e.skillId === "excel" || e.skillId === "git"));
  assert.equal(keywordMatch("unrelated words about a synthetic garden").evidence.length, 0);
  for (const text of ["I wrote unit tests with Jest.", "I used Jest to test the billing module."]) {
    assert(keywordMatch(text).evidence.some(e => e.skillId === "software-testing" && e.kind === "explicit"), text);
  }
});
test("labelled multilingual negative evaluation fixtures cannot create accepted skills", () => {
  for (const fixture of evaluationFixtures.filter(f => !f.accepted)) {
    const result = keywordMatch(fixture.text);
    assert(!result.evidence.some(e => e.skillId === fixture.skillId && (e.kind === "explicit" || e.kind === "inferred")), fixture.text);
  }
});
test("bounded evidence never chops a negated long clause into positive claims", () => {
  const r = keywordMatch("No experience " + "Python ".repeat(5000));
  assert(r.truncated);
  assert.equal(r.evidence.length, 0);
  assert.equal(extractPhrases("Python.\n".repeat(80)).phrases.length, 48);
});
test("semantic candidates require action evidence, not interest or generic title", () => {
  assert(canInfer(extractPhrases("I built a reporting tool").phrases[0]));
  for (const text of ["Data analyst", "I want to build SQL queries", "Our team built dashboards", "I have no SQL experience"]) assert(!canInfer(extractPhrases(text).phrases[0]), text);
});
test("every selected-role pathway is targeted; complete coverage deepens evidence", () => {
  for (const role of roles) {
    const pathway = makeRadarPathway(role.id, []);
    assert.equal(pathway.roleId, role.id);
    assert.equal(pathway.title, role.title);
    const complete = makeRadarPathway(role.id, role.skillIds);
    assert(complete.noGaps);
    if (complete.available) assert.equal(complete.steps[0].title, "Deepen the evidence");
  }
  assert.throws(() => makeRadarPathway("not-a-role", []));
  assert(skills.every(s => s.id));
});
const vector = (index = 0) => Array.from({ length: DIMENSIONS }, (_, i) => i === index ? 1 : 0);
const payload = (embedding: unknown, index = 0) => ({ model: MODEL, data: [{ index, embedding }] });
test("vector validator rejects wrong models, dimensions, NaNs, zeros, duplicate indices", () => {
  assert.deepEqual(validateVectors(payload(vector()), 1)[0], vector());
  for (const value of [null, {}, { model: "other", data: [] }, payload([1, 2]), payload(vector().map(() => 0)), payload(vector().map(() => NaN)), payload(vector(), 3), { model: MODEL, data: [{ index: 0, embedding: vector() }, { index: 0, embedding: vector() }] }]) {
    assert.throws(() => validateVectors(value, 1));
  }
  assert.equal(cosine(vector(0), vector(1)), 0);
  assert.equal(cosine(vector(), vector()), 1);
  // The topical floor is the cosine at which an occupation earns no topical credit.
  assert(THRESHOLD > 0.7 && THRESHOLD < 0.8);
  assert(MARGIN > 0);
});
test("demand direction is the published quarter-on-quarter figure, and unavailable when it cannot be computed", () => {
  assert.equal(groupDemandChange("2"), (285907 - 315768) / 315768);
  assert.equal(groupDemandChange("1"), (87950 - 99447) / 99447);
  assert.equal(groupDemandChange("99"), null);
  // Every curated occupation sits in a DOSM major group that has a published comparison.
  for (const role of roles) assert.notEqual(groupDemandChange(role.groupId), null, role.id);
});
test("occupation match carries demand evidence and no topical score until an embedding runs", () => {
  const result = keywordMatch("I used SQL to analyse sales records.");
  assert.ok(result.roles.length > 0);
  for (const role of result.roles) {
    assert.equal(role.topicalScore, null);
    assert.equal(role.matchScore, null);
    assert(role.overlapScore >= 0 && role.overlapScore <= 1);
    assert(role.demandChange === null || (role.demandChange > -1 && role.demandChange < 1));
  }
  // Deterministic keyword overlap must still separate evidenced roles from untouched ones.
  const evidenced = roleMatches(result.evidence).filter(r => r.matchedSkillIds.length > 0);
  assert.ok(evidenced.length > 0);
  for (const role of evidenced) assert(role.overlapScore > 0);
});
test("profile query lists only evidenced skill labels and refuses an empty profile", () => {
  assert.equal(buildProfileQuery(["sql", "python"]), "query: SQL, Python");
  assert.equal(buildProfileQuery([]), "");
});
test("match score blends topical, overlap and demand with published weights", () => {
  assert.equal(blendMatchScore(null, 1, 0), null);
  const strong = blendMatchScore(0.95, 1, 0)!;
  const weak = blendMatchScore(0.76, 0, 0)!;
  assert(strong > weak);
  assert(strong <= 100 && strong >= 0);
  // A shrinking occupation group must not outscore the same profile in a growing group.
  const growing = blendMatchScore(0.9, 0.5, 0.1)!;
  const shrinking = blendMatchScore(0.9, 0.5, -0.2)!;
  assert(growing > shrinking);
});
test("RunPod uses verified embeddings path/payload and propagates abort, no retries", async () => {
  let calls = 0;
  const config = { endpoint: "synthetic-endpoint", key: "synthetic-not-a-secret", revision: "test" };
  const transport: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://api.runpod.ai/v2/synthetic-endpoint/openai/v1/embeddings");
    assert.deepEqual(JSON.parse(options!.body as string), { model: MODEL, input: ["query: synthetic"] });
    return new Response(JSON.stringify(payload(vector())));
  };
  await embed(["query: synthetic"], config, new AbortController().signal, transport);
  assert.equal(calls, 1);
  await assert.rejects(() => embed(["x"], config, new AbortController().signal, async () => new Response("bad", { status: 503 })));
  await assert.rejects(() => embed(["x"], config, new AbortController().signal, async () => new Response("bad json")));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => embed(["x"], config, controller.signal, async (_url, options) => { options!.signal!.throwIfAborted(); return new Response(""); }));
});
test("unconfigured semantic service stays usable via evidence-checked fallback", async () => {
  // No real endpoint may run from an ordinary unit check.
  const old = process.env.RADAR_RUNPOD_APPROVED;
  process.env.RADAR_RUNPOD_APPROVED = "false";
  try {
    const result = await matchRadarText("I used Python. I have never used SQL.");
    assert.equal(result.mode, "keyword-fallback");
    assert.equal(result.liveVerified, false);
    assert(result.evidence.some(e => e.skillId === "sql" && e.kind === "negated"));
  } finally {
    if (old === undefined) delete process.env.RADAR_RUNPOD_APPROVED;
    else process.env.RADAR_RUNPOD_APPROVED = old;
  }
});
test("semantic path ranks every occupation, embeds only the evidenced profile, and sorts by match score", async () => {
  const keys = ["RADAR_RUNPOD_APPROVED", "RUNPOD_ENDPOINT_ID", "RUNPOD_API_KEY", "RADAR_MODEL_REVISION"] as const;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.RADAR_RUNPOD_APPROVED = "true";
  process.env.RUNPOD_ENDPOINT_ID = "synthetic-endpoint";
  process.env.RUNPOD_API_KEY = "synthetic-not-a-secret";
  process.env.RADAR_MODEL_REVISION = MODEL_REVISION;
  const sent: string[][] = [];
  const transport: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String((options as RequestInit).body)) as { input: string[] };
    sent.push(body.input);
    const data = body.input.map((_text, index) => ({
      index,
      embedding: Array.from({ length: DIMENSIONS }, (_, d) => (index === d ? 1 : 0)),
    }));
    return new Response(JSON.stringify({ model: MODEL, data }));
  };
  try {
    const result = await matchRadarText("I used SQL to analyse sales records.", undefined, transport);
    assert.equal(result.mode, "semantic");
    assert.equal(result.liveVerified, false);
    assert.equal(result.roles.length, roles.length);
    // The profile is the only single-item request: one profile, not one per phrase.
    const profiles = sent.filter((input) => input.length === 1);
    assert.equal(profiles.length, 1);
    // "SQL" and "sales" are both named outright, so both enter the evidenced profile.
    assert.equal(profiles[0][0], "query: SQL, Sales");
    // Every occupation carries a topical score and a blended match score.
    for (const role of result.roles) {
      assert(role.topicalScore !== null);
      assert(role.matchScore !== null);
      assert(role.topicalScore! >= 0 && role.topicalScore! <= 1);
      assert(role.matchScore! >= 0 && role.matchScore! <= 100);
    }
    // The stub returns a one-hot vector per input index within each request, and the
    // catalogue is embedded in batches of 32, so exactly one occupation passage lands
    // on index zero of its batch. That is the only perfect match for a one-item
    // profile request, and it pins the role-vector offset to the catalogue order.
    const perfect = result.roles.filter(r => r.topicalScore === 1);
    assert.equal(perfect.length, 1);
    assert.equal(perfect[0].roleId, roles[64 - ROLE_VECTOR_OFFSET].id);
    // The list is ordered by match score, strongest first.
    for (let i = 1; i < result.roles.length; i++) {
      assert((result.roles[i - 1].matchScore ?? -1) >= (result.roles[i].matchScore ?? -1));
    }
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
test("legacy readiness and disruption formulas retain exact regressions", () => {
  const empty = analyzeCv("");
  assert.equal(empty.score, 18);
  const cv = analyzeCv("Python SQL Excel Power BI statistics dashboard business analysis");
  assert.equal(cv.score, 51);
  assert.equal(cv.scenarios[0].roles[0].role.title, "Data Analyst");
  assert.equal(cv.scenarios[0].roles[0].score, 97.6);
  assert.equal(cv.scenarios[1].roles[0].score, 93.5);
});
