// Date helpers shared by the weekly pipeline and the backfill job.

// Monday of the week containing `date`, in UTC, as YYYY-MM-DD.
export function getWeekOf(date: Date = new Date()): string {
  const day = date.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

export function getWeekOfFromString(dateStr: string): string {
  return getWeekOf(new Date(`${dateStr}T00:00:00Z`));
}

export interface DateChunk {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

// Splits [start, end] into consecutive chunks roughly `monthsPerChunk` wide.
// Used by the backfill job to keep each Claude call scoped to a bounded
// window rather than asking for "the last 2 years" in one shot.
export function chunkDateRange(start: Date, end: Date, monthsPerChunk = 3): DateChunk[] {
  const chunks: DateChunk[] = [];
  let chunkStart = new Date(start);

  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setUTCMonth(chunkEnd.getUTCMonth() + monthsPerChunk);
    const boundedEnd = chunkEnd < end ? chunkEnd : end;
    chunks.push({
      start: chunkStart.toISOString().slice(0, 10),
      end: boundedEnd.toISOString().slice(0, 10),
    });
    chunkStart = boundedEnd;
  }

  return chunks;
}
