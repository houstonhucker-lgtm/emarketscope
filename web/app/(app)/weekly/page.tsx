import { createClient } from "@/lib/supabase/server";
import ItemCard from "@/components/ItemCard";
import type { DigestItem } from "@/lib/types";

export default async function WeeklyPage() {
  const supabase = await createClient();
  // Ongoing items only -- backfill items get their own reviewable batch
  // (Phase 5) so they don't drown out what's actually new this week.
  const { data, error } = await supabase
    .from("digest_items")
    .select("*")
    .eq("is_backfill", false)
    .order("week_of", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<DigestItem[]>();

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">Failed to load: {error.message}</p>;
  }

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nothing here yet — the weekly pipeline hasn&apos;t run, or hasn&apos;t found anything new.
      </p>
    );
  }

  const byWeek = new Map<string, DigestItem[]>();
  for (const item of items) {
    const bucket = byWeek.get(item.week_of) ?? [];
    bucket.push(item);
    byWeek.set(item.week_of, bucket);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...byWeek.entries()].map(([weekOf, weekItems]) => (
        <section key={weekOf}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Week of {weekOf}
          </h2>
          <div className="flex flex-col gap-3">
            {weekItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
