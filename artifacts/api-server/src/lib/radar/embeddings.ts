import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { roles, skills, version } from "@workspace/radar-data";

export const MODEL = "intfloat/multilingual-e5-small";
export const MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
export const DIMENSIONS = 384;
export const THRESHOLD = 0.87; // Provisional safety gate, not measured accuracy.
export const MARGIN = 0.04;
export const WORKER = "runpod/worker-infinity-embedding:1.1.4";
export type EmbeddingConfig = { endpoint: string; key: string; revision: string };

export function getEmbeddingConfig(): EmbeddingConfig | null {
  if (process.env.RADAR_RUNPOD_APPROVED !== "true") return null;
  const endpoint = process.env.RUNPOD_ENDPOINT_ID;
  const key = process.env.RUNPOD_API_KEY;
  const revision = process.env.RADAR_MODEL_REVISION;
  if (!endpoint || !/^[a-zA-Z0-9_-]{5,80}$/.test(endpoint) || !key || revision !== MODEL_REVISION) return null;
  return { endpoint, key, revision };
}

export function validateVectors(payload: unknown, count: number): number[][] {
  if (!payload || typeof payload !== "object") throw new Error("invalid-vectors");
  const p = payload as { model?: unknown; data?: unknown };
  if (p.model !== MODEL || !Array.isArray(p.data) || p.data.length !== count) throw new Error("invalid-vectors");
  const result: number[][] = new Array(count);
  for (const row of p.data) {
    if (!row || !Number.isInteger(row.index) || row.index < 0 || row.index >= count || result[row.index]) throw new Error("invalid-vectors");
    const v = row.embedding;
    if (!Array.isArray(v) || v.length !== DIMENSIONS || !v.every(x => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e6)) throw new Error("invalid-vectors");
    const norm = Math.hypot(...v);
    if (!Number.isFinite(norm) || norm < 1e-12) throw new Error("invalid-vectors");
    result[row.index] = v.map(x => x / norm);
  }
  return result;
}

export async function embed(inputs: string[], config: EmbeddingConfig, signal: AbortSignal, transport: typeof fetch = fetch): Promise<number[][]> {
  if (!inputs.length || inputs.length > 96 || inputs.some(t => t.length > 1000) || inputs.join("").length > 48000) throw new Error("input-limit");
  const response = await transport(`https://api.runpod.ai/v2/${config.endpoint}/openai/v1/embeddings`, {
    method: "POST", signal, redirect: "error",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });
  if (!response.ok) throw new Error("provider-unavailable"); // Never include provider body or CV.
  // A bounded reader prevents malformed/upstream responses consuming unbounded memory.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid-vectors");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error("response-limit");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return validateVectors(JSON.parse(Buffer.concat(chunks).toString("utf8")), inputs.length);
}

export function cosine(a: number[], b: number[]) {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

// Only these fixed public texts can enter the persistent embedding cache.
export const publicTexts = [
  ...skills.map(s => `passage: ${s.label}; ${s.aliases.join("; ")}`),
  ...roles.map(r => `passage: ${r.title}; ${r.skillIds.map(id => skills.find(s => s.id === id)?.label ?? id).join("; ")}`),
];
let memory: { key: string; vectors: number[][] } | undefined;
export async function catalogueVectors(config: EmbeddingConfig, signal: AbortSignal): Promise<number[][]> {
  const key = `embeddings:${version}:${MODEL}:${config.revision}:${WORKER}:${createHash("sha256").update(JSON.stringify(publicTexts)).digest("hex")}`;
  if (memory?.key === key) return memory.vectors;
  const { db, radarPublicCache } = await import("@workspace/db");
  const cached = await db.select().from(radarPublicCache).where(eq(radarPublicCache.key, key)).limit(1);
  if (signal.aborted) throw new Error("aborted");
  if (cached[0]) {
    const vectors = validateVectors(cached[0].payload, publicTexts.length);
    memory = { key, vectors };
    return vectors;
  }
  const vectors: number[][] = [];
  for (let i = 0; i < publicTexts.length; i += 32) {
    vectors.push(...await embed(publicTexts.slice(i, i + 32), config, signal));
  }
  if (signal.aborted) throw new Error("aborted");
  await db.insert(radarPublicCache).values({
    key, payload: { model: MODEL, data: vectors.map((embedding, index) => ({ index, embedding })) },
  }).onConflictDoNothing();
  memory = { key, vectors };
  return vectors;
}
