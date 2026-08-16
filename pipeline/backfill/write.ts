// Persists validated backfill items. Differs from weekly/write.ts in two
// ways: every row is_backfill=true, and week_of is computed per item
// (event_date, falling back to source_published_at, falling back to the
// chunk's start date) rather than one shared value for the whole batch —
// backfill items span many different historical weeks, not one.

import { getWeekOfFromString } from "../lib/dates.js";
import {
  insertCalendarEntries,
  insertDigestItems,
  recordKnownSourceHits,
} from "../lib/supabase.js";
import type { CalendarEntryInsert, DigestItemInsert, ValidatedItem } from "../lib/types.js";

export async function writeBackfill(
  items: ValidatedItem[],
  runId: string,
  chunkFallbackDate: string,
): Promise<number> {
  if (items.length === 0) return 0;

  const digestInserts: DigestItemInsert[] = items.map((item) => {
    const referenceDate = item.event_date ?? item.source_published_at ?? chunkFallbackDate;
    return {
      run_id: runId,
      week_of: getWeekOfFromString(referenceDate),
      title: item.title,
      summary: item.summary,
      pillar: item.pillar,
      retailers: item.retailers,
      categories: item.categories,
      source_url: item.source_url,
      source_name: item.source_name ?? null,
      source_published_at: item.source_published_at ?? null,
      tags: item.tags ?? [],
      is_backfill: true,
    };
  });

  const inserted = await insertDigestItems(digestInserts);
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
      is_backfill: true,
    }));

  await insertCalendarEntries(calendarInserts);

  await recordKnownSourceHits(items.map((item) => item.source_name ?? "").filter(Boolean));

  return inserted.length;
}
