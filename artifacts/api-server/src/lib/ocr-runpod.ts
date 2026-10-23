/**
 * HTTP transport for the Runpod-hosted OCR worker.
 *
 * The local transport speaks stdio to a spawned Python child. Serverless hosts
 * (Vercel) cannot spawn that child, so when the operator sets RUNPOD_OCR_URL
 * the worker is hosted at the app-owned Runpod serverless endpoint instead
 * (runpod/handler.py wraps the same untouched worker.py) and this client is
 * used: submit, poll to a terminal state, and map the worker envelope 1:1.
 * No request bodies, tokens or provider responses are ever logged.
 */
import { OcrError, type Result } from "./ocr-types";

export { OcrError } from "./ocr-types";
export type { Result } from "./ocr-types";

type Envelope = { text?: unknown; warnings?: unknown; model?: unknown; device?: unknown; error?: unknown };
type Job = { id?: unknown; status?: unknown; output?: Envelope | null };

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);
// The runSync hold is a server-side ceiling; a cold start may outlive it, so
// the deadline is the local worker's total bound and polling is the fallback.
const WAIT_MS = 60_000;
const DEADLINE_MS = 180_000;

function pollMs() {
  const raw = process.env.RUNPOD_OCR_POLL_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3_000;
}

let inflight = 0;
/** Replaces the local queue+active count for the routes' capacity check. */
export function remoteInflight() { return inflight; }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function endpoint(base: string, path: string) {
  return new URL(base.replace(/\/+$/, "") + path);
}

/** Fail-closed envelope mapping; the message pool matches the local transport. */
function toResult(output: Envelope | null | undefined): Result {
  if (output && output.error != null) {
    throw new OcrError(422, "Image is invalid, too large, or could not be decoded. Use PNG/JPEG up to 4 million pixels and 4,000 pixels per side.");
  }
  const warnings = output?.warnings;
  if (typeof output?.text !== "string" || !Array.isArray(warnings) || !warnings.every((item) => typeof item === "string")
    || output.model !== "english_g2" || output.device !== "cpu") {
    throw new OcrError(503, "English OCR model unavailable or invalid.");
  }
  return { text: output.text, warnings: warnings as string[], model: "english_g2", device: "cpu" };
}

async function call(method: string, url: URL, key: string, controller: AbortController, caller: AbortSignal, body?: string): Promise<Job> {
  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
  } catch {
    // An abort here is the caller's: the handling controller is only aborted by
    // the abort listener, never by provider activity.
    if (caller.aborted) throw new OcrError(499, "OCR cancelled.");
    throw new OcrError(503, "OCR worker unavailable. Paste text or try again later.");
  }
  if (response.status === 429) throw new OcrError(429, "OCR is busy. Try again shortly.");
  if (!response.ok) throw new OcrError(503, "OCR worker unavailable. Paste text or try again later.");
  let job: Job;
  try { job = await response.json() as Job; } catch {
    if (caller.aborted) throw new OcrError(499, "OCR cancelled.");
    throw new OcrError(503, "English OCR model unavailable or invalid.");
  }
  return job;
}

export async function runpodExtract(imageBase64: string, signal: AbortSignal, base: string): Promise<Result> {
  if (signal.aborted) return Promise.reject(new OcrError(499, "OCR cancelled."));
  const key = process.env.RUNPOD_API_KEY ?? "";
  if (!key) return Promise.reject(new OcrError(503, "OCR worker unavailable. Ask the operator to set the Runpod credential."));
  const deadline = Date.now() + DEADLINE_MS;
  // Caller abort reaches whichever HTTP call is open right now, including ones
  // made while falling back from the runSync hold to the status poll.
  let current: AbortController | null = null;
  const onAbort = () => { if (current) current.abort(); };
  signal.addEventListener("abort", onAbort, { once: true });
  inflight++;
  try {
    current = new AbortController();
    const submitUrl = endpoint(base, "/runsync");
    submitUrl.searchParams.set("wait", String(WAIT_MS));
    let job = await call("POST", submitUrl, key, current, signal, JSON.stringify({ input: { imageBase64 } }));
    while (!TERMINAL.has(String(job.status))) {
      if (Date.now() > deadline) throw new OcrError(504, "OCR timed out. Try a smaller image or paste text.");
      if (signal.aborted) throw new OcrError(499, "OCR cancelled.");
      const id = typeof job.id === "string" ? job.id : null;
      if (!id) throw new OcrError(503, "OCR worker unavailable. Paste text or try again later.");
      await sleep(pollMs());
      if (signal.aborted) throw new OcrError(499, "OCR cancelled.");
      current = new AbortController();
      job = await call("GET", endpoint(base, `/status/${id}`), key, current, signal);
    }
    if (job.status === "TIMED_OUT") throw new OcrError(504, "OCR timed out. Try a smaller image or paste text.");
    if (job.status !== "COMPLETED") throw new OcrError(503, "OCR worker unavailable. Paste text or try again later.");
    return toResult(job.output);
  } finally {
    inflight--;
    signal.removeEventListener("abort", onAbort);
  }
}
