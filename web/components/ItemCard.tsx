import PillarBadge from "./PillarBadge";
import CategoryBadges from "./CategoryBadges";
import FeedbackButtons from "./FeedbackButtons";
import type { DigestItem } from "@/lib/types";

const RETAILER_LABELS: Record<string, string> = {
  walmart: "Walmart",
  amazon: "Amazon",
  target: "Target",
};

export default function ItemCard({ item }: { item: DigestItem }) {
  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <PillarBadge pillar={item.pillar} />
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {item.retailers.map((r) => RETAILER_LABELS[r] ?? r).join(", ")}
        </span>
      </div>
      <h3 className="mb-1 font-medium text-neutral-900 dark:text-neutral-100">{item.title}</h3>
      <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">{item.summary}</p>
      <CategoryBadges categories={item.categories} />
      <div className="mt-3 flex items-center justify-between gap-2">
        {/* Every item everywhere is sourced with a clickable link back to
            where it came from (spec, verbatim). */}
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {item.source_name ?? "Source"} &rarr;
        </a>
        <FeedbackButtons digestItemId={item.id} />
      </div>
    </article>
  );
}
