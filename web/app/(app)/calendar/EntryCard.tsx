// Extracted verbatim from CalendarView's previous inline <li> markup so
// both the List view and the Grid view's day-expansion render entries
// through the exact same component -- not a rebuild, not a duplicate.

import { PILLAR_COLOR_VAR, isHueCodedPillar } from "@/lib/colors";
import { CATEGORY_LABELS, type CalendarEntry } from "@/lib/types";
import PillarBadge from "@/components/PillarBadge";

const RETAILER_LABELS: Record<string, string> = {
  walmart: "Walmart",
  amazon: "Amazon",
  target: "Target",
};

// investor_earnings has no hue slot (see lib/colors.ts) -- the card's
// border falls back to a neutral tone rather than a competing color.
const NEUTRAL_BORDER = "var(--pillar-investor-pattern-a)";

export default function EntryCard({ entry }: { entry: CalendarEntry }) {
  const borderColor = isHueCodedPillar(entry.pillar) ? PILLAR_COLOR_VAR[entry.pillar] : NEUTRAL_BORDER;
  return (
    <div
      className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <PillarBadge pillar={entry.pillar} />
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {entry.retailers.map((r) => RETAILER_LABELS[r] ?? r).join(", ")}
        </span>
      </div>
      <div className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {entry.event_date}
        {entry.event_date_end && entry.event_date_end !== entry.event_date ? ` – ${entry.event_date_end}` : ""}
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
    </div>
  );
}
