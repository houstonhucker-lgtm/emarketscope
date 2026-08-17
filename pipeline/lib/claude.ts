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
const SOURCE_AUDIT_PROMPT = readFileSync(join(__dirname, "..", "prompts", "source-audit.md"), "utf-8");
const SCOPE_PROPOSAL_PROMPT = readFileSync(join(__dirname, "..", "prompts", "scope-proposal.md"), "utf-8");

// maxRetries raised from the SDK default (2) to 5: a real 8-chunk backfill
// run hit a transient 529 overloaded_error on chunk 2/8 with the default,
// aborting the whole job. Bumping retries (with the SDK's built-in
// exponential backoff) reduces how often that can happen at all; the
// per-chunk try/catch in backfill/historical.ts is the second layer, for
// when a chunk fails anyway.
const client = new Anthropic({ maxRetries: 5 }); // reads ANTHROPIC_API_KEY from env

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
// Narrower check than a full search pass -- confirming/denying one
// specific story, not discovering new ones.
const AUDIT_MAX_WEB_SEARCHES = Number(process.env.CLAUDE_AUDIT_MAX_WEB_SEARCHES ?? 10);
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

const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    was_independently_findable: { type: "boolean" },
    evidence_url: { type: "string" },
    evidence_source_name: { type: "string" },
    notes: { type: "string" },
  },
  required: ["was_independently_findable", "notes"],
  additionalProperties: false,
} as const;

interface SystemBlock {
  text: string;
  cacheControl?: boolean;
}

// Scans `text` for top-level balanced {...} objects, string-aware (braces
// inside string values don't affect depth). A response occasionally
// contains more than one — e.g. an intermediate "{"items": []}" segment
// followed by the real final answer — which naive concatenation-then-
// JSON.parse chokes on (observed in production: "Unexpected non-
// whitespace character after JSON"). Returns them in the order found.
function findBalancedJsonObjects(text: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return results;
}

// Extracts the last valid object matching `isValid` from `text`, rather
// than joining every text block and parsing the whole thing as one JSON
// document. Tries candidates newest-first so a well-formed final answer
// wins even if an earlier segment also happens to parse.
function extractLastJsonObject<T>(text: string, label: string, isValid: (v: unknown) => v is T): T {
  const candidates = findBalancedJsonObjects(text);
  if (candidates.length === 0) {
    throw new Error(`No JSON object found in ${label} response text.\nRaw text: ${text.slice(0, 2000)}`);
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed: unknown = JSON.parse(candidates[i]);
      if (isValid(parsed)) {
        return parsed;
      }
    } catch {
      // not valid JSON on its own (e.g. a brace pair that happened to
      // balance mid-string-escape edge case) — try the next candidate back
    }
  }

  throw new Error(
    `Found ${candidates.length} JSON object(s) in ${label} response but none matched the expected shape.\nRaw text: ${text.slice(0, 2000)}`,
  );
}

interface RawSearchResult {
  text: string | null; // null on refusal or an empty response
  usage: RunUsage;
}

// Shared request/resume loop — the network/retry/usage-tracking mechanics
// every structured search call needs, regardless of what schema it's
// asking for. `label` is only used in log messages so failures are
// traceable to which caller (weekly / backfill / audit) hit them.
async function executeSearchRequest(
  systemBlocks: SystemBlock[],
  schema: Record<string, unknown>,
  maxWebSearches: number,
  kickoffMessage: string,
  label: string,
): Promise<RawSearchResult> {
  const usage = emptyUsage();

  const baseParams = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" as const },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema" as const, schema },
    },
    system: systemBlocks.map((b) => ({
      type: "text" as const,
      text: b.text,
      ...(b.cacheControl ? { cache_control: { type: "ephemeral" as const } } : {}),
    })),
    // maxWebSearches: 0 means this call does no searching at all (e.g.
    // the scope-proposal reasoning pass, which works only from evidence
    // it's already given) -- omit the tool entirely rather than declare
    // it with a zero budget.
    ...(maxWebSearches > 0
      ? {
          tools: [
            { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: maxWebSearches },
          ],
        }
      : {}),
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
      `Claude declined the ${label} request (category: ${response.stop_details?.category ?? "unknown"}).`,
    );
    return { text: null, usage };
  }

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  const text = textBlocks.map((b) => b.text).join("");
  if (!text.trim()) {
    console.warn(`No text content in Claude's ${label} response.`);
    return { text: null, usage };
  }

  return { text, usage };
}

export interface SearchAndJudgeResult {
  items: CandidateItem[];
  usage: RunUsage;
}

function isItemsShape(v: unknown): v is { items: CandidateItem[] } {
  return !!v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items);
}

