import { test } from "node:test";
import assert from "node:assert/strict";
import { importCv, combinePages, rasterDimensions } from "./cv-import";
import { calls, reset, setDimensions, setFailure, setRemoteFailure } from "./cv-import.test-stubs";

const first = "FIRST synthetic graduate CV with Python SQL Excel projects and business analytics.";
const last = "LAST synthetic CV education and SQL reporting projects at a fictional university.";
const pdf = () => new File(["%PDF-synthetic"], "synthetic.pdf");
const raster = (width = 1000, height = 560) => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return new File([bytes], "synthetic.png");
};
const jpegHeader = () => {
  const bytes = new Uint8Array(32);
  bytes.set([255, 216, 255, 192, 0, 17, 8, 2, 48, 3, 232]);
  return new File([bytes], "synthetic.jpg", { type: "image/jpeg" });
};
function callbacks(allow = true, signal = new AbortController().signal) {
  const state = { consent: 0, sent: 0 };
  return { state, cb: { signal, consent: async (pages: number) => { state.consent += pages; return allow; }, progress() {}, sent(count: number) { state.sent += count; } } };
}
// Only tests get this minimal canvas. Actual PDF.js rendering is browser-verified.
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, toBlob: (cb: (blob: Blob) => void) => cb(new Blob(["synthetic jpeg"])) }) } });

test("ordinary selectable PDFs stay local, preserve line breaks, and release document", async () => {
  reset([first, last]);
  const { cb, state } = callbacks();
  const result = await importCv(pdf(), cb);
  assert.ok(result.text.startsWith(first));
  assert.ok(result.text.includes("\n\n"));
  assert.equal(state.consent, 0); assert.equal(calls.ocr, 0); assert.equal(calls.render, 0);
  assert.equal(result.sent, 0); assert.equal(calls.destroy, 1);
});
test("mixed PDFs OCR only unusable pages and retain original page order without duplicates", async () => {
  reset([first, "", last]);
  const { cb, state } = callbacks();
  const result = await importCv(pdf(), cb);
  assert.equal(state.consent, 1); assert.equal(calls.ocr, 1); assert.equal(calls.render, 1);
  assert.equal(result.text, `${first}\n\nMIDDLE OCR synthetic page Python SQL Excel\n\n${last}`);
});
test("scanned PDFs and PNG/JPEG images never upload before OCR-specific consent", async () => {
  for (const file of [pdf(), raster(), jpegHeader()]) {
    reset([""]);
    const { cb, state } = callbacks(false);
    await assert.rejects(importCv(file, cb), { name: "AbortError" });
    assert.equal(calls.ocr, 0); assert.equal(calls.render, 0); assert.equal(state.sent, 0);
  }
  reset();
  const { cb, state } = callbacks();
  const result = await importCv(raster(), cb);
  assert.ok(result.text.includes("Python SQL"));
  assert.equal(state.consent, 1); assert.equal(state.sent, 1);
  assert.deepEqual(await rasterDimensions(jpegHeader()), { width: 1000, height: 560 });
});
test("page, byte, pixel and unsupported-file limits reject before consent/upload", async () => {
  const { cb, state } = callbacks();
  reset(Array(11).fill(first));
  await assert.rejects(importCv(pdf(), cb), /10 pages/);
  reset(Array(6).fill("")); setDimensions(1000, 1000);
  await assert.rejects(importCv(pdf(), cb), /20-million-pixel/);
  for (const file of [raster(4001, 40), raster(2100, 2100), new File(["unsupported"], "fake.png"), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.pdf")]) {
    await assert.rejects(importCv(file, cb));
  }
  assert.equal(state.consent, 0); assert.equal(calls.ocr, 0);
  assert.deepEqual(await rasterDimensions(raster()), { width: 1000, height: 560 });
});
test("encrypted/corrupt PDFs have safe, actionable errors and cleanup", async () => {
  for (const [name, pattern] of [["PasswordException", /encrypted/], ["InvalidPDFException", /corrupt/]] as const) {
    reset(); setFailure(name);
    await assert.rejects(importCv(pdf(), callbacks().cb), pattern);
    assert.equal(calls.destroy, 1); assert.equal(calls.ocr, 0);
  }
});
test("OCR failure retains available mixed-page text and exposes partial-result warning", async () => {
  reset([first, "", last]); setRemoteFailure();
  const result = await importCv(pdf(), callbacks().cb);
  assert.equal(result.text, `${first}\n\n\n\n${last}`);
  assert.ok(result.warnings.some(w => w.includes("Page 2")));
  assert.equal(calls.destroy, 1);
});
test("cancelling while waiting for consent cannot render or upload", async () => {
  reset([""]);
  const controller = new AbortController();
  const { cb } = callbacks(true, controller.signal);
  cb.consent = () => new Promise(() => {});
  const pending = importCv(pdf(), cb);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await rejected;
  assert.equal(calls.ocr, 0); assert.equal(calls.render, 0); assert.ok(calls.destroy >= 1);
});
test("empty and truncated output have explicit warnings", () => {
  const warnings: string[] = [];
  assert.equal(combinePages([""], warnings), "");
  assert.ok(warnings.length);
  const longWarnings: string[] = [];
  assert.equal(combinePages(["a".repeat(13000)], longWarnings).length, 12000);
  assert.ok(longWarnings.some(w => w.includes("trimmed")));
});
