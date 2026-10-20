import { Router, type IRouter } from "express";
import { GetRadarReferenceResponse, MatchRadarBody, MatchRadarResponse, GetRadarPathwayBody, GetRadarPathwayResponse } from "@workspace/api-zod";
import { version, groups, roles, skills, snapshot, exposureRubric } from "@workspace/radar-data";
import { makeRadarPathway } from "@workspace/radar-data/pathway";
import { matchRadarText } from "../lib/radar/service";

const router: IRouter = Router();
const reference = GetRadarReferenceResponse.parse({ version, groups, roles, skills, snapshot, exposureRubric });
router.get("/radar/reference", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300").json(reference);
});

router.post("/radar/match", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const input = MatchRadarBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Synthetic text (1–12,000 characters) and explicit remote consent are required." }); return; }
  const abort = new AbortController();
  const close = () => { if (!res.writableEnded) abort.abort(); };
  res.on("close", close);
  try {
    const result = await matchRadarText(input.data.text, abort.signal);
    if (!abort.signal.aborted) res.json(MatchRadarResponse.parse(result));
  } finally { res.off("close", close); }
});

router.post("/radar/pathway", (req, res) => {
  res.set("Cache-Control", "no-store");
  const input = GetRadarPathwayBody.strict().safeParse(req.body);
  if (!input.success || !roles.some(r => r.id === input.data.roleId) || input.data.matchedSkillIds.some(id => !skills.some(s => s.id === id))) {
    res.status(400).json({ error: "Choose a catalogue role and valid taxonomy skills." }); return;
  }
  res.json(GetRadarPathwayResponse.parse(makeRadarPathway(input.data.roleId, input.data.matchedSkillIds)));
});
export default router;
