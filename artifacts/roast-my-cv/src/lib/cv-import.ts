// The supported legacy build supplies Map/Promise polyfills needed by preview
// browsers; the matching worker must come from the same build and version.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractCvImage, ApiError } from "@workspace/api-client-react";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export const IMPORT_LIMITS = { bytes: 10 * 1024 * 1024, chars: 12000, pages: 10, pixels: 4_000_000, side: 4000, totalPixels: 20_000_000 };
export type ImportResult = { text: string; warnings: string[]; source: string; sent: number; pages: number };
type Callbacks = {
  signal: AbortSignal;
  consent: (pages: number) => Promise<boolean>;
  progress: (message: string) => void;
  sent: (count: number) => void;
};
export const usableText = (text: string) => (text.match(/[a-zA-Z0-9]/g)?.length ?? 0) >= 40;
export function combinePages(pages: string[], warnings: string[]) {
  const text = pages.join("\n\n").trim();
  if (text.length > IMPORT_LIMITS.chars) warnings.push("Imported text trimmed to 12,000 characters.");
  if (!usableText(text)) warnings.push("Very little readable text found. Check the image quality or paste your CV.");
  return text.slice(0, IMPORT_LIMITS.chars);
}
function check(signal: AbortSignal) { signal.throwIfAborted(); }
async function askConsent(cb: Callbacks, pages: number) {
  check(cb.signal);
  return new Promise<boolean>((resolve, reject) => {
    const abort = () => reject(cb.signal.reason ?? new DOMException("Import cancelled", "AbortError"));
    cb.signal.addEventListener("abort", abort, { once: true });
    cb.consent(pages).then(resolve, reject).finally(() => cb.signal.removeEventListener("abort", abort));
  });
}
async function encoded(blob: Blob, signal: AbortSignal) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  check(signal);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
async function ocr(blob: Blob, cb: Callbacks) {
  const imageBase64 = await encoded(blob, cb.signal);
  check(cb.signal);
  // Count attempts, not only successful responses: failure does not imply no upload.
  cb.sent(1);
  try {
    return await extractCvImage({ imageBase64, ocrConsent: true }, {
      signal: AbortSignal.any([cb.signal, AbortSignal.timeout(190_000)]), cache: "no-store", headers: { "X-OCR-Consent": "server-image-processing" },
    });
  } catch (error) {
    if (cb.signal.aborted) throw error;
    const message = error instanceof DOMException && error.name === "TimeoutError" ? "OCR connection timed out. Try again or paste text." : error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data ? String(error.data.error) : "OCR could not connect. Your existing editor text is unchanged.";
    throw new Error(message);
  }
}
function checkDimensions(width: number, height: number) {
  if (width * height > IMPORT_LIMITS.pixels || Math.max(width, height) > IMPORT_LIMITS.side || Math.min(width, height) < 32) {
    throw new Error("Images must be 32–4,000 pixels per side and no more than 4 million pixels. Resize the image and try again.");
  }
}
/** Inspect raster dimensions from headers before the browser performs expensive decoding. */
export async function rasterDimensions(file: Blob) {
  const bytes = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b) && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 255) break;
      const marker = bytes[i++];
      if (marker === 255) { i--; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
      const size = view.getUint16(i);
      if (size < 2) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: view.getUint16(i + 3), width: view.getUint16(i + 5) };
      i += size;
    }
  }
  throw new Error("Choose a valid PNG or JPEG image, or a PDF. Image headers must fit within 128 KB.");
}
/** Render one PDF page for an in-browser preview. This path never invokes OCR or uploads page data. */
export async function renderPdfPagePreview(file: Blob, pageNumber: number, signal: AbortSignal): Promise<Blob> {
  check(signal);
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
  const cancel = () => { void task.destroy(); };
  signal.addEventListener("abort", cancel, { once: true });
  let page: Awaited<ReturnType<Awaited<typeof task.promise>["getPage"]>> | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const doc = await task.promise;
    check(signal);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) throw new Error("Choose a valid PDF page to preview.");
    page = await doc.getPage(pageNumber);
    const source = page.getViewport({ scale: 1 });
    const scale = Math.min(1, 1200 / source.width, 1600 / source.height, Math.sqrt(2_000_000 / (source.width * source.height)));
    const viewport = page.getViewport({ scale });
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const render = page.render({ canvas, viewport });
    const abortRender = () => render.cancel();
    signal.addEventListener("abort", abortRender, { once: true });
    try {
      await render.promise;
      check(signal);
      const blob = await new Promise<Blob>((resolve, reject) => canvas?.toBlob(image => image ? resolve(image) : reject(new Error("PDF page preview could not be rendered.")), "image/jpeg", 0.88));
      check(signal);
      return blob;
    } finally {
      signal.removeEventListener("abort", abortRender);
    }
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    page?.cleanup();
    signal.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
