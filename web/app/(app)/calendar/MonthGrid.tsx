"use client";

import { useMemo, useState } from "react";
import { PILLAR_COLOR_VAR, PILLAR_PATTERN_CLASS, isHueCodedPillar } from "@/lib/colors";
import type { CalendarEntry } from "@/lib/types";
import EntryCard from "./EntryCard";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Every entry renders as a bar, single-day included -- Google Calendar
// renders single-day all-day events the same way, and mixing dots with
// bars in the same grid reads as two different visual languages for the
// same encoding. Capped per week so a real cluster (spring sale season,
// Prime Day season -- both show up in the real data with 3-4 mutually
// overlapping entries) doesn't blow out the grid; anything beyond the
// cap shows as a "+N" count on the days it touches, same as Google
// Calendar's own overflow treatment.
const MAX_VISIBLE_LANES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// event_date/event_date_end are plain "YYYY-MM-DD" strings (see
// lib/types.ts) -- parsed as local-time components, not via `new
// Date(dateString)`, which reads a bare date as UTC midnight and can
// land on the wrong day once rendered in the browser's local timezone.
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DayCell {
  key: string;
  dayNum: number;
  inMonth: boolean;
  date: Date;
}

function buildWeeks(viewYear: number, viewMonth: number): DayCell[][] {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells: DayCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(viewYear, viewMonth, i - startWeekday + 1);
    cells.push({ key: toDateKey(date), dayNum: date.getDate(), inMonth: date.getMonth() === viewMonth, date });
  }
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

interface BarPlacement {
  entry: CalendarEntry;
  startCol: number; // 0-6 within this week
  endCol: number; // 0-6 within this week
  lane: number;
}

// A multi-day entry that crosses a week boundary is handled by calling
// this once per week the entry overlaps -- each call independently
// clamps the entry's range to that week's Sun-Sat span, so the bar
// naturally continues as its own full-width (or partial) segment on the
// next row rather than needing explicit "wrap" logic.
function layoutWeek(
  week: DayCell[],
  entries: CalendarEntry[],
): { placements: BarPlacement[]; hiddenByCol: number[] } {
  const weekStart = week[0].date;
  const weekEnd = week[6].date;

  const segments = entries
    .map((entry) => {
      const entryStart = parseDateKey(entry.event_date);
      const entryEndRaw = entry.event_date_end ? parseDateKey(entry.event_date_end) : entryStart;
      const entryEnd = entryEndRaw < entryStart ? entryStart : entryEndRaw; // malformed range guard
      if (entryEnd < weekStart || entryStart > weekEnd) return null;
      const clampedStart = entryStart < weekStart ? weekStart : entryStart;
      const clampedEnd = entryEnd > weekEnd ? weekEnd : entryEnd;
      const startCol = Math.round((clampedStart.getTime() - weekStart.getTime()) / DAY_MS);
      const endCol = Math.round((clampedEnd.getTime() - weekStart.getTime()) / DAY_MS);
      return { entry, startCol, endCol };
    })
    .filter((s): s is { entry: CalendarEntry; startCol: number; endCol: number } => s !== null)
    // Earlier start first; among ties, longer bars claim a lane before
    // short ones, so a short same-start entry is what gets pushed to
    // overflow rather than a long-running one.
    .sort((a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol));

  const laneEnds: number[] = []; // laneEnds[lane] = endCol of the last bar placed in that lane
  const placements: BarPlacement[] = [];
  for (const seg of segments) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.endCol);
    } else {
      laneEnds[lane] = seg.endCol;
    }
    placements.push({ ...seg, lane });
  }

  const hiddenByCol = new Array(7).fill(0) as number[];
  for (const p of placements) {
    if (p.lane >= MAX_VISIBLE_LANES) {
      for (let c = p.startCol; c <= p.endCol; c++) hiddenByCol[c]++;
    }
  }

  return { placements: placements.filter((p) => p.lane < MAX_VISIBLE_LANES), hiddenByCol };
}

