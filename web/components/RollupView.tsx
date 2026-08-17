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

export default async function RollupView({ rollupType }: { rollupType: "monthly" | "quarterly" }) {
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

  const [latest, ...older] = list;

  const { data: items } = await supabase
    .from("digest_items")
    .select("*")
    .eq("is_backfill", false)
    .gte("week_of", latest.period_start)
    .lt("week_of", latest.period_end)
    .order("week_of", { ascending: true })
    .returns<DigestItem[]>();

  const periodItems = items ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{latest.period_label}</h2>
          {!latest.email_sent && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-400">
              email not sent{latest.email_error ? `: ${latest.email_error}` : ""}
            </span>
          )}
        </div>
        <NarrativeBlock text={latest.narrative} />
      </section>

      {latest.rollup_type === "quarterly" && latest.investor_signal && latest.investor_signal.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Investor & Earnings Signal
          </h3>
          <div className="flex flex-col gap-3">
            {latest.investor_signal.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  {item.retailer}
                </div>
                <h4 className="mb-1 font-medium text-neutral-900 dark:text-neutral-100">{item.title}</h4>
                <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">{item.summary}</p>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {item.source_name ?? "Source"} &rarr;
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {older.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
            Past {rollupType} rollups
          </h3>
          <div className="flex flex-col gap-2">
            {older.map((rollup) => (
              <details
                key={rollup.id}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <summary className="cursor-pointer text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {rollup.period_label}
                </summary>
                <div className="mt-3">
                  <NarrativeBlock text={rollup.narrative} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
