// Persists investor/earnings signal items as real, dated, sourced
// digest_items + calendar_entries. Called by investor/daily-check.ts,
// triggered by each retailer's actual known earnings date rather than
// quarterly's own fixed cadence -- quarterly/synthesize.ts just queries
// whatever's already accumulated here, same as it does for every other
// pillar. Mirrors backfill/write.ts's shape.
//
// validateInvestorItem below exists because judge.ts's validation never
// covered this path -- a real test run surfaced the gap directly: under
// an artificial/inconsistent date scenario, the model returned a
// hallucinated placeholder ({title: "PLACEHOLDER - not used", source_url:
// "https://example.com"}) that satisfied the JSON schema (all fields
// present, right types) and landed in production digest_items +
// calendar_entries with nothing to catch it. Same defense-in-depth
// posture as judge.ts, applied to this path too.

import { getWeekOfFromString } from "../lib/dates.js";
import { insertCalendarEntries, insertDigestItems } from "../lib/supabase.js";
import type { CalendarEntryInsert, Category, DigestItemInsert, InvestorSignalItem, Retailer } from "../lib/types.js";

const VALID_RETAILERS: Retailer[] = ["walmart", "amazon", "target"];
const VALID_CATEGORIES: Category[] = [
  "household_essentials",
  "health",
  "beauty",
  "personal_care",
  "baby_care",
];
// RFC 2606 reserved placeholder domains -- never a legitimate source for
// this app, and exactly what the model hallucinated in the real
// production incident this validation was added for.
const PLACEHOLDER_DOMAINS = ["example.com", "example.org", "example.net"];

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return !PLACEHOLDER_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function isValidPublishedDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  // A report can't be published in the future -- a few days' slack for
  // timezone edge cases, not an open-ended allowance.
  const maxAllowed = new Date();
  maxAllowed.setUTCDate(maxAllowed.getUTCDate() + 2);
  return date <= maxAllowed;
}

export function validateInvestorItem(item: InvestorSignalItem): string | null {
  if (!item.title?.trim() || !item.summary?.trim()) return "missing title or summary";
  if (!isValidUrl(item.source_url)) return `missing or invalid source_url: ${item.source_url}`;
  if (!VALID_RETAILERS.includes(item.retailer)) return `invalid retailer: ${item.retailer}`;
  if (!item.categories?.length || !item.categories.every((c) => VALID_CATEGORIES.includes(c))) {
    return `invalid or empty categories: ${JSON.stringify(item.categories)}`;
  }
  if (!isValidPublishedDate(item.published_date)) return `invalid published_date: ${item.published_date}`;
  return null;
}

export async function writeInvestorItems(
  items: InvestorSignalItem[],
  runId: string,
): Promise<number> {
  const validated: InvestorSignalItem[] = [];
  for (const item of items) {
    const reason = validateInvestorItem(item);
    if (reason) {
      console.warn(`Rejected investor item "${item.title}": ${reason}`);
      continue;
    }
    validated.push(item);
  }
  if (validated.length === 0) return 0;

  const digestInserts: DigestItemInsert[] = validated.map((item) => ({
    run_id: runId,
    week_of: getWeekOfFromString(item.published_date),
    title: item.title,
    summary: item.summary,
    pillar: "investor_earnings",
    retailers: [item.retailer],
    categories: item.categories,
    source_url: item.source_url,
    source_name: item.source_name ?? null,
    source_published_at: item.published_date,
    tags: [],
    is_backfill: false,
  }));

  const inserted = await insertDigestItems(digestInserts);
  const byUrl = new Map(inserted.map((row) => [row.source_url, row.id]));

  const calendarInserts: CalendarEntryInsert[] = validated.map((item) => ({
    event_date: item.published_date,
    event_date_end: null,
    title: item.title,
    description: item.summary,
    pillar: "investor_earnings",
    retailers: [item.retailer],
    categories: item.categories,
    source_url: item.source_url,
    source_name: item.source_name ?? null,
    related_digest_item_id: byUrl.get(item.source_url) ?? null,
    is_backfill: false,
  }));

  await insertCalendarEntries(calendarInserts);

  return inserted.length;
}
