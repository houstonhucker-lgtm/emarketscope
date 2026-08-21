// Runs daily. For each retailer: if today is within a few days after
// their known/estimated earnings date and it hasn't been checked yet,
// runs a targeted single-retailer investor-signal search and writes
// real items. Once a period is checked, immediately seeds a rough
// estimate for the *next* period so there's always a frontier row, then
// periodically (throttled, not every day) tries to firm that estimate
// up into a real confirmed date via a narrow schedule lookup, well
// before it's actually needed.
//
// This is what makes investor-signal collection genuinely date-driven
// instead of depending on quarterly's own fixed cadence happening to
// land near a real report -- earnings dates are public knowledge,
// announced weeks in advance, so there's no reason to rely on generic
// search timing for this the way the rest of the pipeline reasonably
// does for less predictable content.
//
// Invoked by .github/workflows/investor-check.yml on a daily cron, or
// manually via `npm run investor-check`.

import {
  createPipelineRun,
  finishPipelineRun,
  getAllExistingSourceUrls,
  getLatestEarningsDate,
  insertEarningsDate,
  markEarningsDateChecked,
  updateEarningsDate,
} from "../lib/supabase.js";
import {
  emptyUsage,
  findNextEarningsDate,
  mergeUsage,
  searchInvestorSignalForRetailer,
  type RunUsage,
} from "../lib/claude.js";
import { checkMonthlySpendGuardrail, guardrailNote } from "../lib/guardrails.js";
import { writeInvestorItems } from "./write.js";
import type { Retailer } from "../lib/types.js";

const RETAILERS: Retailer[] = ["walmart", "amazon", "target"];
// "A day or two" per spec, with a little slack for weekends/a job that
// didn't run one day -- checks daily starting 1 day after the expected
// date, up to this many days, then gives up and moves on rather than
// retrying forever if nothing's ever found.
const CONTENT_CHECK_WINDOW_DAYS = 4;
// Once a period is checked, the next one starts as a rough estimate;
// don't re-attempt confirming it more than once a week -- real dates
// are usually announced weeks ahead, so daily retries would just be
// wasted paid searches most of the time.
const DISCOVERY_REFRESH_THROTTLE_DAYS = 7;
// Rough placeholder for "next period," refined by discovery well before
// it's needed -- not meant to be precise, just a starting frontier.
const TYPICAL_CADENCE_DAYS = 91;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextPeriodLabel(label: string): string {
  const match = label.match(/^Q(\d)\s+(\d{4})$/);
  if (!match) return `${label} (next)`; // defensive -- shouldn't happen for our own generated labels
  const quarter = Number(match[1]);
  const year = Number(match[2]);
  return quarter === 4 ? `Q1 ${year + 1}` : `Q${quarter + 1} ${year}`;
}

