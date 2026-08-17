// Shared types mirroring the Supabase schema (supabase/migrations/*.sql).
// Kept hand-written rather than generated, since the schema is small and
// stable; regenerate by hand if migrations drift from this file.

export type Retailer = "walmart" | "amazon" | "target";

export type Category =
  | "household_essentials"
  | "health"
  | "beauty"
  | "personal_care"
  | "baby_care";

export type Pillar = "ux_feature" | "signature_event" | "calendar";

export type RunType = "weekly" | "monthly" | "quarterly" | "backfill";
export type RunStatus = "running" | "success" | "failed";

export interface PipelineRun {
  id: string;
  run_type: RunType;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  items_found: number | null;
  notes: string | null;
}

// Anchored to concrete subcategories/products, not bare department names —
// retailers slice these departments inconsistently, so search/judge needs
// to match against the actual subcategory list. `priority`/`note` carry
// weighting the spec calls out explicitly (e.g. hair care primary /
// skincare secondary within beauty; diapers & wipes heaviest within baby)
// rather than treating every subcategory as equal.
export interface ScopeProfileCategoryDetail {
  label: string;
  subcategories: Record<string, string[]>;
  priority?: string;
  note?: string;
}

export interface ScopeProfile {
  retailers: Record<string, { tier: string; note?: string }>;
  categories: Record<Category, ScopeProfileCategoryDetail>;
  pillars: Record<string, string>;
  out_of_scope: string[];
  goal: string;
}

export interface ScopeProfileVersion {
  id: string;
  version: number;
  content: ScopeProfile;
  status: "proposed" | "active" | "rejected";
  proposed_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface KnownSource {
  id: string;
  name: string;
  url: string | null;
  source_type: "trade_press" | "podcast" | "newsroom" | "newsletter" | "other" | null;
  status: "active" | "inactive" | "candidate";
  added_reason: string | null;
  hit_count: number;
  first_hit_at: string | null;
  last_hit_at: string | null;
  created_at: string;
}

export interface ForwardedItem {
  id: string;
  received_at: string;
  from_email: string | null;
  subject: string | null;
  body: string | null;
  extracted_url: string | null;
  status: "pending" | "processed" | "ignored";
  resulting_digest_item_id: string | null;
  processed_at: string | null;
}

export interface SourceCoverageAuditInsert {
  forwarded_item_id: string;
  was_independently_findable: boolean | null;
  evidence_url: string | null;
  notes: string | null;
}

// One candidate item as produced directly by the Claude search+judge call,
// before validation in judge.ts.
export interface CandidateItem {
  title: string;
  summary: string;
  pillar: Pillar;
  retailers: Retailer[];
  categories: Category[];
  source_url: string;
  source_name?: string;
  source_published_at?: string | null;
  tags?: string[];
  relevance_reason: string;
  event_date?: string | null;
  event_date_end?: string | null;
}

// A CandidateItem that has passed judge.ts's validation.
export type ValidatedItem = CandidateItem;

export interface DigestItemInsert {
  run_id: string;
  week_of: string;
  title: string;
  summary: string;
  pillar: Pillar;
  retailers: Retailer[];
  categories: Category[];
  source_url: string;
  source_name: string | null;
  source_published_at: string | null;
  tags: string[];
  is_backfill: boolean;
}

export interface CalendarEntryInsert {
  event_date: string;
  event_date_end: string | null;
  title: string;
  description: string | null;
  pillar: Pillar;
  retailers: Retailer[];
  categories: Category[];
  source_url: string;
  source_name: string | null;
  related_digest_item_id: string | null;
  is_backfill: boolean;
}
