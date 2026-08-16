"use client";

import { useMemo, useState } from "react";
import { PILLAR_COLOR_VAR } from "@/lib/colors";
import { CATEGORY_LABELS, PILLAR_LABELS, type Category, type CalendarEntry, type Pillar } from "@/lib/types";

const ALL_PILLARS = Object.keys(PILLAR_LABELS) as Pillar[];
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

const RETAILER_LABELS: Record<string, string> = {
  walmart: "Walmart",
  amazon: "Amazon",
  target: "Target",
};

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

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No entries match this filter.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              style={{ borderLeft: `3px solid ${PILLAR_COLOR_VAR[entry.pillar]}` }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {entry.event_date}
                  {entry.event_date_end && entry.event_date_end !== entry.event_date
                    ? ` – ${entry.event_date_end}`
                    : ""}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {entry.retailers.map((r) => RETAILER_LABELS[r] ?? r).join(", ")}
                </span>
              </div>
              <h3 className="mb-1 font-medium text-neutral-900 dark:text-neutral-100">{entry.title}</h3>
              {entry.description && (
                <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">{entry.description}</p>
              )}
              <div className="mb-2 flex flex-wrap gap-1">
                {entry.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
                  >
                    {CATEGORY_LABELS[c]}
                  </span>
                ))}
              </div>
              <a
                href={entry.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {entry.source_name ?? "Source"} &rarr;
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
