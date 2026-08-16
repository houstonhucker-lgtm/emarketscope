// Claude client wrapper for the search+judge calls. One call does
// searching, relevance judgment against the scope profile, and structured
// extraction in a single pass — combined for simplicity (one prompt to
// review/tune, one round trip), not for cost: billing is per-token, so
// splitting into separate search/judge calls would cost about the same.
// Shared by the weekly pipeline (prompts/search.md) and the backfill job
// (prompts/backfill.md) — same request/parse machinery, different prompt
// and dynamic context.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";
import type { CandidateItem, KnownSource, ScopeProfile } from "./types.js";

// Sonnet 5 list pricing (per MTok). Intro rate applies through 2026-08-31,
// per the Anthropic pricing page; standard rate applies after. Used only to
// produce a real cost estimate for a run — not billing-authoritative, check
// the Anthropic console for actual spend.
const SONNET_5_PRICING_INTRO_CUTOFF = new Date("2026-08-31T23:59:59Z");
const SONNET_5_PRICE_PER_MTOK = {
  input: 2.0,
  output: 10.0,
  intro: true,
} as const;
const SONNET_5_PRICE_PER_MTOK_STANDARD = { input: 3.0, output: 15.0 } as const;
const WEB_SEARCH_PRICE_PER_1000 = 10.0;

export interface RunUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  web_search_requests: number;
  api_calls: number;
  estimated_cost_usd: number;
  pricing_basis: "intro" | "standard";
}

export function emptyUsage(): RunUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    web_search_requests: 0,
    api_calls: 0,
    estimated_cost_usd: 0,
    pricing_basis: new Date() <= SONNET_5_PRICING_INTRO_CUTOFF ? "intro" : "standard",
  };
}

function addUsage(total: RunUsage, response: Anthropic.Message): void {
  total.input_tokens += response.usage.input_tokens;
  total.output_tokens += response.usage.output_tokens;
  total.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
  total.web_search_requests += response.usage.server_tool_use?.web_search_requests ?? 0;
  total.api_calls += 1;
}

function finalizeCost(total: RunUsage): void {
  const rates = total.pricing_basis === "intro" ? SONNET_5_PRICE_PER_MTOK : SONNET_5_PRICE_PER_MTOK_STANDARD;
  // cache_read is billed at ~0.1x input price; cache_creation at ~1.25x
  // (5-minute TTL, the default — no ttl override is set on this request).
  const inputCost =
    (total.input_tokens / 1_000_000) * rates.input +
    (total.cache_read_input_tokens / 1_000_000) * rates.input * 0.1 +
    (total.cache_creation_input_tokens / 1_000_000) * rates.input * 1.25;
  const outputCost = (total.output_tokens / 1_000_000) * rates.output;
  const searchCost = (total.web_search_requests / 1000) * WEB_SEARCH_PRICE_PER_1000;
  total.estimated_cost_usd = Math.round((inputCost + outputCost + searchCost) * 10000) / 10000;
}

