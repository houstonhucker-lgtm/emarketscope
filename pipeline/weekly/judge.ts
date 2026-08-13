// Post-processes candidates from claude.ts's search+judge call. The actual
// relevance judgment against the scope profile already happened inside
// that call (see prompts/search.md) — this step is defense-in-depth
// validation and deduplication, not a second LLM pass: reject anything
// with a missing/invalid field despite the schema constraint, and drop
// items that duplicate something already stored (e.g. a re-run after a
// partial failure) or duplicate another item in the same batch.

import type { CandidateItem, Category, Pillar, Retailer } from "../lib/types.js";

const VALID_PILLARS: Pillar[] = ["ux_feature", "signature_event", "calendar"];
const VALID_RETAILERS: Retailer[] = ["walmart", "amazon", "target"];
const VALID_CATEGORIES: Category[] = [
  "household_essentials",
  "health",
  "beauty",
  "personal_care",
  "baby_care",
];

export interface JudgeResult {
  validated: CandidateItem[];
  rejected: { item: CandidateItem; reason: string }[];
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function judge(candidates: CandidateItem[], existingSourceUrls: Set<string>): JudgeResult {
  const validated: CandidateItem[] = [];
  const rejected: { item: CandidateItem; reason: string }[] = [];
  const seenInBatch = new Set<string>();

  for (const item of candidates) {
    if (!item.title?.trim() || !item.summary?.trim()) {
      rejected.push({ item, reason: "missing title or summary" });
      continue;
    }
    if (!item.source_url || !isValidUrl(item.source_url)) {
      rejected.push({ item, reason: "missing or invalid source_url" });
      continue;
    }
    if (!VALID_PILLARS.includes(item.pillar)) {
      rejected.push({ item, reason: `invalid pillar: ${item.pillar}` });
      continue;
    }
    if (!item.retailers?.length || !item.retailers.every((r) => VALID_RETAILERS.includes(r))) {
      rejected.push({ item, reason: `invalid or empty retailers: ${JSON.stringify(item.retailers)}` });
      continue;
    }
    if (!item.categories?.length || !item.categories.every((c) => VALID_CATEGORIES.includes(c))) {
      rejected.push({ item, reason: `invalid or empty categories: ${JSON.stringify(item.categories)}` });
      continue;
    }
    if (existingSourceUrls.has(item.source_url)) {
      rejected.push({ item, reason: "already stored for this week (duplicate source_url)" });
      continue;
    }
    if (seenInBatch.has(item.source_url)) {
      rejected.push({ item, reason: "duplicate within this run's batch" });
      continue;
    }
    seenInBatch.add(item.source_url);
    validated.push(item);
  }

  return { validated, rejected };
}
