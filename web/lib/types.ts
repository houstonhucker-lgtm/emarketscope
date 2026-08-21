// Mirrors the relevant slice of the Supabase schema
// (supabase/migrations/*.sql) for the web app's own use. Kept separate
// from pipeline/lib/types.ts since web/ is a distinct deployable with its
// own package.json/node_modules -- not imported across that boundary.

export type Retailer = "walmart" | "amazon" | "target";

export type Category = "household_essentials" | "health" | "beauty" | "personal_care" | "baby_care";

export type Pillar = "ux_feature" | "signature_event" | "calendar" | "investor_earnings";

export const CATEGORY_LABELS: Record<Category, string> = {
  household_essentials: "Household Essentials",
  health: "Health & Wellness",
  beauty: "Beauty",
  personal_care: "Personal Care",
  baby_care: "Baby Care",
};

export const PILLAR_LABELS: Record<Pillar, string> = {
  ux_feature: "UX & Feature Update",
  signature_event: "Signature Event",
  calendar: "Calendar-only",
  investor_earnings: "Investor & Earnings",
};

export interface DigestItem {
  id: string;
  created_at: string;
  run_id: string | null;
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

export interface CalendarEntry {
  id: string;
  created_at: string;
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

export interface Feedback {
  id: string;
  created_at: string;
  digest_item_id: string;
  vote: "up" | "down";
  note: string | null;
}

export interface InvestorSignalItem {
  title: string;
  summary: string;
  source_url: string;
  source_name?: string;
  retailer: Retailer;
  categories: Category[];
  published_date: string;
}

export interface Rollup {
  id: string;
  created_at: string;
  run_id: string | null;
  rollup_type: "monthly" | "quarterly";
  period_start: string;
  period_end: string;
  period_label: string;
  narrative: string;
  investor_signal: InvestorSignalItem[] | null;
  email_sent: boolean;
  email_error: string | null;
}
