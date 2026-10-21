import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import app from "../app";
import { OcrWorker, ocrWorker } from "./ocr";

function fakeWorker() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    killed: false, kill() { this.killed = true; return true; },
  });
  return child;
}
const result = { text: "Synthetic output", warnings: [], model: "english_g2", device: "cpu" };
const ready = (child: ReturnType<typeof fakeWorker>) => child.stdout.write(JSON.stringify({ ready: true, model: "english_g2", device: "cpu" }) + "\n");

test("reuses one English CPU worker; bounds queue; cancellation releases memory and pipe", async () => {
  const children: ReturnType<typeof fakeWorker>[] = [];
  const worker = new OcrWorker(() => { const child = fakeWorker(); children.push(child); return child as unknown as ChildProcessWithoutNullStreams; });
  const a = new AbortController(), b = new AbortController(), c = new AbortController();
  const first = worker.extract("fixture", a.signal);
  const second = worker.extract("fixture", b.signal);
  const third = worker.extract("fixture", c.signal);
  await assert.rejects(worker.extract("fixture", new AbortController().signal), { status: 429 });
  assert.equal(children.length, 1);
  ready(children[0]);
  children[0].stdout.write(JSON.stringify(result) + "\n");
  assert.equal((await first).text, result.text);
  assert.equal(children.length, 1);
  const thirdRejected = assert.rejects(third, { status: 499 });
  c.abort(); await thirdRejected;
  const secondRejected = assert.rejects(second, { status: 499 });
  b.abort(); await secondRejected;
  assert.equal(children[0].killed, true);
  assert.equal(worker.pending, 0);
});
test("cancel active request restarts queued request without stale result", async () => {
  const children: ReturnType<typeof fakeWorker>[] = [];
  const worker = new OcrWorker(() => { const child = fakeWorker(); children.push(child); return child as unknown as ChildProcessWithoutNullStreams; });
  const a = new AbortController(), b = new AbortController();
  const one = worker.extract("a", a.signal), two = worker.extract("b", b.signal);
  ready(children[0]);
  const rejected = assert.rejects(one, { status: 499 });
  a.abort(); await rejected;
  children[0].stdout.write(JSON.stringify({ ...result, text: "stale" }) + "\n");
  ready(children[1]);
  children[1].stdout.write(JSON.stringify(result) + "\n");
  assert.equal((await two).text, result.text);
  children[1].emit("exit");
});
test("unavailable worker and wrong model fail closed without fallback", async () => {
  for (const event of ["error", "wrong-model"]) {
    const child = fakeWorker();
    const worker = new OcrWorker(() => child as unknown as ChildProcessWithoutNullStreams);
    const request = worker.extract("fixture", new AbortController().signal);
    const rejected = assert.rejects(request, { status: 503 });
    if (event === "error") child.emit("error", new Error("Private diagnostic not exposed"));
    else child.stdout.write('{"ready":true,"model":"substituted","device":"cpu"}\n');
    await rejected;
    assert.equal(child.killed, true);
  }
});
test("startup and active processing have hard deadlines", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const active of [false, true]) {
    const child = fakeWorker();
    const worker = new OcrWorker(() => child as unknown as ChildProcessWithoutNullStreams);
    const request = worker.extract("fixture", new AbortController().signal);
    const rejected = assert.rejects(request, { status: active ? 504 : 503 });
    if (active) ready(child);
    t.mock.timers.tick(active ? 60_001 : 120_001);
    await rejected;
    assert.equal(child.killed, true);
    assert.equal(worker.pending, 0);
  }
});
test("OCR HTTP contract: consent, real format, no-store, safe failure and bounds", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/api/ocr/image`;
  const original = ocrWorker.extract;
  const send = (body: unknown, consent = true) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(consent ? { "X-OCR-Consent": "server-image-processing" } : {}) }, body: JSON.stringify(body) });
  try {
    let called = 0;
    ocrWorker.extract = async () => { called++; return result as Awaited<ReturnType<typeof original>>; };
    const payload = { imageBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"), ocrConsent: true };
    assert.equal((await send(payload, false)).status, 400);
    assert.equal((await send({ ...payload, ocrConsent: false })).status, 400);
    assert.equal((await send({ ...payload, filename: "PRIVATE_FILENAME_SENTINEL" })).status, 400);
    assert.equal((await send({ ...payload, imageBase64: Buffer.from("CV_PRIVATE_SENTINEL").toString("base64") })).status, 415);
    assert.equal((await send({ ...payload, imageBase64: "not base64" })).status, 400);
    assert.equal(called, 0);
    const success = await send(payload);
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal((await success.json()).model, "english_g2");
    assert.equal(called, 1);
    ocrWorker.extract = async () => { throw new Error("CV_PRIVATE_SENTINEL"); };
    const failure = await send(payload);
    assert.equal(failure.status, 503);
    assert.ok(!(await failure.text()).includes("CV_PRIVATE_SENTINEL"));
    assert.equal((await send({ ...payload, imageBase64: "A".repeat(14 * 1024 * 1024 + 1) })).status, 413);
    let limited = false;
    for (let i = 0; i < 25; i++) if ((await send(payload)).status === 429) limited = true;
    assert.ok(limited);
  } finally { ocrWorker.extract = original; await new Promise<void>(resolve => server.close(() => resolve())); }
});
