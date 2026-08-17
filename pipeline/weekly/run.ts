// Orchestrates one weekly pipeline run: search -> judge -> write, logged
// as a pipeline_runs row throughout. Invoked by .github/workflows/
// weekly-run.yml on a cron schedule, or manually via `npm run weekly`
// (needs .env populated locally) / workflow_dispatch in Actions.

import {
  createPipelineRun,
  finishPipelineRun,
  getActiveKnownSources,
  getActiveScopeProfile,
  getExistingSourceUrlsForWeek,
} from "../lib/supabase.js";
import { search } from "./search.js";
import { judge } from "./judge.js";
import { write } from "./write.js";
import { getWeekOf } from "../lib/dates.js";
import { ingestInbox } from "../feedback/ingest-inbox.js";
import { runSourceAudits } from "../feedback/source-audit.js";
import { mergeUsage } from "../lib/claude.js";

async function main() {
  const weekOf = getWeekOf();
  console.log(`Starting weekly run for week_of=${weekOf}`);

  const run = await createPipelineRun("weekly");
  console.log(`pipeline_runs.id = ${run.id}`);

  // Best-effort, same pattern as email/send.ts — an unconfigured or
  // failing inbox/audit step never fails the run over the main
  // search+judge+write path. This is how "forward something during the
  // day, it folds into the next run" actually happens: both freshly
  // ingested items and anything still pending from the Capture web form
  // get audited every weekly run.
  let inboxIngested = 0;
  try {
    const ingestResult = await ingestInbox();
    inboxIngested = ingestResult.ingested;
    if (!ingestResult.skipped) {
      console.log(`Inbox ingestion: ${ingestResult.ingested} new forwarded item(s).`);
    }
  } catch (err) {
    console.warn(`Inbox ingestion failed, continuing: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const [scopeProfileVersion, knownSources, existingSourceUrls] = await Promise.all([
      getActiveScopeProfile(),
      getActiveKnownSources(),
      getExistingSourceUrlsForWeek(weekOf),
    ]);

    console.log(
      `Loaded scope profile v${scopeProfileVersion.version}, ${knownSources.length} known sources.`,
    );

    const { items: candidates, usage } = await search(scopeProfileVersion.content, knownSources, weekOf);
    console.log(`Claude returned ${candidates.length} candidate item(s).`);
    console.log(
      `Usage: ${usage.api_calls} API call(s), ${usage.input_tokens} input tokens, ` +
        `${usage.output_tokens} output tokens, ${usage.cache_creation_input_tokens} cache-write tokens, ` +
        `${usage.cache_read_input_tokens} cache-read tokens, ${usage.web_search_requests} web searches. ` +
        `Estimated cost: $${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis} Sonnet 5 pricing).`,
    );

    const { validated, rejected } = judge(candidates, existingSourceUrls);
    if (rejected.length > 0) {
      console.log(`Rejected ${rejected.length} candidate(s):`);
      for (const r of rejected) {
        console.log(`  - "${r.item.title}": ${r.reason}`);
      }
    }

    const itemsWritten = await write(validated, run.id, weekOf);
    console.log(`Wrote ${itemsWritten} digest item(s).`);

    // Same best-effort treatment as inbox ingestion above.
    let auditNote = "audit=skipped";
    try {
      const auditResult = await runSourceAudits();
      mergeUsage(usage, auditResult.usage);
      if (auditResult.processed > 0) {
        console.log(
          `Source-coverage audit: ${auditResult.processed} item(s) processed ` +
            `(${auditResult.findable} independently findable, ${auditResult.notFindable} not, ` +
            `${auditResult.candidatesFlagged} candidate source(s) flagged).`,
        );
      }
      auditNote =
        `audit_processed=${auditResult.processed} audit_findable=${auditResult.findable} ` +
        `audit_not_findable=${auditResult.notFindable} audit_candidates_flagged=${auditResult.candidatesFlagged}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Source-coverage audit failed, continuing: ${message}`);
      auditNote = `audit_error=${message}`;
    }

    const notes =
      `candidates=${candidates.length} validated=${validated.length} rejected=${rejected.length} | ` +
      `api_calls=${usage.api_calls} input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
      `cache_write=${usage.cache_creation_input_tokens} cache_read=${usage.cache_read_input_tokens} ` +
      `web_searches=${usage.web_search_requests} est_cost_usd=${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}) | ` +
      `inbox_ingested=${inboxIngested} | ${auditNote}`;
    await finishPipelineRun(run.id, "success", itemsWritten, notes);
    console.log("Weekly run complete.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Weekly run failed: ${message}`);
    await finishPipelineRun(run.id, "failed", null, message);
    process.exitCode = 1;
  }
}

main();
