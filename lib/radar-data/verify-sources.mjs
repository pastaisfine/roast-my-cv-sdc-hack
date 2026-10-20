/**
 * Optional online drift check. Node 20+; no packages or credentials.
 * Hash mismatch is an explicit failure requiring review, never silent refresh.
 * Does not download, store, or transmit any CV information.
 */
import { createHash } from "node:crypto";

const sources = [
  ["Q1 workbook", "https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=19819", "cbff5d0a62df0a92a6f018d93ba83a5e9b1727e6ec21ecd6b2f33f6ab5ddbb7f"],
  ["Q2 workbook", "https://www.dosm.gov.my/portal-main/release-document-log?release_document_id=20742", "965f2f20bcb33425eb43eac7f9edfcff186e7fa92048b8b26f8ee8bbe5d25764"],
  ["MASCO 2020 English", "https://emasco.mohr.gov.my/system-api/storage/uploads/masco_2020_en.pdf", "4ab3736cd6890afcad3ab2d5a87499e66c468f749cc6ed4ea96b22a20c2fc97e"],
];

for (const [title, url, expected] of sources) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${title}: HTTP ${response.status}; source was not verified`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`${title}: source bytes changed (${actual}); manually review and create a new data version`);
  console.info(`${title}: matches reviewed source bytes (${bytes.length} bytes)`);
}
