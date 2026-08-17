// Builds the shared 6-section structure every eMarketScope email uses —
// weekly (if ever sent), monthly, quarterly, and the one-time backfill
// summary all render through this same shape, per the spec's "Email
// structure" section, so the format stays predictable over time.
//
// Section order and mapping (spec-literal, not inferred):
//   1. Key Dates            <- pillar: calendar
//   2. UX & Feature Updates <- pillar: ux_feature
//   3. Signature Events     <- pillar: signature_event
//   4. Category Highlights  <- the same items, re-sliced by category
//   5. Additional Context   <- trade/industry commentary that doesn't map
//                              to a single digest item (empty for now —
//                              nothing upstream produces this yet; reserved
//                              for Phase 6 synthesis)
//   6. Investor & Earnings Signal <- quarterly only, passed in separately
//
// A section (or a category within Category Highlights) with zero items is
// omitted by the renderer, not padded — this module just organizes items;
// pipeline/email/render.ts decides what to skip.

import type { Category, Pillar } from "../lib/types.js";

export interface EmailSectionItem {
  title: string;
  body: string;
  source_url: string;
  source_name?: string | null;
}

// The minimal shape this module actually needs -- not the full
// CandidateItem (which also carries judge-time fields like
// relevance_reason that never get persisted to digest_items, so a
// DigestItemRow read back from the DB couldn't satisfy it). CandidateItem
// and DigestItemRow both structurally satisfy this without any mapping,
// which is the point: backfill/weekly pass CandidateItem[] straight from
// judge.ts, monthly/quarterly pass DigestItemRow[] straight from a
// Supabase query.
export interface EmailableItem {
  title: string;
  summary: string;
  pillar: Pillar;
  categories: Category[];
  source_url: string;
  source_name?: string | null;
}

export interface EmailSections {
  keyDates: EmailSectionItem[];
  uxFeatureUpdates: EmailSectionItem[];
  signatureEvents: EmailSectionItem[];
  categoryHighlights: Partial<Record<Category, EmailSectionItem[]>>;
  additionalContext: EmailSectionItem[];
  investorEarningsSignal: EmailSectionItem[]; // populated only by the quarterly job
}

function toSectionItem(item: EmailableItem): EmailSectionItem {
  return {
    title: item.title,
    body: item.summary,
    source_url: item.source_url,
    source_name: item.source_name ?? null,
  };
}

export function buildEmailSections(
  items: EmailableItem[],
  investorEarningsSignal: EmailSectionItem[] = [],
): EmailSections {
  const keyDates = items.filter((i) => i.pillar === "calendar").map(toSectionItem);
  const uxFeatureUpdates = items.filter((i) => i.pillar === "ux_feature").map(toSectionItem);
  const signatureEvents = items.filter((i) => i.pillar === "signature_event").map(toSectionItem);

  const categoryHighlights: Partial<Record<Category, EmailSectionItem[]>> = {};
  for (const item of items) {
    for (const category of item.categories) {
      (categoryHighlights[category] ??= []).push(toSectionItem(item));
    }
  }

  return {
    keyDates,
    uxFeatureUpdates,
    signatureEvents,
    categoryHighlights,
    additionalContext: [], // nothing upstream produces this yet — see header comment
    investorEarningsSignal,
  };
}
