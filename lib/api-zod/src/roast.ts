import { z } from "zod";

/**
 * Unified roast endpoint schemas.
 *
 * These are hand-written because the roast response intentionally exposes more
 * than the radar match contract (LLM extraction metadata, deterministic score).
 * The OpenAPI document remains the source of truth for the older radar/OCR
 * routes; this module can be folded into codegen later without changing the
 * wire shape.
 */

/** Evidence kind names shared with the radar taxonomy. */
export const RoastEvidenceKind = z.enum([
  "explicit",
  "inferred",
  "interest",
  "negated",
  "uncertain",
]);

/**
 * How the evidence was produced. "llm" means Gemini selected the skill and we
 * verified the quoted span against the submitted text. It is never a claim
 * that the model judged proficiency.
 */
export const RoastEvidenceMethod = z.enum(["llm", "keyword", "semantic"]);

export const RoastEvidence = z.object({
  skillId: z.string().min(1),
  text: z.string().min(1).max(500),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  kind: RoastEvidenceKind,
  method: RoastEvidenceMethod,
  similarity: z.number().nullable(),
});

export type RoastEvidence = z.infer<typeof RoastEvidence>;

export const RoastRole = z.object({
  roleId: z.string().min(1),
  title: z.string().min(1),
  matchedSkillIds: z.array(z.string()),
  missingSkillIds: z.array(z.string()),
  overlapScore: z.number().min(0).max(1),
  demandChange: z.number().nullable(),
  topicalScore: z.number().nullable(),
  matchScore: z.number().min(0).max(100).nullable(),
});

export type RoastRole = z.infer<typeof RoastRole>;

/**
 * Text or image, never both. `consent` is the single explicit permission to
 * send the submitted content to Google Gemini for extraction and roasting;
 * `ocrConsent` is only required when an image has to be read by the local CPU
 * worker first.
 */
export const RoastRequest = z
  .object({
    text: z.string().min(1).max(12000).optional(),
    imageBase64: z.string().min(1).max(13981016).optional(),
    consent: z.literal("roast-my-cv"),
    ocrConsent: z.literal("server-image-processing").optional(),
  })
  .strict()
  .refine(
    (data) => (data.text != null) !== (data.imageBase64 != null),
    { message: "Provide either text or imageBase64, not both." },
  )
  .refine(
    (data) => !data.imageBase64 || data.ocrConsent === "server-image-processing",
    { message: "OCR consent is required when imageBase64 is provided.", path: ["ocrConsent"] },
  )
  .refine(
    (data) => !data.ocrConsent || data.imageBase64 != null,
    { message: "OCR consent is only valid with imageBase64.", path: ["ocrConsent"] },
  );

export type RoastRequest = z.infer<typeof RoastRequest>;

export const RoastObject = z.object({
  summary: z.string().min(1).max(500),
  hardTruths: z.array(z.string().min(1).max(300)).min(3).max(5),
  skillsGap: z.object({
    missing: z.array(z.string()).max(12),
    weak: z.array(z.string()).max(12),
  }),
  actionItems: z.array(z.string().min(1).max(300)).min(3).max(5),
  score: z.number().int().min(0).max(100),
  persona: z.literal("brutal-honesty"),
  fallback: z.boolean(),
  source: z.enum(["llm", "template", "static"]),
});

export type RoastObject = z.infer<typeof RoastObject>;

export const ExtractionMeta = z.object({
  method: z.enum(["llm", "keyword-fallback"]),
  skillsFound: z.number().int().min(0),
  /** Catalogue role ids the CV appears to target. */
  targetRoles: z.array(z.string()),
  /** Skill ids mentioned only as an interest, negation, or uncertain claim. */
  weakSkillIds: z.array(z.string()),
  seniority: z.enum(["student", "entry", "mid", "senior", "unknown"]),
  latencyMs: z.number().int().min(0),
});

export type ExtractionMeta = z.infer<typeof ExtractionMeta>;

export const RoastRadar = z.object({
  evidence: z.array(RoastEvidence),
  roles: z.array(RoastRole),
  truncated: z.boolean(),
  liveVerified: z.boolean(),
});

export type RoastRadar = z.infer<typeof RoastRadar>;

export const RoastResponse = z.object({
  version: z.string(),
  /** Occupation-ranking mode. Evidence/finding method is reported separately. */
  mode: z.enum(["semantic", "keyword-fallback"]),
  reason: z.string(),
  roast: RoastObject,
  radar: RoastRadar,
  extraction: ExtractionMeta,
  liveVerified: z.boolean(),
});

export type RoastResponse = z.infer<typeof RoastResponse>;
