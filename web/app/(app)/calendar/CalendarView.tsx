"use client";

import { useMemo, useState } from "react";
import { PILLAR_COLOR_VAR } from "@/lib/colors";
import { CATEGORY_LABELS, PILLAR_LABELS, type Category, type CalendarEntry, type Pillar } from "@/lib/types";
import EntryCard from "./EntryCard";
import MonthGrid from "./MonthGrid";

const ALL_PILLARS = Object.keys(PILLAR_LABELS) as Pillar[];
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

type View = "grid" | "list";

function FilterPill({
  active,
  onClick,
  children,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
          : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400")
      }
    >
      {dotColor && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor, opacity: active ? 1 : 0.6 }}
        />
      )}
      {children}
    </button>
  );
}

export default function CalendarView({ entries }: { entries: CalendarEntry[] }) {
  const [view, setView] = useState<View>("grid");

  // Both axes default to "all" (every value selected) per spec.
  const [pillars, setPillars] = useState<Set<Pillar>>(new Set(ALL_PILLARS));
  const [categories, setCategories] = useState<Set<Category>>(new Set(ALL_CATEGORIES));

  function togglePillar(p: Pillar) {
    setPillars((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleCategory(c: Category) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) => pillars.has(e.pillar) && e.categories.some((c) => categories.has(c)),
      ),
    [entries, pillars, categories],
  );

  const allPillarsSelected = pillars.size === ALL_PILLARS.length;
  const allCategoriesSelected = categories.size === ALL_CATEGORIES.length;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Calendar view"
        className="inline-flex w-fit gap-1 rounded-full border border-neutral-300 p-0.5 dark:border-neutral-700"
      >
        {(["grid", "list"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors " +
              (view === v
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100")
            }
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">Type</span>
            <button
              type="button"
              onClick={() => setPillars(allPillarsSelected ? new Set() : new Set(ALL_PILLARS))}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              {allPillarsSelected ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_PILLARS.map((p) => (
              <FilterPill key={p} active={pillars.has(p)} onClick={() => togglePillar(p)} dotColor={PILLAR_COLOR_VAR[p]}>
                {PILLAR_LABELS[p]}
              </FilterPill>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">Category</span>
            <button
              type="button"
              onClick={() => setCategories(allCategoriesSelected ? new Set() : new Set(ALL_CATEGORIES))}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              {allCategoriesSelected ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((c) => (
              <FilterPill key={c} active={categories.has(c)} onClick={() => toggleCategory(c)}>
                {CATEGORY_LABELS[c]}
              </FilterPill>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        {filtered.length} of {entries.length} entries
      </p>

      {view === "grid" ? (
        <MonthGrid entries={filtered} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No entries match this filter.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <EntryCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
