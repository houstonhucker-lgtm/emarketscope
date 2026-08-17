// Quarterly rollup: same shape as monthly (see monthly/synthesize.ts),
// over the previous calendar quarter, plus the one section monthly never
// gets — Investor & Earnings Signal, from a dedicated web-search call
// (lib/claude.ts's searchInvestorSignal) since shareholder letters and
// earnings call commentary aren't already sitting in digest_items the
// way weekly-collected items are.
//
// Invoked by .github/workflows/quarterly-run.yml on the 1st of
// Jan/Apr/Jul/Oct, or manually via `npm run quarterly`.

import {
  createPipelineRun,
  finishPipelineRun,
  getCalendarEntriesInRange,
  getDigestItemsInRange,
  insertRollup,
} from "../lib/supabase.js";
import {
  emptyUsage,
  mergeUsage,
  searchInvestorSignal,
  synthesizeNarrative,
  type NarrativeInputItem,
  type RunUsage,
} from "../lib/claude.js";
import { getPreviousQuarterRange } from "../lib/dates.js";
import { buildEmailSections, type EmailSectionItem } from "../email/sections.js";
import { renderEmailHtml, renderEmailText } from "../email/render.js";
import { sendEmail } from "../email/send.js";
import { checkMonthlySpendGuardrail, guardrailNote } from "../lib/guardrails.js";

async function main() {
  const period = getPreviousQuarterRange();
  console.log(`Starting quarterly rollup for ${period.label} (${period.start} to ${period.end})`);

  const run = await createPipelineRun("quarterly");
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

  try {
    const [items, calendarEntries] = await Promise.all([
      getDigestItemsInRange(period.start, period.end),
      getCalendarEntriesInRange(period.start, period.end),
    ]);
    console.log(`Loaded ${items.length} digest item(s), ${calendarEntries.length} calendar entr(y/ies).`);

    const narrativeInput: NarrativeInputItem[] = items.map((item) => ({
      title: item.title,
      summary: item.summary,
      pillar: item.pillar,
      categories: item.categories,
      retailers: item.retailers,
      date: item.week_of,
    }));

    const { narrative, usage: narrativeUsage } = await synthesizeNarrative(narrativeInput, period.label);
    mergeUsage(usage, narrativeUsage);
    console.log(
      `Narrative usage: ${usage.api_calls} API call(s), $${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}).`,
    );

    const { items: investorItems, usage: investorUsage } = await searchInvestorSignal(
      period.label,
      period.start,
      period.end,
    );
    mergeUsage(usage, investorUsage);
    console.log(
      `Investor signal: ${investorItems.length} item(s), ${investorUsage.web_search_requests} web searches. ` +
        `Total usage so far: $${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}).`,
    );

    const finalNarrative =
      narrative ??
      `No narrative could be generated for ${period.label} (Claude declined or returned an empty response). ` +
        `${items.length} item(s) were collected this period — see the sections below.`;

    const investorSectionItems: EmailSectionItem[] = investorItems.map((item) => ({
      title: item.title,
      body: item.summary,
      source_url: item.source_url,
      source_name: item.source_name ?? null,
    }));

    const sections = buildEmailSections(items, investorSectionItems);
    const subject = `eMarketScope — Quarterly Rollup: ${period.label}`;
    const html = renderEmailHtml(subject, sections, finalNarrative);
    const text = renderEmailText(subject, sections, finalNarrative);
    const emailResult = await sendEmail(subject, html, text);
    if (emailResult.sent) {
      console.log("Rollup email sent.");
    } else {
      console.log(`Rollup email not sent (${emailResult.reason}).`);
    }

    await insertRollup({
      run_id: run.id,
      rollup_type: "quarterly",
      period_start: period.start,
      period_end: period.end,
      period_label: period.label,
      narrative: finalNarrative,
      investor_signal: investorItems.length > 0 ? investorItems : null,
      email_sent: emailResult.sent,
      email_error: emailResult.sent ? null : (emailResult.reason ?? null),
    });

    const notes =
      `period=${period.label} items=${items.length} calendar_entries=${calendarEntries.length} ` +
      `investor_items=${investorItems.length} | ` +
      `api_calls=${usage.api_calls} input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
      `web_searches=${usage.web_search_requests} est_cost_usd=${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}) | ` +
      `email_sent=${emailResult.sent}`;
    await finishPipelineRun(run.id, "success", {
      itemsFound: items.length,
      notes,
      estimatedCostUsd: usage.estimated_cost_usd,
    });
    console.log("Quarterly rollup complete.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Quarterly rollup failed: ${message}`);
    await finishPipelineRun(run.id, "failed", { notes: message, estimatedCostUsd: usage.estimated_cost_usd });
    process.exitCode = 1;
  }
}

main();
