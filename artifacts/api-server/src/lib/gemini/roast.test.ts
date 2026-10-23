import { test } from "node:test";
import assert from "node:assert/strict";
import { RoastObject, RoastRequest, type RoastRole } from "@workspace/api-zod";
import { roleMatches } from "@workspace/radar-data/matching";
import { extractSkills } from "./extract";
import { generateRoast } from "./roast";
import { computeScore, templateRoast } from "./template-roast";
import type { MatchEvidence } from "../radar/service";
import type { RoastContext } from "./types";

// The client only needs a syntactically valid key for these mocked-transport
// tests; nothing leaves the process.
process.env.GEMINI_API_KEY = "test-key-000000000000000000000000";
process.env.GEMINI_MODEL = "gemini-3.6-flash";
process.env.ROAST_ENABLED = "true";
process.env.ROAST_RPM_LIMIT = "1000";
process.env.ROAST_DAILY_TOKEN_LIMIT = "10000000";

function gemini(payload: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    usageMetadata: { totalTokenCount: 100 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function sequence(payloads: unknown[]): typeof fetch {
  let index = 0;
  return async () => gemini(payloads[Math.min(index++, payloads.length - 1)]);
}

const evidence: MatchEvidence = {
  skillId: "sql",
  text: "I used SQL to analyse sales.",
  start: 0,
  end: 28,
  kind: "explicit",
  method: "llm",
  similarity: null,
};

function role(overrides: Partial<RoastRole> = {}): RoastRole {
  return {
    roleId: "masco-2524-03",
    title: "Data Analyst",
    matchedSkillIds: ["sql"],
    missingSkillIds: ["python", "statistics"],
    overlapScore: 1 / 3,
    demandChange: null,
    topicalScore: null,
    matchScore: null,
    ...overrides,
  };
}

function context(overrides: Partial<RoastContext> = {}): RoastContext {
  return {
    seniority: "entry",
    targetRoles: ["masco-2524-03"],
    evidence: [evidence],
    weakSkillIds: [],
    roles: [role()],
    missing: ["python", "statistics"],
    weak: [],
    score: 40,
    ...overrides,
  };
}

test("request requires exactly one payload and the roast consent", () => {
  assert.ok(RoastRequest.safeParse({ text: "I used SQL.", consent: "roast-my-cv" }).success);
  assert.ok(!RoastRequest.safeParse({ text: "x", imageBase64: "aGVsbG8=", consent: "roast-my-cv", ocrConsent: "server-image-processing" }).success);
  assert.ok(!RoastRequest.safeParse({ imageBase64: "aGVsbG8=", consent: "roast-my-cv" }).success);
  assert.ok(!RoastRequest.safeParse({ text: "x", consent: "wrong" }).success);
  assert.ok(!RoastRequest.safeParse({ consent: "roast-my-cv" }).success);
});

test("extraction keeps verified quotes and turns negations and interests into weak mentions", async () => {
  const text = "I used SQL to analyse sales. I have never used Python. I want to learn machine learning.";
  const payload = {
    skills: [
      { skillId: "sql", quote: "I used SQL to analyse sales.", kind: "explicit", confidence: 0.95 },
      { skillId: "python", quote: "I have never used Python.", kind: "explicit", confidence: 0.95 },
      { skillId: "machine-learning", quote: "I want to learn machine learning.", kind: "explicit", confidence: 0.9 },
    ],
    targetRoles: ["masco-2524-03", "not-a-role"],
    seniority: "entry",
  };
  const result = await extractSkills(text, undefined, sequence([payload]));
  assert.equal(result.method, "llm");
  assert.equal(result.failure, null);
  assert.deepEqual(result.evidence.map((item) => item.skillId), ["sql"]);
  assert.equal(result.evidence[0].method, "llm");
  assert.equal(result.evidence[0].start, 0);
  assert.deepEqual(result.weakSkillIds.sort(), ["machine-learning", "python"]);
  assert.deepEqual(result.targetRoles, ["masco-2524-03"]);
  assert.equal(result.seniority, "entry");
});

test("extraction recovers a quote across line breaks without inventing a span", async () => {
  const text = "I used SQL\nto analyse sales.";
  const payload = {
    skills: [{ skillId: "sql", quote: "I used SQL to analyse sales.", kind: "explicit", confidence: 0.95 }],
    targetRoles: [],
    seniority: "unknown",
  };
  const result = await extractSkills(text, undefined, sequence([payload]));
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].start, 0);
  assert.equal(result.evidence[0].end, text.length);
});

