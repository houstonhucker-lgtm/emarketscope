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
const CHUNK_RETRY_ATTEMPTS = 3;
const CHUNK_RETRY_BASE_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries a chunk on top of the SDK's own retry/backoff (lib/claude.ts
// maxRetries) — this is the second layer, for when a chunk fails even
// after those. Backoff: 10s, 20s, 40s.
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CHUNK_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < CHUNK_RETRY_ATTEMPTS) {
        const delay = CHUNK_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `${label} failed (attempt ${attempt}/${CHUNK_RETRY_ATTEMPTS}): ${message}. Retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

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
  const failedChunks: { chunk: string; error: string }[] = [];

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

      // A chunk that fails even after retries is logged and skipped — it
      // does not abort the other 7. This is a one-time job with no weekly
      // do-over, so losing everything to one transient error on chunk 2 of
      // 8 (as happened in testing) is worse than shipping a slightly
      // incomplete backfill and noting the gap.
      //
      // Only the search call is retried, not judge/write — retrying the
      // whole chunk would risk a second paid search (and double-counted
      // usage/candidates) if judge or write happened to fail *after* a
      // search that already succeeded. judge/write are local/DB
      // operations with no external-API transient-failure mode to retry
      // against; if one of them throws, the chunk is skipped as-is rather
      // than silently re-spending on a fresh search.
      try {
        // Re-fetched every chunk so a chunk doesn't duplicate something an
        // earlier chunk in this same run just wrote.
        const existingSourceUrls = await getAllExistingSourceUrls();

        const { items: candidates, usage } = await withRetry(
          `Chunk ${i + 1}/${chunks.length} search`,
          () => searchAndJudgeBackfill(scopeProfileVersion.content, knownSources, chunk.start, chunk.end),
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Chunk ${i + 1}/${chunks.length} failed: ${message}`);
        failedChunks.push({ chunk: `${chunk.start} to ${chunk.end}`, error: message });
      }
    }

    if (failedChunks.length === chunks.length) {
      throw new Error(
        `All ${chunks.length} chunk(s) failed. Last error: ${failedChunks[failedChunks.length - 1]?.error}`,
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

    const failedChunksNote =
      failedChunks.length > 0
        ? ` | FAILED_CHUNKS(${failedChunks.length}/${chunks.length}): ${failedChunks
            .map((f) => `[${f.chunk}: ${f.error}]`)
            .join(" ")}`
        : "";
    const notes =
      `chunks=${chunks.length} candidates=${totalCandidates} written=${totalWritten} rejected=${totalRejected} | ` +
      `api_calls=${totalUsage.api_calls} input_tokens=${totalUsage.input_tokens} output_tokens=${totalUsage.output_tokens} ` +
      `cache_write=${totalUsage.cache_creation_input_tokens} cache_read=${totalUsage.cache_read_input_tokens} ` +
      `web_searches=${totalUsage.web_search_requests} est_cost_usd=${totalUsage.estimated_cost_usd.toFixed(4)} (${totalUsage.pricing_basis}) | ` +
      `email_sent=${emailResult.sent}${emailResult.reason ? ` (${emailResult.reason})` : ""}${failedChunksNote}`;
    await finishPipelineRun(run.id, "success", totalWritten, notes);

    console.log(
      `\nBackfill complete. ${totalWritten} item(s) written across ${chunks.length - failedChunks.length}/${chunks.length} chunk(s). ` +
        `Total estimated cost: $${totalUsage.estimated_cost_usd.toFixed(4)}.`,
    );
    if (failedChunks.length > 0) {
      console.warn(
        `\n${failedChunks.length} chunk(s) failed even after retries and were skipped:\n` +
          failedChunks.map((f) => `  - ${f.chunk}: ${f.error}`).join("\n") +
          `\nRe-run with BACKFILL_MONTHS/BACKFILL_MONTHS_PER_CHUNK scoped to just that window to fill the gap.`,
      );
    }
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
