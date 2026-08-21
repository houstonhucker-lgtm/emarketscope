import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ItemCard from "@/components/ItemCard";
import type { DigestItem } from "@/lib/types";

const WEEKS_PER_PAGE = 4;

function PageNavButton({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className =
    "rounded-md border px-2.5 py-1 text-sm font-medium " +
    (disabled
      ? "cursor-default border-neutral-200 text-neutral-300 dark:border-neutral-800 dark:text-neutral-700"
      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400");
  // Same reasoning as RollupView's PageNavButton -- a disabled Link is
  // still a real, focusable/activatable <a> even styled to look inert;
  // a plain span at the bounds is what actually removes it from tab
  // order and click/Enter activation.
  if (disabled) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const supabase = await createClient();

  // Cheap, single-column query first -- paginate over which weeks to
  // show, then fetch full items only for that page's weeks, rather than
  // fetching every item ever collected just to paginate client-side.
  // Backfill items get their own reviewable batch (Phase 5) so they
  // don't drown out what's actually new week to week.
  const { data: weekRows, error: weekError } = await supabase
    .from("digest_items")
    .select("week_of")
    .eq("is_backfill", false);

  if (weekError) {
    return <p className="text-sm text-red-600 dark:text-red-400">Failed to load: {weekError.message}</p>;
  }

  const allWeeks = [...new Set((weekRows ?? []).map((r) => r.week_of as string))].sort((a, b) =>
    b.localeCompare(a),
  );

  if (allWeeks.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Nothing here yet — the weekly pipeline hasn&apos;t run, or hasn&apos;t found anything new.
      </p>
    );
  }

  const totalPages = Math.ceil(allWeeks.length / WEEKS_PER_PAGE);
  const pageIndex = Math.min(Math.max(0, Number(pageParam) || 0), totalPages - 1);
  const pageWeeks = allWeeks.slice(pageIndex * WEEKS_PER_PAGE, (pageIndex + 1) * WEEKS_PER_PAGE);
  const hasNewer = pageIndex > 0;
  const hasOlder = pageIndex < totalPages - 1;

  const { data, error } = await supabase
    .from("digest_items")
    .select("*")
    .eq("is_backfill", false)
    .in("week_of", pageWeeks)
    .order("week_of", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<DigestItem[]>();

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">Failed to load: {error.message}</p>;
  }

  const items = data ?? [];
  const byWeek = new Map<string, DigestItem[]>();
  for (const week of pageWeeks) byWeek.set(week, []); // preserve empty weeks in the right position too
  for (const item of items) {
    const bucket = byWeek.get(item.week_of) ?? [];
    bucket.push(item);
    byWeek.set(item.week_of, bucket);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <PageNavButton href={`/weekly?page=${pageIndex - 1}`} disabled={!hasNewer}>
          &larr; Newer
        </PageNavButton>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          Weeks {pageIndex * WEEKS_PER_PAGE + 1}–{Math.min((pageIndex + 1) * WEEKS_PER_PAGE, allWeeks.length)} of{" "}
          {allWeeks.length}
        </span>
        <PageNavButton href={`/weekly?page=${pageIndex + 1}`} disabled={!hasOlder}>
          Older &rarr;
        </PageNavButton>
      </div>

      {[...byWeek.entries()].map(([weekOf, weekItems]) => (
        <section key={weekOf}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Week of {weekOf}
          </h2>
          {weekItems.length === 0 ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500">Nothing found this week.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {weekItems.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