export async function importCv(file: File, cb: Callbacks): Promise<ImportResult> {
  if (file.size > IMPORT_LIMITS.bytes) throw new Error("Choose a file up to 10 MB.");
  check(cb.signal);
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  const warnings: string[] = [];
  if (head !== "%PDF-") {
    const { width, height } = await rasterDimensions(file);
    checkDimensions(width, height);
    check(cb.signal);
    if (!await askConsent(cb, 1)) throw new DOMException("Import cancelled", "AbortError");
    check(cb.signal);
    cb.progress("Reading image with English CPU OCR… You can cancel.");
    const result = await ocr(file, cb);
    return { text: combinePages([result.text], warnings), warnings: [...warnings, ...result.warnings], source: "Image OCR · app-owned CPU · english_g2", sent: 1, pages: 1 };
  }
  cb.progress("Inspecting PDF locally. Nothing uploaded…");
  const lifetime = new AbortController();
  cb = { ...cb, signal: AbortSignal.any([cb.signal, lifetime.signal]) };
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
  const cancel = () => { void task.destroy(); };
  cb.signal.addEventListener("abort", cancel, { once: true });
  // Bound local parsing/rendering too, not only remote requests.
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; lifetime.abort(); }, 600_000);
  try {
    check(cb.signal);
    const doc = await task.promise;
    if (doc.numPages > IMPORT_LIMITS.pages) throw new Error("PDFs are limited to 10 pages. Export only the CV pages and try again.");
    const pages: string[] = [];
    const scans: { number: number; scale: number }[] = [];
    let pixels = 0;
    for (let number = 1; number <= doc.numPages; number++) {
      check(cb.signal);
      cb.progress(`Inspecting PDF page ${number} of ${doc.numPages} locally…`);
      const page = await doc.getPage(number);
      try {
        const content = await page.getTextContent();
        if (content.items.length > 20000) throw new Error("PDF page has too many text items. Export a simpler CV.");
        const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
        pages.push(text.slice(0, 12000));
        if (!usableText(text)) {
          const viewport = page.getViewport({ scale: 1 });
          if (Math.max(viewport.width, viewport.height) > 4000 || viewport.width * viewport.height > 4_000_000) throw new Error("PDF page dimensions exceed the safe rendering limit.");
          const scale = Math.min(2, Math.sqrt(IMPORT_LIMITS.pixels / (Math.ceil(viewport.width) * Math.ceil(viewport.height))), 4000 / Math.max(viewport.width, viewport.height));
          pixels += Math.floor(viewport.width * scale) * Math.floor(viewport.height * scale);
          if (pixels > IMPORT_LIMITS.totalPixels) throw new Error("PDF scans exceed the total 20-million-pixel rendering limit. Import fewer pages.");
          scans.push({ number, scale });
        }
      } finally { page.cleanup(); }
    }
    if (scans.length) {
      if (!await askConsent(cb, scans.length)) throw new DOMException("Import cancelled", "AbortError");
      for (let i = 0; i < scans.length; i++) {
        check(cb.signal);
        const scan = scans[i];
        cb.progress(`OCR page ${i + 1} of ${scans.length} (PDF page ${scan.number})…`);
        const page = await doc.getPage(scan.number);
        const canvas = document.createElement("canvas");
        const viewport = page.getViewport({ scale: scan.scale });
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        const render = page.render({ canvas, viewport });
        const abortRender = () => render.cancel();
        cb.signal.addEventListener("abort", abortRender, { once: true });
        try {
          await render.promise;
          check(cb.signal);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("PDF page could not be rendered.")), "image/jpeg", 0.9));
          const result = await ocr(blob, cb);
          pages[scan.number - 1] = result.text;
          warnings.push(...result.warnings.map(w => `Page ${scan.number}: ${w}`));
        } catch (error) {
          if (cb.signal.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
          warnings.push(`Page ${scan.number}: ${error instanceof Error ? error.message : "OCR failed."} Selectable text from this page, if any, was kept.`);
        } finally {
          cb.signal.removeEventListener("abort", abortRender);
          canvas.width = 0; canvas.height = 0; page.cleanup();
        }
      }
    }
    check(cb.signal);
    return { text: combinePages(pages, warnings), warnings, source: scans.length ? `PDF · local selectable text + ${scans.length} image page(s) attempted with CPU OCR` : "PDF selectable text · browser only · no upload", sent: scans.length, pages: doc.numPages };
  } catch (error) {
    if (timedOut) throw new Error("PDF import timed out after 10 minutes. Existing editor text was kept. Import fewer pages or paste text.");
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is encrypted. Export an unprotected copy and try again.");
    if (error instanceof Error && ["InvalidPDFException", "UnknownErrorException"].includes(error.name)) throw new Error("This PDF is corrupt or could not be read. Export a new PDF or paste text.");
    throw error;
  } finally {
    clearTimeout(deadline);
    cb.signal.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
