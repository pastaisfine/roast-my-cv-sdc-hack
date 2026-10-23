import type { RoastObject } from "@workspace/api-zod";
import { GeminiError, generateJson, getGeminiConfig, type GeminiFailureKind } from "./client";
import { ROAST_SCHEMA, ROAST_SYSTEM, roastPrompt } from "./prompts";
import { templateRoast } from "./template-roast";
import type { RoastContext } from "./types";

export type RoastGeneration = {
  roast: RoastObject;
  source: "llm" | "template" | "static";
  failure: GeminiFailureKind | "no-config" | null;
};

type RoastPayload = {
  summary?: unknown;
  hardTruths?: unknown;
  actionItems?: unknown;
};

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim().replace(/^[-*•]\s*/, "");
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeList(value: unknown, min: number, max: number, fallback: string[]): string[] {
  const cleaned = unique(
    (Array.isArray(value) ? value : []).map((item) => clean(item, 300)).filter(Boolean),
  ).slice(0, max);
  if (cleaned.length >= min) return cleaned;
  const merged = unique([...cleaned, ...fallback]).slice(0, max);
  while (merged.length < min) {
    merged.push("Add one quantified project that shows the skill in use and the result it produced.");
  }
  return merged;
}

function fallbackRoast(
  context: RoastContext,
  template: { summary: string; hardTruths: string[]; actionItems: string[] },
  source: "template" | "static",
  failure: GeminiFailureKind | "no-config" | null,
): RoastGeneration {
  return {
    roast: {
      summary: template.summary,
      hardTruths: template.hardTruths.slice(0, 5),
      skillsGap: {
        missing: context.missing.slice(0, 12),
        weak: context.weak.slice(0, 12),
      },
      actionItems: template.actionItems.slice(0, 5),
      score: context.score,
      persona: "brutal-honesty",
      fallback: true,
      source,
    },
    source,
    failure,
  };
}

/**
 * Generate the narrative half of the roast. Score, skills gap and persona stay
 * deterministic and server-owned; the model only writes prose that is checked
 * against the response contract.
 */
export async function generateRoast(
  context: RoastContext,
  signal?: AbortSignal,
  transport?: typeof fetch,
): Promise<RoastGeneration> {
  const template = templateRoast(context);
  const config = getGeminiConfig();
  if (!config) return fallbackRoast(context, template, "template", "no-config");

  try {
    const payload = await generateJson<RoastPayload>(
      config,
      ROAST_SYSTEM,
      roastPrompt(context),
      ROAST_SCHEMA,
      { signal, transport, maxOutputTokens: 2_048 },
    );
    const summary = clean(payload.summary, 500);
    if (!summary) throw new GeminiError("invalid-response");
    return {
      roast: {
        summary,
        hardTruths: normalizeList(payload.hardTruths, 3, 5, template.hardTruths),
        skillsGap: {
          missing: context.missing.slice(0, 12),
          weak: context.weak.slice(0, 12),
        },
        actionItems: normalizeList(payload.actionItems, 3, 5, template.actionItems),
        score: context.score,
        persona: "brutal-honesty",
        fallback: false,
        source: "llm",
      },
      source: "llm",
      failure: null,
    };
  } catch (error) {
    return fallbackRoast(
      context,
      template,
      "template",
      error instanceof GeminiError ? error.kind : "invalid-response",
    );
  }
}
