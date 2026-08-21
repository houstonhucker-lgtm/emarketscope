"use client";

import { useMemo, useState } from "react";
import { PILLAR_COLOR_VAR } from "@/lib/colors";
import { PILLAR_LABELS, type CalendarEntry, type Pillar } from "@/lib/types";
import EntryCard from "./EntryCard";

const ALL_PILLARS = Object.keys(PILLAR_LABELS) as Pillar[];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

// A multi-day entry (event_date_end set) gets a dot on every day it
// spans, not just its start date -- that's what a real month view means
// for a date range. Guards against a reversed/malformed range from
// upstream data hanging this on a single bad row.
function dateRangeKeys(startKey: string, endKey: string | null): string[] {
  const start = parseDateKey(startKey);
  const end = endKey ? parseDateKey(endKey) : start;
  if (end < start) return [startKey];
  const keys: string[] = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 60) {
    keys.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return keys;
}

export default function MonthGrid({ entries }: { entries: CalendarEntry[] }) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const todayKey = useMemo(() => toDateKey(today), [today]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      for (const key of dateRangeKeys(entry.event_date, entry.event_date_end)) {
        const list = map.get(key);
        if (list) list.push(entry);
        else map.set(key, [entry]);
      }
    }
    return map;
  }, [entries]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startWeekday = firstOfMonth.getDay(); // 0 = Sun
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const result: { key: string; dayNum: number; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const date = new Date(viewYear, viewMonth, i - startWeekday + 1);
      result.push({ key: toDateKey(date), dayNum: date.getDate(), inMonth: date.getMonth() === viewMonth });
    }
    return result;
  }, [viewYear, viewMonth]);

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

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dayEntries = byDay.get(cell.key) ?? [];
          const pillarsPresent = ALL_PILLARS.filter((p) => dayEntries.some((e) => e.pillar === p));
          const isSelected = selectedDay === cell.key;
          const isToday = cell.key === todayKey;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : cell.key)}
              aria-pressed={isSelected}
              aria-label={`${cell.key}${dayEntries.length ? `, ${dayEntries.length} entr${dayEntries.length === 1 ? "y" : "ies"}` : ""}`}
              className={
                "flex aspect-square flex-col items-center justify-start gap-1 rounded-md border p-1 pt-1.5 text-xs transition-colors " +
                (isSelected
                  ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-800"
                  : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600") +
                (cell.inMonth ? "" : " opacity-40")
              }
            >
              <span
                className={
                  "flex h-5 w-5 items-center justify-center rounded-full " +
                  (isToday
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-700 dark:text-neutral-300")
                }
              >
                {cell.dayNum}
              </span>
              <span className="flex gap-0.5">
                {pillarsPresent.map((p) => (
                  // 8px, not the more compact 6px this cell would fit more
                  // easily -- the dataviz skill's mark spec calls for
                  // ≥8px markers, and this reuses the already-validated
                  // 3-slot pillar palette (web/README.md's Calendar
                  // color-coding section), so the mark size shouldn't be
                  // the thing that undermines that validation.
                  <span
                    key={p}
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: PILLAR_COLOR_VAR[p] }}
                  />
                ))}
              </span>
            </button>
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
