// Monthly rollup: synthesizes the previous calendar month's digest_items
// into a narrative (Claude, no web search — see lib/claude.ts's
// synthesizeNarrative) plus the same itemized email sections used
// everywhere else (pipeline/email/sections.ts), sends it, and persists
// the narrative to the rollups table so the web app's Monthly tab has
// something to read that isn't just "check your email."
//
// Invoked by .github/workflows/monthly-run.yml on the 1st of each month,
// or manually via `npm run monthly`.

import { createPipelineRun, finishPipelineRun, getCalendarEntriesInRange, getDigestItemsInRange, insertRollup } from "../lib/supabase.js";
import { synthesizeNarrative, emptyUsage, mergeUsage, type NarrativeInputItem, type RunUsage } from "../lib/claude.js";
import { getPreviousMonthRange } from "../lib/dates.js";
import { buildEmailSections } from "../email/sections.js";
import { renderEmailHtml, renderEmailText } from "../email/render.js";
import { sendEmail } from "../email/send.js";
import { checkMonthlySpendGuardrail, guardrailNote } from "../lib/guardrails.js";

async function main() {
  const period = getPreviousMonthRange();
  console.log(`Starting monthly rollup for ${period.label} (${period.start} to ${period.end})`);

  const run = await createPipelineRun("monthly");
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
      `Usage: ${usage.api_calls} API call(s), ${usage.input_tokens} input tokens, ` +
        `${usage.output_tokens} output tokens. Estimated cost: $${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}).`,
    );

    const finalNarrative =
      narrative ??
      `No narrative could be generated for ${period.label} (Claude declined or returned an empty response). ` +
        `${items.length} item(s) were collected this period — see the sections below.`;

    const sections = buildEmailSections(items);
    const subject = `eMarketScope — Monthly Rollup: ${period.label}`;
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
      rollup_type: "monthly",
      period_start: period.start,
      period_end: period.end,
      period_label: period.label,
      narrative: finalNarrative,
      investor_signal: null,
      email_sent: emailResult.sent,
      email_error: emailResult.sent ? null : (emailResult.reason ?? null),
    });

    const notes =
      `period=${period.label} items=${items.length} calendar_entries=${calendarEntries.length} | ` +
      `api_calls=${usage.api_calls} input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
      `est_cost_usd=${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}) | email_sent=${emailResult.sent}`;
    await finishPipelineRun(run.id, "success", {
      itemsFound: items.length,
      notes,
      estimatedCostUsd: usage.estimated_cost_usd,
    });
    console.log("Monthly rollup complete.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Monthly rollup failed: ${message}`);
    await finishPipelineRun(run.id, "failed", { notes: message, estimatedCostUsd: usage.estimated_cost_usd });
    process.exitCode = 1;
  }
}

main();
