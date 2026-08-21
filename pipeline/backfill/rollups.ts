// One-time retroactive backfill of monthly/quarterly rollups over the
// already-backfilled historical digest_items (see historical.ts). The
// original 2-year backfill produced raw items but never generated
// rollup summaries for that history -- this closes that gap so the
// Weekly/Monthly/Quarterly tabs have real depth to page through, not
// just whatever's run since the pipeline went live.
//
// Reuses the same no-web-search narrative synthesis every live
// monthly/quarterly job uses (synthesizeNarrative), just pointed at
// backfilled data instead of live data -- no new search, near-zero
// cost per period, same as the original monthly test.
//
// Investor & Earnings is deliberately NOT backfilled here: that
// mechanism is new and forward-looking (investor/daily-check.ts, keyed
// off each retailer's actual known report dates), not something that
// makes sense to retroactively fabricate for 2024-2025. This falls out
// naturally without special-casing -- no backfilled digest_items row
// has ever had pillar "investor_earnings" (that pillar didn't exist
// until this session), so every period's investor_signal is correctly
// null.
//
// Periods that already have a rollup (checked via rollupExists) are
// skipped, not merged or overwritten -- see this script's own run notes
// for exactly which periods were skipped and why real data made that
// the safer call here.
//
// Invoked manually via `npm run backfill-rollups` -- launch-time job,
// not on any cron, same as historical.ts.

import {
  createPipelineRun,
  finishPipelineRun,
  getAllBackfillWeekOfs,
  getBackfillDigestItemsInRange,
  insertRollup,
  rollupExists,
} from "../lib/supabase.js";
import { emptyUsage, mergeUsage, synthesizeNarrative, type NarrativeInputItem, type RunUsage } from "../lib/claude.js";
import { checkMonthlySpendGuardrail, guardrailNote } from "../lib/guardrails.js";
import type { DigestItemRow } from "../lib/types.js";

interface PeriodRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, exclusive
  label: string;
}

function monthRange(year: number, month: number): PeriodRange {
  // month is 1-indexed
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label };
}

function quarterRange(year: number, quarter: number): PeriodRange {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: `Q${quarter} ${year}` };
}

function toNarrativeInput(items: DigestItemRow[]): NarrativeInputItem[] {
  return items.map((item) => ({
    title: item.title,
    summary: item.summary,
    pillar: item.pillar,
    categories: item.categories,
    retailers: item.retailers,
    date: item.week_of,
  }));
}

async function generateRollup(
  rollupType: "monthly" | "quarterly",
  range: PeriodRange,
  runId: string,
  usage: RunUsage,
): Promise<string> {
  if (await rollupExists(rollupType, range.label)) {
    return `SKIP ${rollupType} ${range.label} (a rollup for this period already exists -- not merged/overwritten)`;
  }

  const items = await getBackfillDigestItemsInRange(range.start, range.end);
  const { narrative, usage: narrativeUsage } = await synthesizeNarrative(toNarrativeInput(items), range.label);
  mergeUsage(usage, narrativeUsage);

  const finalNarrative =
    narrative ??
    `No narrative could be generated for ${range.label} (Claude declined or returned an empty response). ` +
      `${items.length} item(s) were collected this period — see the sections below.`;

  await insertRollup({
    run_id: runId,
    rollup_type: rollupType,
    period_start: range.start,
    period_end: range.end,
    period_label: range.label,
    narrative: finalNarrative,
    investor_signal: null, // deliberately never backfilled -- see header comment
    email_sent: false,
    email_error: "retroactive rollup backfill -- not emailed",
  });

  return `${rollupType} ${range.label}: ${items.length} item(s), $${narrativeUsage.estimated_cost_usd.toFixed(4)}`;
}

async function main() {
  console.log("Starting retroactive rollups backfill...");

  const run = await createPipelineRun("rollup_backfill");
  console.log(`pipeline_runs.id = ${run.id}`);

  const guardrail = await checkMonthlySpendGuardrail();
  if (!guardrail.allowed) {
    const note = guardrailNote(guardrail);
    console.error(note);
    await finishPipelineRun(run.id, "failed", { notes: note });
    process.exitCode = 1;
    return;
  }

  const usage: RunUsage = emptyUsage();
  const notes: string[] = [];

  try {
    const weekOfs = await getAllBackfillWeekOfs();
    if (weekOfs.length === 0) {
      console.log("No backfilled digest_items found -- nothing to do.");
      await finishPipelineRun(run.id, "success", { itemsFound: 0, notes: "no backfilled items found" });
      return;
    }

    const months = new Set<string>(); // "YYYY-M" (M unpadded, for easy parsing)
    const quarters = new Set<string>(); // "YYYY-Q"
    for (const weekOf of weekOfs) {
      const d = new Date(`${weekOf}T00:00:00Z`);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      months.add(`${year}-${month}`);
      quarters.add(`${year}-${Math.ceil(month / 3)}`);
    }

    const sortedMonths = [...months].sort((a, b) => {
      const [ay, am] = a.split("-").map(Number);
      const [by, bm] = b.split("-").map(Number);
      return ay - by || am - bm;
    });
    const sortedQuarters = [...quarters].sort((a, b) => {
      const [ay, aq] = a.split("-").map(Number);
      const [by, bq] = b.split("-").map(Number);
      return ay - by || aq - bq;
    });

    console.log(`Found backfill data spanning ${sortedMonths.length} month(s), ${sortedQuarters.length} quarter(s).`);

    for (const key of sortedMonths) {
      const [year, month] = key.split("-").map(Number);
      const note = await generateRollup("monthly", monthRange(year, month), run.id, usage);
      console.log(note);
      notes.push(note);
    }

    for (const key of sortedQuarters) {
      const [year, quarter] = key.split("-").map(Number);
      const note = await generateRollup("quarterly", quarterRange(year, quarter), run.id, usage);
      console.log(note);
      notes.push(note);
    }

    const generated = notes.filter((n) => !n.startsWith("SKIP")).length;
    const skipped = notes.filter((n) => n.startsWith("SKIP")).length;
    const summary =
      `${generated} generated, ${skipped} skipped | ${notes.join(" | ")} | ` +
      `api_calls=${usage.api_calls} input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
      `est_cost_usd=${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis})`;
    await finishPipelineRun(run.id, "success", { itemsFound: generated, notes: summary, estimatedCostUsd: usage.estimated_cost_usd });
    console.log(`\nDone. ${generated} rollup(s) generated, ${skipped} skipped. Total cost: $${usage.estimated_cost_usd.toFixed(4)}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Rollup backfill failed: ${message}`);
    await finishPipelineRun(run.id, "failed", {
      notes: `${notes.join(" | ")} | error: ${message}`,
      estimatedCostUsd: usage.estimated_cost_usd,
    });
    process.exitCode = 1;
  }
}

main();
