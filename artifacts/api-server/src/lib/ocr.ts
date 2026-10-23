import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { OcrError, type Result } from "./ocr-types";
import { remoteInflight, runpodExtract } from "./ocr-runpod";

export { OcrError } from "./ocr-types";
type Job = { imageBase64: string; signal: AbortSignal; resolve: (r: Result) => void; reject: (e: Error) => void; dispose: () => void; timer?: ReturnType<typeof setTimeout> };

/** One private pipe, one reused CPU reader, at most two waiting jobs. No listening port. */
export class OcrWorker {
  constructor(private createChild = () => spawn(resolve(process.cwd(), "../../.pythonlibs/bin/python"), ["-u", resolve(process.cwd(), "ocr/worker.py")], { stdio: "pipe" })) {}
  // Serverless hosts cannot spawn the Python child, so the operator points the
  // same class at the app-owned Runpod endpoint hosting the identical worker.
  private get remote() { return !!process.env.RUNPOD_OCR_URL && process.env.RUNPOD_OCR_URL.trim() !== ""; }
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private buffer = "";
  private active: Job | null = null;
  private queue: Job[] = [];
  private startup?: ReturnType<typeof setTimeout>;
  private cooldown = 0;
  get pending() { return this.remote ? remoteInflight() : this.queue.length + (this.active ? 1 : 0); }

  extract(imageBase64: string, signal: AbortSignal): Promise<Result> {
    if (this.remote) return runpodExtract(imageBase64, signal, process.env.RUNPOD_OCR_URL!.trim());
    if (signal.aborted) return Promise.reject(new OcrError(499, "OCR cancelled."));
    if (this.pending >= 3) return Promise.reject(new OcrError(429, "OCR is busy. Try again shortly."));
    if (Date.now() < this.cooldown) return Promise.reject(new OcrError(503, "OCR worker unavailable. Paste text or try again later."));
    return new Promise((resolveJob, reject) => {
      const job: Job = { imageBase64, signal, resolve: resolveJob, reject, dispose: () => signal.removeEventListener("abort", cancel) };
      const cancel = () => {
        if (this.active === job) this.reset(new OcrError(499, "OCR cancelled."), false);
        else { this.queue = this.queue.filter(j => j !== job); this.finish(job, new OcrError(499, "OCR cancelled.")); }
      };
      signal.addEventListener("abort", cancel, { once: true });
      // Total bound includes initialization and queue time.
      job.timer = setTimeout(() => {
        if (this.active === job) this.reset(new OcrError(504, "OCR timed out. Try a smaller image or paste text."), true);
        else { this.queue = this.queue.filter(j => j !== job); this.finish(job, new OcrError(504, "OCR queue timed out. Try again.")); }
      }, 180_000);
      this.queue.push(job);
      this.start();
      this.pump();
    });
  }
  private start() {
    if (this.child) return;
    const child = this.createChild();
    this.child = child;
    this.startup = setTimeout(() => this.reset(new OcrError(503, "OCR worker did not become ready. Paste text or try later."), true), 120_000);
    // Never copy dependency diagnostics, image bytes or model results to application logs.
    child.stderr.resume();
    child.on("error", () => { if (this.child === child) this.reset(new OcrError(503, "OCR worker unavailable. Ask the operator to provision English model weights."), true); });
    child.on("exit", () => { if (this.child === child) this.reset(new OcrError(503, "OCR worker unavailable. Paste text or try later."), true); });
    child.stdin.on("error", () => { if (this.child === child) this.reset(new OcrError(503, "OCR worker disconnected."), true); });
    child.stdout.on("data", (data: Buffer) => {
      if (this.child !== child) return;
      this.buffer += data.toString();
      if (this.buffer.length > 100_000) { this.reset(new OcrError(503, "OCR response limit exceeded."), true); return; }
      let end: number;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        try {
          const result = JSON.parse(line);
          if (!this.ready) {
            if (result.ready !== true || result.model !== "english_g2" || result.device !== "cpu") throw new Error();
            this.ready = true; clearTimeout(this.startup); this.pump();
          } else {
            const job = this.active; this.active = null;
            if (job) this.finish(job, result.error ? new OcrError(422, "Image is invalid, too large, or could not be decoded. Use PNG/JPEG up to 4 million pixels and 4,000 pixels per side.") : undefined, result);
            this.pump();
          }
        } catch { this.reset(new OcrError(503, "English OCR model unavailable or invalid."), true); return; }
      }
    });
  }
  private pump() {
    if (!this.ready || this.active || !this.child) return;
    const job = this.queue.shift(); if (!job) return;
    this.active = job;
    clearTimeout(job.timer);
    job.timer = setTimeout(() => this.reset(new OcrError(504, "OCR timed out after 60 seconds. Paste text or try a clearer image."), true), 60_000);
    this.child.stdin.write(JSON.stringify({ imageBase64: job.imageBase64 }) + "\n");
    job.imageBase64 = "";
  }
  private finish(job: Job, error?: Error, result?: Result) {
    clearTimeout(job.timer); job.dispose(); job.imageBase64 = "";
    if (error) job.reject(error); else job.resolve(result!);
  }
  private reset(error: OcrError, cooldown: boolean) {
    const child = this.child; this.child = null; this.ready = false; this.buffer = "";
    clearTimeout(this.startup); child?.kill("SIGKILL");
    if (cooldown) this.cooldown = Date.now() + 10_000;
    if (this.active) this.finish(this.active, error);
    this.active = null;
    // Cancellation of the active worker invalidates its pipe, not unrelated queued requests.
    if (cooldown) { for (const job of this.queue.splice(0)) this.finish(job, error); }
    else if (this.queue.length) this.start();
  }
}
export const ocrWorker = new OcrWorker();
