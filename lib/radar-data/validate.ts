import { groups, roles, skills, snapshot, version } from "./catalogue";
import { excludedGroups } from "./snapshot-v1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Radar reference validation failed: ${message}`);
}

export function validateCatalogue() {
  assert(version === "radar-2026q2-v1", "unexpected snapshot version");
  const groupIds = new Set(groups.map((group) => group.id));
  const skillIds = new Set<string>(skills.map((skill) => skill.id));
  assert(groupIds.size === 5 && ["1", "2", "3", "4", "5"].every((id) => groupIds.has(id)), "groups 1–5 must be present exactly once");
  assert(skillIds.size === skills.length, "duplicate skill IDs");
  assert(roles.length === 30, "expected 30 curated occupations");
  assert(new Set(roles.map((role) => role.id)).size === roles.length, "duplicate role IDs");
  assert(new Set(roles.map((role) => role.mascoCode)).size === roles.length, "duplicate occupation mappings");

  const expected = [
    [87950, 99447], [285907, 315768], [86512, 93987], [40408, 48784], [32511, 42094],
  ];
  groups.forEach((group, index) => {
    assert(group.current === expected[index][0] && group.previous === expected[index][1], `Table 2 transcription changed: ${group.id}`);
    assert(group.missingReason === null, `verified group ${group.id} should not be marked missing`);
  });
  const representedCurrent = groups.reduce((sum, group) => sum + group.current, 0);
  const representedPrevious = groups.reduce((sum, group) => sum + group.previous, 0);
  assert(representedCurrent === 533288 && representedPrevious === 600080, "represented subset totals");
  assert(representedCurrent + excludedGroups.reduce((sum, group) => sum + group.current, 0) === snapshot.currentTotal, "Q2 all major groups must reconcile");
  assert(representedPrevious + excludedGroups.reduce((sum, group) => sum + group.previous, 0) === snapshot.previousTotal, "Q1 all major groups must reconcile");
  assert(snapshot.currentPublished === "2026-08-18" && snapshot.previousPublished === "2026-06-25", "publication dates");
  assert(snapshot.currentTotal === 555509 && snapshot.previousTotal === 626861, "release totals");
  assert(snapshot.sources.every((source) => source.url.startsWith("https://")), "sources must be HTTPS");
  assert(snapshot.attribution === "Source: Department of Statistics Malaysia", "required attribution");

  roles.forEach((role) => {
    assert(groupIds.has(role.groupId), `${role.id}: unknown group`);
    assert(/^[1-5]\d{3}(-\d{2})?$/.test(role.mascoCode), `${role.id}: code format`);
    assert(role.groupId === role.mascoCode[0], `${role.id}: wrong major group`);
    assert(role.mascoVersion === "MASCO 2020" && role.mappingSource.includes("masco_2020_en.pdf"), `${role.id}: provenance`);
    assert(role.skillIds.length >= 3 && role.skillIds.every((id) => skillIds.has(id)), `${role.id}: skill references`);
    assert(new Set(role.skillIds).size === role.skillIds.length, `${role.id}: repeated skills`);
    assert(role.laterCareer === (role.groupId === "1"), `${role.id}: managerial destination flag`);
    assert(role.sdgs.length > 0 && role.sdgs.every((sdg) => sdg.goal >= 1 && sdg.goal <= 17 && sdg.explanation.length > 40), `${role.id}: SDG explanation`);
    assert(role.exposure.score !== null && role.exposure.score >= 0 && role.exposure.score <= 10, `${role.id}: draft score range`);
    assert(role.exposure.status === "draft" && role.exposure.reviewedBy === null && role.exposure.reviewedAt === null, `${role.id}: no human sign-off exists; scores must remain draft`);
    assert(role.pathway && role.pathway.learn && role.pathway.do && role.pathway.evidence, `${role.id}: pathway components`);
  });
  // Known national extensions prevent accidentally substituting ISCO codes.
  assert(roles.some((role) => role.mascoCode === "1511" && role.legacyRoleTitle === "ICT Manager"), "MASCO ICT manager code is 1511, not assumed ISCO 1330");
  assert(roles.some((role) => role.mascoCode === "2531"), "MASCO cybersecurity unit group");
  assert(roles.some((role) => role.mascoCode === "2524-03" && role.title === "Data Analyst"), "exact MASCO data analyst mapping");
  assert(skills.every((skill) => skill.aliases.length > 0 && skill.aliases.every((alias) => alias.trim().length >= (/\p{Script=Han}/u.test(alias) ? 2 : 3))), "empty/overbroad aliases");

  return { version, groups: groups.length, roles: roles.length, skills: skills.length, representedCurrent, representedPrevious, reviewedScores: 0 };
}

console.info("Radar reference validation passed", validateCatalogue());
