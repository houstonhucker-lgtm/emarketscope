// Persists validated items to Supabase: every item becomes a digest_items
// row; items that carry a genuine event_date (pillar calendar or
// signature_event) also get a calendar_entries row linked back to it.

import {
  insertCalendarEntries,
  insertDigestItems,
  recordKnownSourceHits,
} from "../lib/supabase.js";
import type { CalendarEntryInsert, DigestItemInsert, ValidatedItem } from "../lib/types.js";

export async function write(
  items: ValidatedItem[],
  runId: string,
  weekOf: string,
): Promise<number> {
  if (items.length === 0) return 0;

  const digestInserts: DigestItemInsert[] = items.map((item) => ({
    run_id: runId,
    week_of: weekOf,
    title: item.title,
    summary: item.summary,
    pillar: item.pillar,
    retailers: item.retailers,
    categories: item.categories,
    source_url: item.source_url,
    source_name: item.source_name ?? null,
    source_published_at: item.source_published_at ?? null,
    tags: item.tags ?? [],
    is_backfill: false,
  }));

  const inserted = await insertDigestItems(digestInserts);

  // Match inserted rows back to their source item by source_url (unique
  // within this batch — judge.ts already deduped) to link calendar entries.
  const byUrl = new Map(inserted.map((row) => [row.source_url, row.id]));

  const calendarInserts: CalendarEntryInsert[] = items
    .filter((item) => Boolean(item.event_date))
    .map((item) => ({
      event_date: item.event_date as string,
      event_date_end: item.event_date_end ?? null,
      title: item.title,
      description: item.summary,
      retailers: item.retailers,
      categories: item.categories,
      source_url: item.source_url,
      source_name: item.source_name ?? null,
      related_digest_item_id: byUrl.get(item.source_url) ?? null,
      is_backfill: false,
    }));

  await insertCalendarEntries(calendarInserts);

  await recordKnownSourceHits(items.map((item) => item.source_name ?? "").filter(Boolean));

  return inserted.length;
}