// Merges `addition` into `total` in place (raw counts, then recomputes
// cost) — used by the backfill job to accumulate usage across chunks.
export function mergeUsage(total: RunUsage, addition: RunUsage): void {
  total.input_tokens += addition.input_tokens;
  total.output_tokens += addition.output_tokens;
  total.cache_creation_input_tokens += addition.cache_creation_input_tokens;
  total.cache_read_input_tokens += addition.cache_read_input_tokens;
  total.web_search_requests += addition.web_search_requests;
  total.api_calls += addition.api_calls;
  finalizeCost(total);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEARCH_PROMPT = readFileSync(join(__dirname, "..", "prompts", "search.md"), "utf-8");
const BACKFILL_PROMPT = readFileSync(join(__dirname, "..", "prompts", "backfill.md"), "utf-8");

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Sonnet, not Opus: the spec's $5-15/month estimate was built around
// Sonnet-tier pricing, and Opus runs ~2-2.5x the per-token cost on both
// input and output — collapsing search+judge+write into one call doesn't
// offset that, since billing is per-token, not per-call. Sonnet 5 handles
// this task's search/judgment/extraction fine.
const MODEL = "claude-sonnet-5";
// Effort/search-count knobs are env-overridable so cost can be tuned without
// a code change once real usage data comes in (see spec's review checkpoint).
const EFFORT = (process.env.CLAUDE_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";
const MAX_WEB_SEARCHES = Number(process.env.CLAUDE_MAX_WEB_SEARCHES ?? 20);
// Higher than the weekly cap, and raised again after both backfill test
// runs hit the previous cap (25) — unlike the weekly job, which gets a
// do-over every week, this is a one-time pass over ~2 years of history,
// so it's worth erring toward more search headroom. At $0.01/search, the
// worst case (all 8 chunks maxing out) adds ~$2 versus the old cap.
const BACKFILL_MAX_WEB_SEARCHES = Number(process.env.CLAUDE_BACKFILL_MAX_WEB_SEARCHES ?? 50);
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

interface SystemBlock {
  text: string;
  cacheControl?: boolean;
}

export interface SearchAndJudgeResult {
  items: CandidateItem[];
  usage: RunUsage;
}

// Shared request/resume/parse loop. `label` is only used in log messages
// so failures are traceable to which caller (weekly vs backfill) hit them.
async function runStructuredSearch(
  systemBlocks: SystemBlock[],
  maxWebSearches: number,
  kickoffMessage: string,
  label: string,
): Promise<SearchAndJudgeResult> {
  const usage = emptyUsage();

  const baseParams = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" as const },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema" as const, schema: ITEMS_SCHEMA },
    },
    system: systemBlocks.map((b) => ({
      type: "text" as const,
      text: b.text,
      ...(b.cacheControl ? { cache_control: { type: "ephemeral" as const } } : {}),
    })),
    tools: [
      { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: maxWebSearches },
    ],
  };

  let messages: Anthropic.MessageParam[] = [{ role: "user", content: kickoffMessage }];

  let response = await client.messages.stream({ ...baseParams, messages }).finalMessage();
  addUsage(usage, response);

  let resumes = 0;
  while (response.stop_reason === "pause_turn" && resumes < MAX_RESUMES) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await client.messages.stream({ ...baseParams, messages }).finalMessage();
    addUsage(usage, response);
    resumes++;
  }

  finalizeCost(usage);

  if (response.stop_reason === "refusal") {
    console.warn(
      `Claude declined the ${label} request (category: ${response.stop_details?.category ?? "unknown"}). Treating as zero items found.`,
    );
    return { items: [], usage };
  }

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("");
  if (!text.trim()) {
    console.warn(`No text content in Claude's ${label} response — treating as zero items found.`);
    return { items: [], usage };
  }

  let parsed: { items: CandidateItem[] };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse ${label} structured output as JSON: ${(err as Error).message}\nRaw text: ${text.slice(0, 2000)}`,
    );
  }

  return { items: parsed.items ?? [], usage };
}

function buildWeeklyDynamicContext(
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
): Promise<SearchAndJudgeResult> {
  const dynamicContext = buildWeeklyDynamicContext(scopeProfile, knownSources, weekOf);
  return runStructuredSearch(
    [
      { text: SEARCH_PROMPT, cacheControl: true },
      { text: dynamicContext },
    ],
    MAX_WEB_SEARCHES,
    "Run this week's search and judgment pass now.",
    "weekly search",
  );
}

function buildBackfillDynamicContext(
  scopeProfile: ScopeProfile,
  knownSources: KnownSource[],
  rangeStart: string,
  rangeEnd: string,
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
    "## Known sources to check (newsroom/IR archives, trade press archives)",
    sourceLines || "(none — rely on the standing broad search)",
    "",
    "## This backfill chunk",
    `date_range: ${rangeStart} to ${rangeEnd}`,
    `today: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");
}

export async function searchAndJudgeBackfill(
  scopeProfile: ScopeProfile,
  knownSources: KnownSource[],
  rangeStart: string,
  rangeEnd: string,
): Promise<SearchAndJudgeResult> {
  const dynamicContext = buildBackfillDynamicContext(scopeProfile, knownSources, rangeStart, rangeEnd);
  return runStructuredSearch(
    [
      { text: BACKFILL_PROMPT, cacheControl: true },
      { text: dynamicContext },
    ],
    BACKFILL_MAX_WEB_SEARCHES,
    `Run the historical backfill pass for ${rangeStart} to ${rangeEnd} now.`,
    "backfill",
  );
}