test("unverifiable quotes trigger one repair, then the keyword fallback", async () => {
  const payload = {
    skills: [{ skillId: "sql", quote: "Built a warehouse nobody can find.", kind: "explicit", confidence: 0.95 }],
    targetRoles: [],
    seniority: "unknown",
  };
  const result = await extractSkills("I used SQL to analyse sales.", undefined, sequence([payload, payload]));
  assert.equal(result.method, "keyword-fallback");
  assert.equal(result.failure, "invalid-response");
  assert.ok(result.evidence.some((item) => item.skillId === "sql" && item.method === "keyword"));
});

test("roast prose is accepted when it satisfies the contract and score stays server-owned", async () => {
  const payload = {
    summary: "Your SQL claim is real but too thin for the role you want. Two core skills are missing.",
    hardTruths: ["You used SQL once, with no scale or outcome.", "You are missing Python and Statistics.", "No project shows an end-to-end decision."],
    actionItems: ["Publish one Python analysis with the question and result.", "Add a statistics project.", "Rewrite the SQL line with scale and outcome."],
  };
  const result = await generateRoast(context(), undefined, sequence([payload]));
  assert.equal(result.source, "llm");
  assert.equal(result.failure, null);
  assert.equal(result.roast.score, 40);
  assert.equal(result.roast.fallback, false);
  assert.deepEqual(result.roast.skillsGap, { missing: ["python", "statistics"], weak: [] });
  assert.equal(result.roast.hardTruths.length, 3);
  RoastObject.parse(result.roast);
});

test("an unusable roast response falls back to the deterministic template", async () => {
  const payload = { summary: "", hardTruths: [], actionItems: [] };
  const result = await generateRoast(context(), undefined, sequence([payload]));
  assert.equal(result.source, "template");
  assert.equal(result.roast.fallback, true);
  assert.equal(result.roast.score, 40);
  assert.ok(result.roast.hardTruths.length >= 3);
  assert.ok(result.roast.actionItems.length >= 3);
  RoastObject.parse(result.roast);
});

test("template roast handles an empty CV without inventing evidence", () => {
  const result = templateRoast(context({
    evidence: [],
    roles: [],
    missing: [],
    weak: ["python"],
    score: 0,
  }));
  assert.match(result.summary, /no affirmative skill evidence/i);
  assert.ok(result.hardTruths.length >= 3 && result.hardTruths.length <= 5);
  assert.ok(result.actionItems.length >= 3 && result.actionItems.length <= 5);
  assert.equal(result.hardTruths.some((line) => /Python/.test(line)), true);
});

test("score follows published overlap/demand weights and ignores unmatched roles", () => {
  assert.equal(computeScore([]), 0);
  assert.equal(computeScore([role({ overlapScore: 1, demandChange: null })]), 90);
  assert.equal(computeScore([role({ overlapScore: 0.5, demandChange: 0.25 })]), 60);
  assert.equal(computeScore([role({ overlapScore: 1, matchScore: 50 })]), 50);
  assert.equal(computeScore([role({ overlapScore: 0, matchScore: null })]), 0);
});

test("role overlap exposes the catalogue title for the roast response", () => {
  const matched = roleMatches([{ skillId: "sql", kind: "explicit" as const }]);
  const data = matched.find((item) => item.roleId === "masco-2524-03");
  assert.equal(data?.title, "Data Analyst");
  assert.ok(data?.matchedSkillIds.includes("sql"));
});
