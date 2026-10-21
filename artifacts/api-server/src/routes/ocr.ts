import express, { Router, type IRouter } from "express";
import { ExtractCvImageBody, ExtractCvImageResponse } from "@workspace/api-zod";
import { OcrError, ocrWorker } from "../lib/ocr";

const router: IRouter = Router();
// Bounded global anonymous rate window; no IPs, filenames, or CV content retained.
let windowStart = 0;
let requests = 0;
router.post("/ocr/image", (req, res, next) => {
  res.set("Cache-Control", "no-store").set("Pragma", "no-cache");
  if (req.headers["x-ocr-consent"] !== "server-image-processing") {
    res.status(400).json({ error: "Explicit OCR-specific consent is required before sending an image." }); return;
  }
  if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); requests = 0; }
  if (++requests > 24 || ocrWorker.pending >= 3) { res.status(429).json({ error: "OCR capacity reached. Try again shortly." }); return; }
  next();
}, express.json({ limit: "14mb", strict: true }), async (req, res) => {
  const input = ExtractCvImageBody.strict().safeParse(req.body);
  if (!input.success) { req.body = undefined; res.status(400).json({ error: "A bounded PNG/JPEG image and OCR consent are required." }); return; }
  const encoded = input.data.imageBase64;
  req.body = undefined;
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    res.status(400).json({ error: "Invalid image encoding." }); return;
  }
  const bytes = Buffer.from(encoded, "base64");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.length > 10 * 1024 * 1024) { res.status(413).json({ error: "Images must be no larger than 10 MB." }); return; }
  if (!png && !jpeg) { res.status(415).json({ error: "Only actual PNG and JPEG image content is supported." }); return; }
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", close);
  try {
    const result = await ocrWorker.extract(encoded, controller.signal);
    if (!controller.signal.aborted) res.json(ExtractCvImageResponse.parse(result));
  } catch (error) {
    if (!controller.signal.aborted) res.status(error instanceof OcrError ? error.status : 503).json({ error: error instanceof OcrError ? error.message : "OCR unavailable. Your existing editor text has not been changed." });
  } finally { res.off("close", close); }
});
export default router;
