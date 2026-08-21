// Persists investor/earnings signal items as real, dated, sourced
// digest_items + calendar_entries -- not just narrative prose inside
// the quarterly rollup's JSONB investor_signal column (that column is
// still written too, for the email's dedicated fixed-shape section;
// this is the other half, making each finding independently
// filterable/visible in the web app's List and Calendar views the same
// way every other item is). Mirrors backfill/write.ts's shape.

import { getWeekOfFromString } from "../lib/dates.js";
import { insertCalendarEntries, insertDigestItems } from "../lib/supabase.js";
import type { CalendarEntryInsert, DigestItemInsert, InvestorSignalItem } from "../lib/types.js";

export async function writeInvestorItems(
  items: InvestorSignalItem[],
  runId: string,
): Promise<number> {
  if (items.length === 0) return 0;

  const digestInserts: DigestItemInsert[] = items.map((item) => ({
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

  const calendarInserts: CalendarEntryInsert[] = items.map((item) => ({
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
