import { test } from "node:test";
import assert from "node:assert/strict";
import { OcrWorker } from "./ocr";
import { OcrError, runpodExtract, remoteInflight } from "./ocr-runpod";

const result = { text: "Synthetic output", warnings: [], model: "english_g2", device: "cpu" };
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Point the transport at a fake endpoint and fake endpoint auth for one test. */
function useEndpoint(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const saved = {
    fetch: globalThis.fetch,
    url: process.env.RUNPOD_OCR_URL,
    key: process.env.RUNPOD_API_KEY,
    poll: process.env.RUNPOD_OCR_POLL_MS,
  };
  process.env.RUNPOD_OCR_URL = "https://runpod.example/v2/test0endpoint";
  process.env.RUNPOD_API_KEY = "test-key";
  process.env.RUNPOD_OCR_POLL_MS = "1";
  globalThis.fetch = async (url: string | URL, init?: RequestInit) => handler(typeof url === "string" ? url : url.href, init);
  return () => {
    globalThis.fetch = saved.fetch;
    for (const key of ["RUNPOD_OCR_URL", "RUNPOD_API_KEY", "RUNPOD_OCR_POLL_MS"] as const) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key]!;
    }
  };
}

test("remote transport submits to runsync, sends the bearer token and maps the clean envelope", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const restore = useEndpoint(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ id: "job-1", status: "COMPLETED", output: result });
  });
  try {
    const worker = new OcrWorker();
    assert.equal(worker.pending, 0);
    const outcome = await worker.extract("fixture", new AbortController().signal);
    assert.equal(outcome.text, result.text);
    assert.equal(outcome.model, "english_g2");
    assert.match(calls[0]!.url, /\/v2\/test0endpoint\/runsync\?wait=/);
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(new Headers(calls[0]!.init?.headers).get("Authorization"), "Bearer test-key");
    assert.equal(new Headers(calls[0]!.init?.headers).get("Content-Type"), "application/json");
    assert.equal(worker.pending, 0);
    assert.equal(remoteInflight(), 0);
  } finally { restore(); }
});

test("the worker's error envelope maps to the same 422 the local pipe produces", async () => {
  const restore = useEndpoint(async () => jsonResponse({ id: "job-2", status: "COMPLETED", output: { error: "invalid_image" } }));
  try {
    await assert.rejects(
      runpodExtract("fixture", new AbortController().signal, process.env.RUNPOD_OCR_URL!),
      (error: unknown) => error instanceof OcrError && error.status === 422
        && error.message === "Image is invalid, too large, or could not be decoded. Use PNG/JPEG up to 4 million pixels and 4,000 pixels per side.",
    );
  } finally { restore(); }
});

test("a cold start that outlives the runSync hold falls back to status polling", async () => {
  const seen: string[] = [];
  const restore = useEndpoint(async (url, init) => {
    if (init?.method === "POST") return jsonResponse({ id: "job-3", status: "IN_QUEUE" });
    seen.push(url);
    assert.equal(new URL(url).pathname, "/v2/test0endpoint/status/job-3");
    return jsonResponse({ id: "job-3", status: "COMPLETED", output: result });
  });
  try {
    const outcome = await runpodExtract("fixture", new AbortController().signal, process.env.RUNPOD_OCR_URL!);
    assert.equal(outcome.text, result.text);
    assert.deepEqual(
      seen.map((href) => new URL(href).pathname),
      ["/v2/test0endpoint/status/job-3"],
    );
  } finally { restore(); }
});

test("missing credential and denied auth fail closed with operator guidance, never content", async () => {
  const restore = useEndpoint(async () => jsonResponse({ message: "Invalid token" }, 401));
  try {
    await assert.rejects(
      runpodExtract("fixture", new AbortController().signal, process.env.RUNPOD_OCR_URL!),
      { status: 503, message: "OCR worker unavailable. Paste text or try again later." },
    );
    delete process.env.RUNPOD_API_KEY;
    await assert.rejects(
      runpodExtract("fixture", new AbortController().signal, process.env.RUNPOD_OCR_URL!),
      (error: unknown) => error instanceof OcrError && error.status === 503
        && error.message === "OCR worker unavailable. Ask the operator to set the Runpod credential.",
    );
  } finally { restore(); }
});

test("caller abort releases the request and the inflight counter", async () => {
  const restore = useEndpoint((_url, init) => new Promise<Response>((_, reject) => {
    // A submit that never answers; the transport must drop it on caller abort.
    init?.signal?.addEventListener("abort", () => {
      const abort = new Error("The operation was aborted");
      abort.name = "AbortError";
      reject(abort);
    }, { once: true });
  }));
  try {
    const controller = new AbortController();
    const pendingRequest = runpodExtract("fixture", controller.signal, process.env.RUNPOD_OCR_URL!);
    const rejection = assert.rejects(pendingRequest, { status: 499 });
    controller.abort();
    await rejection;
    assert.equal(remoteInflight(), 0);
  } finally { restore(); }
});