async function runStructuredSearch(
  systemBlocks: SystemBlock[],
  maxWebSearches: number,
  kickoffMessage: string,
  label: string,
): Promise<SearchAndJudgeResult> {
  const { text, usage } = await executeSearchRequest(systemBlocks, ITEMS_SCHEMA, maxWebSearches, kickoffMessage, label);
  if (!text) return { items: [], usage };
  const parsed = extractLastJsonObject(text, label, isItemsShape);
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

export interface AuditResult {
  was_independently_findable: boolean;
  evidence_url?: string;
  evidence_source_name?: string;
  notes: string;
}

export interface AuditAndUsage {
  result: AuditResult | null; // null on refusal or an empty response
  usage: RunUsage;
}

function isAuditShape(v: unknown): v is AuditResult {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.was_independently_findable === "boolean" && typeof obj.notes === "string";
}

function buildAuditDynamicContext(item: {
  subject: string | null;
  body: string | null;
  extractedUrl: string | null;
}): string {
  return [
    "## Forwarded item",
    `subject: ${item.subject ?? "(none)"}`,
    `extracted_url: ${item.extractedUrl ?? "(none)"}`,
    "body:",
    item.body ?? "(empty)",
    "",
    `today: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");
}

export async function auditForwardedItem(item: {
  subject: string | null;
  body: string | null;
  extractedUrl: string | null;
}): Promise<AuditAndUsage> {
  const dynamicContext = buildAuditDynamicContext(item);
  const { text, usage } = await executeSearchRequest(
    [
      { text: SOURCE_AUDIT_PROMPT, cacheControl: true },
      { text: dynamicContext },
    ],
    AUDIT_SCHEMA,
    AUDIT_MAX_WEB_SEARCHES,
    "Run the source-coverage audit for this forwarded item now.",
    "source audit",
  );
  if (!text) return { result: null, usage };
  const result = extractLastJsonObject(text, "source audit", isAuditShape);
  return { result, usage };
}

// Scope-profile review-checkpoint proposal. No web_search (maxWebSearches
// 0, see executeSearchRequest) -- this reasons only over evidence it's
// given (feedback, audit results, known-source hit patterns), never
// discovers anything new. See prompts/scope-proposal.md.

const CATEGORY_DETAIL_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    // A single fixed "items" key (not arbitrary subcategory-group names)
    // so this stays valid under strict JSON schema (additionalProperties
    // must be false, so property sets must be enumerable) while still
    // matching ScopeProfileCategoryDetail's Record<string, string[]> shape
    // at runtime.
    subcategories: {
      type: "object",
      properties: { items: { type: "array", items: { type: "string" } } },
      required: ["items"],
      additionalProperties: false,
    },
    priority: { type: "string" },
    note: { type: "string" },
  },
  required: ["label", "subcategories"],
  additionalProperties: false,
} as const;

const SCOPE_PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    change_summary: { type: "string" },
    profile: {
      type: "object",
      properties: {
        retailers: {
          type: "object",
          properties: {
            walmart: {
              type: "object",
              properties: { tier: { type: "string" }, note: { type: "string" } },
              required: ["tier"],
              additionalProperties: false,
            },
            amazon: {
              type: "object",
              properties: { tier: { type: "string" }, note: { type: "string" } },
              required: ["tier"],
              additionalProperties: false,
            },
            target: {
              type: "object",
              properties: { tier: { type: "string" }, note: { type: "string" } },
              required: ["tier"],
              additionalProperties: false,
            },
          },
          required: ["walmart", "amazon", "target"],
          additionalProperties: false,
        },
        categories: {
          type: "object",
          properties: {
            household_essentials: CATEGORY_DETAIL_SCHEMA,
            health: CATEGORY_DETAIL_SCHEMA,
            beauty: CATEGORY_DETAIL_SCHEMA,
            personal_care: CATEGORY_DETAIL_SCHEMA,
            baby_care: CATEGORY_DETAIL_SCHEMA,
          },
          required: ["household_essentials", "health", "beauty", "personal_care", "baby_care"],
          additionalProperties: false,
        },
        pillars: {
          type: "object",
          properties: {
            ux_feature: { type: "string" },
            signature_event: { type: "string" },
            calendar: { type: "string" },
          },
          required: ["ux_feature", "signature_event", "calendar"],
          additionalProperties: false,
        },
        out_of_scope: { type: "array", items: { type: "string" } },
        goal: { type: "string" },
      },
      required: ["retailers", "categories", "pillars", "out_of_scope", "goal"],
      additionalProperties: false,
    },
  },
  required: ["change_summary", "profile"],
  additionalProperties: false,
} as const;

export interface ScopeProposal {
  change_summary: string;
  profile: ScopeProfile;
}

export interface ScopeProposalAndUsage {
  proposal: ScopeProposal | null;
  usage: RunUsage;
}

function isScopeProposalShape(v: unknown): v is ScopeProposal {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.change_summary === "string" && !!obj.profile && typeof obj.profile === "object";
}

export async function proposeScopeChanges(
  currentProfile: ScopeProfile,
  evidenceSummary: string,
): Promise<ScopeProposalAndUsage> {
  const dynamicContext = [
    "## Current active scope profile",
    "```json",
    JSON.stringify(currentProfile, null, 2),
    "```",
    "",
    "## Accumulated evidence since the last review",
    evidenceSummary,
    "",
    `today: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const { text, usage } = await executeSearchRequest(
    [
      { text: SCOPE_PROPOSAL_PROMPT, cacheControl: true },
      { text: dynamicContext },
    ],
    SCOPE_PROPOSAL_SCHEMA,
    0, // no web search — see header comment
    "Draft the scope profile proposal for this review checkpoint now.",
    "scope proposal",
  );
  if (!text) return { proposal: null, usage };
  const proposal = extractLastJsonObject(text, "scope proposal", isScopeProposalShape);
  return { proposal, usage };
}