export default function MonthGrid({ entries }: { entries: CalendarEntry[] }) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const todayKey = useMemo(() => toDateKey(today), [today]);

  // Full per-day entry list, for the expansion panel below the grid --
  // independent of the visible-lane cap above, which only limits what
  // renders as a bar in the grid itself.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const start = parseDateKey(entry.event_date);
      const endRaw = entry.event_date_end ? parseDateKey(entry.event_date_end) : start;
      const end = endRaw < start ? start : endRaw;
      const cur = new Date(start);
      let guard = 0;
      while (cur <= end && guard < 60) {
        const key = toDateKey(cur);
        const list = map.get(key);
        if (list) list.push(entry);
        else map.set(key, [entry]);
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    }
    return map;
  }, [entries]);

  const weeks = useMemo(() => buildWeeks(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekLayouts = useMemo(() => weeks.map((week) => layoutWeek(week, entries)), [weeks, entries]);
  // Every week in the visible month shares the same number of lane rows
  // -- computed from whichever week needs the most -- so the grid stays
  // visually aligned instead of each row being a different height.
  const monthLanes = Math.max(1, ...weekLayouts.map((w) => Math.max(0, ...w.placements.map((p) => p.lane + 1))));

  function goToPrevMonth() {
    setSelectedDay(null);
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    setSelectedDay(null);
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(todayKey);
  }

  const selectedEntries = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label="Previous month"
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
        >
          &larr;
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {MONTH_LABELS[viewMonth]} {viewYear}
          </h2>
          <button
            type="button"
            onClick={goToToday}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Today
          </button>
        </div>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Next month"
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
        >
          &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week, weekIdx) => {
          const { placements, hiddenByCol } = weekLayouts[weekIdx];
          return (
            <div
              key={week[0].key}
              className="grid grid-cols-7 gap-1"
              style={{ gridTemplateRows: `auto repeat(${monthLanes}, 8px)` }}
            >
              {week.map((cell, colIdx) => {
                const isSelected = selectedDay === cell.key;
                const isToday = cell.key === todayKey;
                const hidden = hiddenByCol[colIdx];
                return (
                  // Spans every row for this column -- day number, all
                  // lane rows, overflow count -- so the tap target is the
                  // whole day cell, not just the small number circle.
                  // Bars render afterward as separate grid items in the
                  // same column/lane rows and paint on top, so tapping a
                  // bar hits the bar; tapping anywhere else in the column
                  // (including the +N text, a child of this button) hits
                  // this day-select handler.
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : cell.key)}
                    aria-pressed={isSelected}
                    aria-label={`${cell.key}${hidden ? `, ${hidden} more not shown` : ""}`}
                    style={{ gridColumn: colIdx + 1, gridRow: "1 / -1" }}
                    className={
                      "flex flex-col items-center gap-1 rounded-md pt-1 pb-0.5 transition-colors " +
                      (isSelected
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-900") +
                      (cell.inMonth ? "" : " opacity-40")
                    }
                  >
                    <span
                      className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs " +
                        (isToday
                          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                          : "text-neutral-700 dark:text-neutral-300")
                      }
                    >
                      {cell.dayNum}
                    </span>
                    {hidden > 0 && (
                      <span className="mt-auto text-[9px] leading-none text-neutral-400 dark:text-neutral-500">
                        +{hidden}
                      </span>
                    )}
                  </button>
                );
              })}

              {placements.map((p) => {
                const hueCoded = isHueCodedPillar(p.entry.pillar);
                return (
                  <button
                    key={`${p.entry.id}-${weekIdx}`}
                    type="button"
                    onClick={() => setSelectedDay(week[p.startCol].key)}
                    title={p.entry.title}
                    aria-label={p.entry.title}
                    style={{
                      gridColumn: `${p.startCol + 1} / ${p.endCol + 2}`,
                      gridRow: p.lane + 2,
                      ...(isHueCodedPillar(p.entry.pillar) ? { backgroundColor: PILLAR_COLOR_VAR[p.entry.pillar] } : {}),
                    }}
                    // 8px tall, not more compact -- same ≥8px marker floor
                    // reasoning as the grid's previous dot version, applied
                    // to this mark shape too (see lib/colors.ts's Calendar
                    // color-coding note on the underlying palette).
                    // investor_earnings has no hue slot -- PILLAR_PATTERN_CLASS
                    // gives it a diagonal-hatch fill instead of a flat
                    // color, since a plain neutral bar would read as
                    // empty/absent next to three bold-colored neighbors.
                    className={
                      "h-2 min-w-0 rounded-sm opacity-90 transition-opacity hover:opacity-100 " +
                      (hueCoded ? "" : PILLAR_PATTERN_CLASS)
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {parseDateKey(selectedDay).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h3>
          {selectedEntries.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No entries this day.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
