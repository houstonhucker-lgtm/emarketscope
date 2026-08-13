// Claude client wrapper for the weekly search+judge call. One call does
// searching, relevance judgment against the scope profile, and structured
// extraction in a single pass — see pipeline/prompts/search.md for why
// this is one LLM call rather than separate search/judge calls (keeps
// runs within the spec's $5-15/month estimate).

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import type { CandidateItem, KnownSource, ScopeProfile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEARCH_PROMPT = readFileSync(join(__dirname, "..", "prompts", "search.md"), "utf-8");

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const MODEL = "claude-opus-5";
// Effort/search-count knobs are env-overridable so cost can be tuned without
// a code change once real usage data comes in (see spec's review checkpoint).
const EFFORT = (process.env.CLAUDE_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";
const MAX_WEB_SEARCHES = Number(process.env.CLAUDE_MAX_WEB_SEARCHES ?? 20);
const MAX_TOKENS = 16000;
const MAX_RESUMES = 3; // guards against runaway pause_turn loops

const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          pillar: { type: "string", enum: ["ux_feature", "signature_event", "calendar"] },
          retailers: {
            type: "array",
            items: { type: "string", enum: ["walmart", "amazon", "target"] },
          },
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "household_essentials",
                "health",
                "beauty",
                "personal_care",
                "baby_care",
              ],
            },
          },
          source_url: { type: "string" },
          source_name: { type: "string" },
          source_published_at: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          relevance_reason: { type: "string" },
          event_date: { type: "string" },
          event_date_end: { type: "string" },
        },
        required: ["title", "summary", "pillar", "retailers", "categories", "source_url", "relevance_reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

function buildDynamicContext(
  scopeProfile: ScopeProfile,
  knownSources: KnownSource[],
  weekOf: string,
): string {
  const sourceLines = knownSources
    .map((s) => `- ${s.name} (${s.source_type ?? "other"})${s.url ? `: ${s.url}` : ""}`)
    .join("\n");

  return [
    "## Current scope profile",
    "```json",
    JSON.stringify(scopeProfile, null, 2),
    "```",
    "",
    "## Known sources to check directly this run",
    sourceLines || "(none yet — rely on the standing broad search)",
    "",
    "## This run",
    `week_of: ${weekOf}`,
    `today: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");
}

export async function searchAndJudge(
  scopeProfile: ScopeProfile,
  knownSources: KnownSource[],
  weekOf: string,
): Promise<CandidateItem[]> {
  const dynamicContext = buildDynamicContext(scopeProfile, knownSources, weekOf);

  const baseParams = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" as const },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema" as const, schema: ITEMS_SCHEMA },
    },
    system: [
      { type: "text" as const, text: SEARCH_PROMPT, cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: dynamicContext },
    ],
    tools: [
      { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: MAX_WEB_SEARCHES },
    ],
  };

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Run this week's search and judgment pass now." },
  ];

  let response = await client.messages.stream({ ...baseParams, messages }).finalMessage();

  let resumes = 0;
  while (response.stop_reason === "pause_turn" && resumes < MAX_RESUMES) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await client.messages.stream({ ...baseParams, messages }).finalMessage();
    resumes++;
  }

  if (response.stop_reason === "refusal") {
    console.warn(
      `Claude declined the weekly search request (category: ${response.stop_details?.category ?? "unknown"}). Treating as zero items found this run.`,
    );
    return [];
  }

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("");
  if (!text.trim()) {
    console.warn("No text content in Claude's response — treating as zero items found.");
    return [];
  }

  let parsed: { items: CandidateItem[] };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse structured output as JSON: ${(err as Error).message}\nRaw text: ${text.slice(0, 2000)}`);
  }

  return parsed.items ?? [];
}
