/**
 * Minimal Gemini Developer API client.
 *
 * The app deliberately does not use the legacy `@google/generative-ai` SDK:
 * `AQ.` authentication keys must be sent in the `x-goog-api-key` header, and a
 * direct fetch keeps the bundle small, lets us bound the response and lets us
 * account for tokens before the next call.
 */

export type GeminiFailureKind =
  | "disabled"
  | "capacity"
  | "rate-limited"
  | "auth"
  | "provider"
  | "timeout"
  | "invalid-response"
  | "blocked";

export class GeminiError extends Error {
  constructor(
    public readonly kind: GeminiFailureKind,
    public readonly status?: number,
  ) {
    super(kind);
    this.name = "GeminiError";
  }
}

/** The JSON Schema subset the Gemini structured-output endpoint accepts. */
export type GeminiSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
};

export type GeminiConfig = {
  apiKey: string;
  model: string;
  rpmLimit: number;
  dailyTokenLimit: number;
  maxConcurrent: number;
};

const STATE = {
  windowStart: 0,
  windowCalls: 0,
  day: "",
  tokens: 0,
  active: 0,
  cooldownUntil: 0,
};

const DEFAULT_MODEL = "gemini-3.6-flash";
const CALL_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2_000_000;

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/**
 * Configuration is all-or-nothing: a half-configured deployment (key without
 * model, or a disabled flag) must never make an outbound request.
 */
export function getGeminiConfig(): GeminiConfig | null {
  if (process.env.ROAST_ENABLED === "false") return null;
  const apiKey = process.env.GEMINI_API_KEY;
  // AI Studio now issues AQ. authentication keys; classic AIza keys also pass.
  if (!apiKey || !/^[A-Za-z0-9._-]{20,200}$/.test(apiKey)) return null;
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  if (!/^[a-z0-9][a-z0-9.-]{2,79}$/.test(model)) return null;
  return {
    apiKey,
    model,
    rpmLimit: boundedInt(process.env.ROAST_RPM_LIMIT, 5, 1, 1_000),
    dailyTokenLimit: boundedInt(process.env.ROAST_DAILY_TOKEN_LIMIT, 800_000, 10_000, 10_000_000),
    maxConcurrent: 2,
  };
}

/** Reserve a request slot. Returns a finisher that always runs. */
function beginCall(config: GeminiConfig): (tokens: number) => void {
  const now = Date.now();
  if (now - STATE.windowStart >= 60_000) {
    STATE.windowStart = now;
    STATE.windowCalls = 0;
  }
  const day = new Date(now).toISOString().slice(0, 10);
  if (STATE.day !== day) {
    STATE.day = day;
    STATE.tokens = 0;
  }
  if (STATE.active >= config.maxConcurrent) throw new GeminiError("capacity");
  if (STATE.windowCalls >= config.rpmLimit) throw new GeminiError("capacity");
  if (STATE.tokens >= config.dailyTokenLimit) throw new GeminiError("capacity");
  if (now < STATE.cooldownUntil) throw new GeminiError("capacity");
  STATE.windowCalls++;
  STATE.active++;
  return (tokens: number) => {
    STATE.active = Math.max(0, STATE.active - 1);
    STATE.tokens += Math.max(0, Math.round(tokens));
  };
}

async function readBounded(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new GeminiError("invalid-response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new GeminiError("invalid-response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GeminiError("invalid-response");
  }
}

type GenerationPayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

function parseGeneration(payload: unknown, inputChars: number): { data: unknown; tokens: number } {
  const body = payload as GenerationPayload | null;
  if (!body || typeof body !== "object") throw new GeminiError("invalid-response");
  if (body.promptFeedback?.blockReason) throw new GeminiError("blocked");
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) throw new GeminiError("invalid-response");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GeminiError("invalid-response");
  }
  const usage = body.usageMetadata;
  const tokens = usage?.totalTokenCount ??
    (usage?.promptTokenCount ?? Math.ceil(inputChars / 4)) +
    (usage?.candidatesTokenCount ?? Math.ceil(text.length / 4)) +
    (usage?.thoughtsTokenCount ?? 0);
  return { data, tokens };
}

async function requestOnce(
  config: GeminiConfig,
  system: string,
  user: string,
  schema: GeminiSchema,
  maxOutputTokens: number,
  signal: AbortSignal,
  transport: typeof fetch,
): Promise<{ data: unknown; tokens: number }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const response = await transport(endpoint, {
    method: "POST",
    signal,
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      // AQ. keys are rejected in the query string; the header is the supported path.
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        // Gemini 3.x structured output. The schema is plain JSON Schema here,
        // unlike the older responseMimeType/responseSchema pair.
        responseFormat: {
          text: {
            mimeType: "APPLICATION_JSON",
            schema,
          },
        },
        thinkingConfig: { thinkingLevel: "low" },
        maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    if (process.env.ROAST_DEBUG === "true" && process.env.NODE_ENV !== "production") {
      // Development-only diagnostics. Provider 400 bodies describe the request
      // shape, not the CV; never enable this in production.
      const detail = await response.text().catch(() => "");
      process.stderr.write(`[gemini-debug] ${response.status} ${detail.slice(0, 2_000)}\n`);
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    if (response.status === 429) {
      STATE.cooldownUntil = Date.now() + 60_000;
      throw new GeminiError("rate-limited", 429);
    }
    if (response.status === 401 || response.status === 403) {
      // An operator has to fix the credential; stop hammering it for five minutes.
      STATE.cooldownUntil = Date.now() + 300_000;
      throw new GeminiError("auth", response.status);
    }
    throw new GeminiError("provider", response.status);
  }
  return parseGeneration(await readBounded(response), system.length + user.length);
}

/**
 * Generate one JSON object against a strict schema.
 *
 * One retry is allowed for transient 5xx/network failures. Rate limits, auth
 * failures, blocks and malformed JSON are surfaced immediately so the caller
 * can use its deterministic fallback without paying for another call.
 */
export async function generateJson<T>(
  config: GeminiConfig,
  system: string,
  user: string,
  schema: GeminiSchema,
  options: {
    signal?: AbortSignal;
    maxOutputTokens?: number;
    transport?: typeof fetch;
  } = {},
): Promise<T> {
  const finish = beginCall(config);
  let tokens = 0;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const signal = AbortSignal.any([
        AbortSignal.timeout(CALL_TIMEOUT_MS),
        ...(options.signal ? [options.signal] : []),
      ]);
      try {
        const result = await requestOnce(
          config,
          system,
          user,
          schema,
          options.maxOutputTokens ?? 2_048,
          signal,
          options.transport ?? fetch,
        );
        tokens = result.tokens;
        return result.data as T;
      } catch (error) {
        if (error instanceof GeminiError) {
          // Retry only an upstream 5xx; everything else is definitive.
          if (error.kind === "provider" && error.status != null && error.status >= 500 && attempt === 0) continue;
          throw error;
        }
        // A timeout or caller abort is not transient: do not double the wait.
        if (signal.aborted || options.signal?.aborted) throw new GeminiError("timeout");
        if (attempt === 0) continue;
        throw new GeminiError("timeout");
      }
    }
    throw new GeminiError("provider");
  } finally {
    finish(tokens);
  }
}
