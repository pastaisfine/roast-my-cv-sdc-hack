/** Deterministic adapters for the import regression runner, never used by the app. */
export const GlobalWorkerOptions = { workerSrc: "" };
export let pages: string[] = [];
export let failure = "";
export let width = 612;
export let height = 792;
export let remoteFailure = false;
export const calls = { ocr: 0, render: 0, destroy: 0 };
export function reset(texts: string[] = []) {
  pages = texts; failure = ""; width = 612; height = 792; remoteFailure = false;
  calls.ocr = calls.render = calls.destroy = 0;
}
export function setFailure(value: string) { failure = value; }
export function setDimensions(w: number, h: number) { width = w; height = h; }
export function setRemoteFailure() { remoteFailure = true; }
export function getDocument() {
  return {
    promise: failure ? Promise.reject(Object.assign(new Error("Synthetic failure"), { name: failure })) : Promise.resolve({
      numPages: pages.length,
      getPage: async (number: number) => ({
        getTextContent: async () => ({ items: [{ str: pages[number - 1], hasEOL: true }] }),
        getViewport: ({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale }),
        render: () => { calls.render++; return { promise: Promise.resolve(), cancel() {} }; },
        cleanup() {},
      }),
    }),
    destroy: async () => { calls.destroy++; },
  };
}
export class ApiError extends Error { data: unknown; }
export async function extractCvImage(_input: unknown, options: RequestInit) {
  calls.ocr++;
  if (remoteFailure) throw new Error("Synthetic remote failure");
  options.signal?.throwIfAborted();
  return { text: "MIDDLE OCR synthetic page Python SQL Excel", warnings: [], model: "english_g2", device: "cpu" };
}
