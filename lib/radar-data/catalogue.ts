/** Shared, dependency-free public reference catalogue. No private CV data. */
export { version, groups, snapshot } from "./snapshot-v1";
export { skills } from "./skills-v1";
export { roles, exposureRubric } from "./roles-v1";
export type { SkillId } from "./skills-v1";
export type { RadarRole } from "./roles-v1";

export type RadarGroup = (typeof import("./snapshot-v1").groups)[number];
export type RadarSkill = (typeof import("./skills-v1").skills)[number];
export type RadarSnapshot = typeof import("./snapshot-v1").snapshot;
