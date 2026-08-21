import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ItemCard from "./ItemCard";
import type { DigestItem, Rollup } from "@/lib/types";

function NarrativeBlock({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function PageNavButton({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className =
    "rounded-md border px-2.5 py-1 text-sm font-medium " +
    (disabled
      ? "cursor-default border-neutral-200 text-neutral-300 dark:border-neutral-800 dark:text-neutral-700"
      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400");
  // A disabled Link is still a real, focusable/activatable <a> even with
  // pointer-events-none styling -- rendering a plain span instead at the
  // bounds is what actually removes it from tab order and click/Enter
  // activation, not just how it looks.
  if (disabled) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

// One full period at a time -- narrative + itemized items, same full
// treatment for every period, not just the most recent -- paged via
// ?page= (0 = latest, increasing = older). Investor & earnings findings
// show up here automatically as ordinary pillar="investor_earnings"
// digest_items within this period's date range (see
// pipeline/quarterly/write.ts) rather than a separate JSONB-driven
// section, so there's no risk of showing the same finding twice.
export default async function RollupView({
  rollupType,
  basePath,
  page,
}: {
  rollupType: "monthly" | "quarterly";
  basePath: string;
  page?: string;
}) {
  const supabase = await createClient();
  const { data: rollups } = await supabase
    .from("rollups")
    .select("*")
    .eq("rollup_type", rollupType)
    .order("period_start", { ascending: false })
    .returns<Rollup[]>();

  const list = rollups ?? [];
  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No {rollupType} rollups yet — the first one lands after the {rollupType} job&apos;s next scheduled run.
        </p>
      </div>
    );
  }

  const pageIndex = Math.min(Math.max(0, Number(page) || 0), list.length - 1);
  const current = list[pageIndex];
  const hasNewer = pageIndex > 0;
  const hasOlder = pageIndex < list.length - 1;

  const { data: items } = await supabase
    .from("digest_items")
    .select("*")
    .eq("is_backfill", false)
    .gte("week_of", current.period_start)
    .lt("week_of", current.period_end)
    .order("week_of", { ascending: true })
    .returns<DigestItem[]>();

  const periodItems = items ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <PageNavButton href={`${basePath}?page=${pageIndex - 1}`} disabled={!hasNewer}>
          &larr; Newer
        </PageNavButton>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {pageIndex + 1} of {list.length}
        </span>
        <PageNavButton href={`${basePath}?page=${pageIndex + 1}`} disabled={!hasOlder}>
          Older &rarr;
        </PageNavButton>
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{current.period_label}</h2>
          {!current.email_sent && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-400">
              email not sent{current.email_error ? `: ${current.email_error}` : ""}
            </span>
          )}
        </div>
        <NarrativeBlock text={current.narrative} />
      </section>

      {periodItems.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            This period&apos;s items ({periodItems.length})
          </h3>
          <div className="flex flex-col gap-3">
            {periodItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
