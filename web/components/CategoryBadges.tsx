import { CATEGORY_LABELS, type Category } from "@/lib/types";

// Deliberately neutral, not hue-coded — see lib/colors.ts header comment
// for why (5-way hue coding fails the dataviz validator's normal-vision
// floor). Fully filterable via the category name; just not claiming a
// false level of colorblind-safe visual distinction between categories.
export default function CategoryBadges({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((c) => (
        <span
          key={c}
          className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
        >
          {CATEGORY_LABELS[c]}
        </span>
      ))}
    </div>
  );
}
