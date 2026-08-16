// One-time historical backfill: reuses the same search+judge machinery as
// the weekly pipeline (lib/claude.ts, weekly/judge.ts), scoped to
// prompts/backfill.md's lighter-touch instructions, run in date-range
// chunks so no single Claude call is asked to cover ~2 years at once.
//
// Invoked manually via `npm run backfill` — this is a launch-time job, not
// something on a cron schedule.

import { mergeUsage, emptyUsage, searchAndJudgeBackfill, type RunUsage } from "../lib/claude.js";
import { chunkDateRange } from "../lib/dates.js";
import {
  createPipelineRun,
  finishPipelineRun,
  getActiveKnownSources,
  getActiveScopeProfile,
  getAllExistingSourceUrls,
} from "../lib/supabase.js";
import { judge } from "../weekly/judge.js";
import { writeBackfill } from "./write.js";
import { buildEmailSections } from "../email/sections.js";
import { renderEmailHtml, renderEmailText } from "../email/render.js";
import { sendDigestEmail } from "../email/send.js";
import type { ValidatedItem } from "../lib/types.js";

const BACKFILL_MONTHS = Number(process.env.BACKFILL_MONTHS ?? 24);
const MONTHS_PER_CHUNK = Number(process.env.BACKFILL_MONTHS_PER_CHUNK ?? 3);

async function main() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - BACKFILL_MONTHS);
  const chunks = chunkDateRange(start, now, MONTHS_PER_CHUNK);

  console.log(
    `Backfilling ${chunks.length} chunk(s) covering ${start.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)} ` +
      `(${MONTHS_PER_CHUNK} month(s) per chunk).`,
  );

  const run = await createPipelineRun("backfill");
  console.log(`pipeline_runs.id = ${run.id}`);

  const totalUsage: RunUsage = emptyUsage();
  let totalCandidates = 0;
  let totalRejected = 0;
  let totalWritten = 0;
  const allValidatedItems: ValidatedItem[] = [];

  try {
    const [scopeProfileVersion, knownSources] = await Promise.all([
      getActiveScopeProfile(),
      getActiveKnownSources(),
    ]);
    console.log(
      `Loaded scope profile v${scopeProfileVersion.version}, ${knownSources.length} known sources.`,
    );

    for (const [i, chunk] of chunks.entries()) {
      console.log(`\n--- Chunk ${i + 1}/${chunks.length}: ${chunk.start} to ${chunk.end} ---`);

      // Re-fetched every chunk so a chunk doesn't duplicate something an
      // earlier chunk in this same run just wrote.
      const existingSourceUrls = await getAllExistingSourceUrls();

      const { items: candidates, usage } = await searchAndJudgeBackfill(
        scopeProfileVersion.content,
        knownSources,
        chunk.start,
        chunk.end,
      );
      totalCandidates += candidates.length;
      mergeUsage(totalUsage, usage);

      const { validated, rejected } = judge(candidates, existingSourceUrls);
      totalRejected += rejected.length;
      for (const r of rejected) {
        console.log(`  rejected "${r.item.title}": ${r.reason}`);
      }

      const written = await writeBackfill(validated, run.id, chunk.start);
      totalWritten += written;
      allValidatedItems.push(...validated);

      console.log(
        `Chunk ${i + 1}: ${candidates.length} candidate(s) -> ${written} written. ` +
          `Running total cost: $${totalUsage.estimated_cost_usd.toFixed(4)}.`,
      );
    }

    // One real summary email of everything found across the whole backfill
    // (per spec) — not a per-chunk email. Best-effort: a failed/unconfigured
    // send does not fail the run, since the database writes above already
    // succeeded and are the source of truth.
    console.log(`\nBuilding summary email for ${allValidatedItems.length} item(s)...`);
    const sections = buildEmailSections(allValidatedItems);
    const rangeLabel = `${start.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`;
    const subject = `eMarketScope — Historical Backfill Summary (${rangeLabel})`;
    const html = renderEmailHtml(subject, sections);
    const text = renderEmailText(subject, sections);
    const emailResult = await sendDigestEmail(subject, html, text);
    if (emailResult.sent) {
      console.log("Summary email sent.");
    } else {
      console.log(`Summary email not sent (${emailResult.reason}).`);
    }

    const notes =
      `chunks=${chunks.length} candidates=${totalCandidates} written=${totalWritten} rejected=${totalRejected} | ` +
      `api_calls=${totalUsage.api_calls} input_tokens=${totalUsage.input_tokens} output_tokens=${totalUsage.output_tokens} ` +
      `cache_write=${totalUsage.cache_creation_input_tokens} cache_read=${totalUsage.cache_read_input_tokens} ` +
      `web_searches=${totalUsage.web_search_requests} est_cost_usd=${totalUsage.estimated_cost_usd.toFixed(4)} (${totalUsage.pricing_basis}) | ` +
      `email_sent=${emailResult.sent}${emailResult.reason ? ` (${emailResult.reason})` : ""}`;
    await finishPipelineRun(run.id, "success", totalWritten, notes);

    console.log(
      `\nBackfill complete. ${totalWritten} item(s) written across ${chunks.length} chunk(s). ` +
        `Total estimated cost: $${totalUsage.estimated_cost_usd.toFixed(4)}.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Backfill failed: ${message}`);
    await finishPipelineRun(
      run.id,
      "failed",
      totalWritten,
      `${message} | partial progress: written=${totalWritten}, est_cost_usd=${totalUsage.estimated_cost_usd.toFixed(4)}`,
    );
    process.exitCode = 1;
  }
}

main();