async function processRetailer(
  retailer: Retailer,
  runId: string,
  usage: RunUsage,
  today: string,
): Promise<string> {
  const latest = await getLatestEarningsDate(retailer);

  if (!latest) {
    // Never seeded at all -- shouldn't happen once the table has real
    // rows for all three retailers, but handle it rather than crash.
    const { result, usage: lookupUsage } = await findNextEarningsDate(retailer, addDays(today, -90));
    mergeUsage(usage, lookupUsage);
    if (result.found && result.expected_report_date && result.fiscal_period_label) {
      await insertEarningsDate({
        retailer,
        fiscal_period_label: result.fiscal_period_label,
        expected_report_date: result.expected_report_date,
        confirmed: true,
      });
      return `${retailer}: bootstrapped with confirmed date ${result.expected_report_date}`;
    }
    await insertEarningsDate({
      retailer,
      fiscal_period_label: `estimate from ${today}`,
      expected_report_date: addDays(today, TYPICAL_CADENCE_DAYS),
      confirmed: false,
    });
    return `${retailer}: bootstrapped with an unconfirmed estimate (discovery found nothing)`;
  }

  if (!latest.checked_at) {
    const daysSince = daysBetween(latest.expected_report_date, today);
    if (daysSince < 1) {
      return `${retailer}: waiting, ${latest.expected_report_date} not yet reached`;
    }

    const { items, usage: searchUsage } = await searchInvestorSignalForRetailer(
      retailer,
      latest.fiscal_period_label,
      latest.expected_report_date,
    );
    mergeUsage(usage, searchUsage);

    const isLastChance = daysSince >= CONTENT_CHECK_WINDOW_DAYS;
    if (items.length === 0 && !isLastChance) {
      // Still inside the window -- leave checked_at null, retry tomorrow.
      return `${retailer}: checked (day ${daysSince} after ${latest.expected_report_date}), nothing yet, will retry`;
    }

    const existingUrls = await getAllExistingSourceUrls();
    const newItems = items.filter((item) => !existingUrls.has(item.source_url));
    const written = await writeInvestorItems(newItems, runId);
    await markEarningsDateChecked(latest.id);

    // Seed the next period's frontier row immediately so there's always
    // one pending row per retailer.
    await insertEarningsDate({
      retailer,
      fiscal_period_label: nextPeriodLabel(latest.fiscal_period_label),
      expected_report_date: addDays(latest.expected_report_date, TYPICAL_CADENCE_DAYS),
      confirmed: false,
    });

    return `${retailer}: collected ${items.length} item(s) (${written} new) for ${latest.fiscal_period_label}, seeded next period estimate`;
  }

  // Current period already checked -- try to firm up the next (already
  // seeded) period's estimate into a confirmed real date, throttled.
  if (!latest.confirmed) {
    const daysSinceUpdate = daysBetween(latest.updated_at.slice(0, 10), today);
    if (daysSinceUpdate < DISCOVERY_REFRESH_THROTTLE_DAYS) {
      return `${retailer}: next date still estimated (${latest.expected_report_date}), refresh throttled`;
    }
    const { result, usage: lookupUsage } = await findNextEarningsDate(retailer, today);
    mergeUsage(usage, lookupUsage);
    if (result.found && result.expected_report_date && result.fiscal_period_label) {
      await updateEarningsDate(latest.id, {
        expected_report_date: result.expected_report_date,
        fiscal_period_label: result.fiscal_period_label,
        confirmed: true,
      });
      return `${retailer}: confirmed next date ${result.expected_report_date} (was estimated ${latest.expected_report_date})`;
    }
    await updateEarningsDate(latest.id, {}); // touch updated_at to throttle the next attempt
    return `${retailer}: discovery attempt found nothing yet, will retry in ${DISCOVERY_REFRESH_THROTTLE_DAYS}d`;
  }

  return `${retailer}: waiting for confirmed date ${latest.expected_report_date}`;
}

async function main() {
  const today = todayStr();
  console.log(`Starting investor-check for ${today}`);

  const run = await createPipelineRun("investor_check");
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
  let totalWritten = 0;

  try {
    for (const retailer of RETAILERS) {
      const note = await processRetailer(retailer, run.id, usage, today);
      console.log(note);
      notes.push(note);
      const writtenMatch = note.match(/\((\d+) new\)/);
      if (writtenMatch) totalWritten += Number(writtenMatch[1]);
    }

    const summary =
      `${notes.join(" | ")} | api_calls=${usage.api_calls} input_tokens=${usage.input_tokens} ` +
      `output_tokens=${usage.output_tokens} web_searches=${usage.web_search_requests} ` +
      `est_cost_usd=${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis})`;
    await finishPipelineRun(run.id, "success", {
      itemsFound: totalWritten,
      notes: summary,
      estimatedCostUsd: usage.estimated_cost_usd,
    });
    console.log(`Investor-check complete. ${totalWritten} new item(s) written, $${usage.estimated_cost_usd.toFixed(4)}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Investor-check failed: ${message}`);
    await finishPipelineRun(run.id, "failed", {
      notes: `${notes.join(" | ")} | error: ${message}`,
      estimatedCostUsd: usage.estimated_cost_usd,
    });
    process.exitCode = 1;
  }
}

main();
