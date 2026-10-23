import express, { Router, type IRouter } from "express";
import { RoastRequest, RoastResponse, type RoastRole } from "@workspace/api-zod";
import { version } from "@workspace/radar-data";
import { OcrError, ocrWorker } from "../lib/ocr";
import { extractSkills } from "../lib/gemini/extract";
import { generateRoast } from "../lib/gemini/roast";
import { computeScore } from "../lib/gemini/template-roast";
import { missingSkills, weakSkills } from "../lib/gemini/gaps";
import { matchRadarEvidence } from "../lib/radar/service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Anonymous per-process window. Gemini has its own RPM/token circuit breaker;
// this protects the CPU OCR worker and the request path before either runs.
let windowStart = 0;
let requests = 0;
const WINDOW_LIMIT = 30;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_KINDS = new Set(["explicit", "inferred"]);

function validateImage(encoded: string): Buffer {
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new OcrError(400, "Invalid image encoding.");
  }
  const bytes = Buffer.from(encoded, "base64");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.length > MAX_IMAGE_BYTES) throw new OcrError(413, "Images must be no larger than 10 MB.");
  if (!png && !jpeg) throw new OcrError(415, "Only actual PNG and JPEG image content is supported.");
  return bytes;
}

async function readImageText(encoded: string, signal: AbortSignal): Promise<string> {
  validateImage(encoded);
  const result = await ocrWorker.extract(encoded, signal);
  const text = result.text.trim();
  if (!text) throw new OcrError(422, "No readable text was found in the image.");
  return text.slice(0, 12000);
}

router.post(
  "/roast",
  (req, res, next) => {
    res.set("Cache-Control", "no-store").set("Pragma", "no-cache");
    if (process.env.ROAST_ENABLED === "false") {
      res.status(501).json({ error: "CV roasting is disabled on this deployment. Use the radar tools instead." });
      return;
    }
    if (!req.is("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json." });
      return;
    }
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); requests = 0; }
    if (++requests > WINDOW_LIMIT) {
      res.status(429).json({ error: "Roast capacity reached. Try again shortly." });
      return;
    }
    next();
  },
  // Images need a larger parser than the app-wide 64kb text limit. This router
  // is mounted before that parser, exactly like the OCR route.
  express.json({ limit: "14mb", strict: true }),
  async (req, res): Promise<void> => {
    const parsed = RoastRequest.safeParse(req.body);
    req.body = undefined;
    if (!parsed.success) {
      res.status(400).json({
        error: "Send either a CV of 1–12,000 characters or a PNG/JPEG image, plus explicit consent. Do not send both.",
      });
      return;
    }

    const abort = new AbortController();
    const close = () => { if (!res.writableEnded) abort.abort(); };
    res.on("close", close);

    try {
      let text: string;
      if (parsed.data.imageBase64) {
        if (process.env.OCR_ENABLED === "false") {
          res.status(501).json({ error: "OCR image import is disabled on this deployment. Paste your CV text instead." });
          return;
        }
        const encoded = parsed.data.imageBase64;
        parsed.data.imageBase64 = "";
        text = await readImageText(encoded, abort.signal);
      } else {
        text = parsed.data.text ?? "";
      }

      if (abort.signal.aborted) return;

      const extraction = await extractSkills(text, abort.signal);
      if (abort.signal.aborted) return;

      const rankingReason = "Occupation ranking used local keyword overlap and DOSM demand direction only; no embedding request was made for this review.";
      const ranking = await matchRadarEvidence(extraction.evidence, false, rankingReason, abort.signal);
      if (abort.signal.aborted) return;

      const ranked: RoastRole[] = [...ranking.roles].sort((a, b) =>
        (b.matchScore ?? -1) - (a.matchScore ?? -1) ||
        b.overlapScore - a.overlapScore ||
        a.roleId.localeCompare(b.roleId)
      );
      const topRoles = ranked.filter((role) => role.overlapScore > 0).slice(0, 3);
      const accepted = new Set(
        extraction.evidence
          .filter((item) => ACCEPTED_KINDS.has(item.kind))
          .map((item) => item.skillId),
      );
      // A weak mention is not "missing" — it is present but unproven. Keep the
      // two gaps disjoint so the UI can label them differently.
      const weak = weakSkills(extraction.evidence, extraction.weakSkillIds, topRoles);
      const weakSet = new Set(weak);
      const missing = missingSkills(topRoles).filter((id) => !weakSet.has(id));
      const score = computeScore(ranked);

      const generation = await generateRoast({
        seniority: extraction.seniority,
        targetRoles: extraction.targetRoles.length
          ? extraction.targetRoles
          : topRoles.map((role) => role.roleId),
        evidence: extraction.evidence,
        weakSkillIds: extraction.weakSkillIds,
        roles: topRoles,
        missing,
        weak,
        score,
      }, abort.signal);

      if (generation.failure) {
        // Log the failure class only: never the CV, the prompt or a provider body.
        logger.warn({ roast: { stage: "narrative", failure: generation.failure } }, "Roast narrative used the deterministic fallback");
      }
      if (extraction.method === "keyword-fallback") {
        logger.info(
          { roast: { stage: "extraction", method: extraction.method, failure: extraction.failure } },
          "Roast extraction used the keyword fallback",
        );
      }
      if (abort.signal.aborted) return;

      res.json(RoastResponse.parse({
        version,
        mode: ranking.mode,
        reason: `${extraction.reason} ${ranking.reason}`,
        roast: generation.roast,
        radar: {
          evidence: ranking.evidence,
          roles: ranked,
          truncated: ranking.truncated,
          liveVerified: ranking.liveVerified,
        },
        extraction: {
          method: extraction.method,
          skillsFound: accepted.size,
          targetRoles: extraction.targetRoles.length
            ? extraction.targetRoles
            : topRoles.map((role) => role.roleId),
          weakSkillIds: extraction.weakSkillIds.slice(0, 12),
          seniority: extraction.seniority,
          latencyMs: extraction.latencyMs,
        },
        liveVerified: false,
      }));
    } catch (error) {
      if (abort.signal.aborted) return;
      if (error instanceof OcrError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      logger.error({ roast: { stage: "request" } }, "Roast request failed");
      res.status(500).json({ error: "Roast request failed." });
    } finally {
      res.off("close", close);
    }
  },
);

export default router;
