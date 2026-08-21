// Sends a failure-alert email when a scheduled workflow step fails. Wired
// as an `if: failure()` step in .github/workflows/{weekly,monthly,
// quarterly}-run.yml, right after that workflow's run step -- invoked as
// `npm run notify-failure -- weekly` (run_type is the one CLI arg).
//
// Reads the most recent pipeline_runs row of that type instead of needing
// GitHub Actions to thread log output through: the run script itself
// already wrote a 'failed' row with a clear notes field before exiting
// non-zero (see lib/supabase.ts's finishPipelineRun and each script's
// catch block). This step's own job is just: look that row up, email it.
//
// Best-effort like everything else touching email -- if the alert send
// itself fails, this still exits non-zero (so the Actions run is visibly
// red either way) rather than throwing past its own handling.

import { supabase } from "../lib/supabase.js";
import { sendEmail } from "../email/send.js";
import type { RunType } from "../lib/types.js";

const VALID_RUN_TYPES: RunType[] = [
  "weekly",
  "monthly",
  "quarterly",
  "backfill",
  "scope_proposal",
  "investor_check",
];

async function main() {
  const runType = process.argv[2] as RunType | undefined;
  if (!runType || !VALID_RUN_TYPES.includes(runType)) {
    console.error(`Usage: notify-failure <${VALID_RUN_TYPES.join("|")}>`);
    process.exitCode = 1;
    return;
  }

  const { data: run, error } = await supabase
    .from("pipeline_runs")
    .select("id, status, started_at, finished_at, notes")
    .eq("run_type", runType)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`Could not look up latest ${runType} run: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const subject = `eMarketScope — ${runType} run FAILED`;
  let detail: string;
  if (!run) {
    detail = `No pipeline_runs row exists for run_type=${runType} at all -- the process likely crashed before it could even create one (e.g. npm ci, a missing env var read at import time).`;
  } else if (run.status === "failed") {
    detail =
      `Run ${run.id}\nStarted: ${run.started_at}\nFinished: ${run.finished_at ?? "(did not finish)"}\n\n` +
      `Notes:\n${run.notes ?? "(none)"}`;
  } else {
    // The Actions step failed for a reason that never reached
    // finishPipelineRun (a crash, an unhandled rejection, an npm ci
    // failure) -- still worth alerting, just without run-specific detail.
    detail =
      `The GitHub Actions step for "${runType}" failed, but the most recent pipeline_runs row (${run.id}) shows ` +
      `status=${run.status}, not 'failed'. This likely means the process crashed before it could record its own ` +
      `failure -- check the Actions log for the real error.`;
  }

  const text = `${subject}\n\n${detail}\n\nCheck the GitHub Actions log for full output.`;
  const html = `<h2>${subject}</h2><pre style="white-space:pre-wrap">${detail.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre><p>Check the GitHub Actions log for full output.</p>`;

  const result = await sendEmail(subject, html, text);
  if (result.sent) {
    console.log("Failure alert email sent.");
  } else {
    console.warn(`Failure alert email not sent (${result.reason}). Rendered to ${result.localFallbackPath ?? "n/a"}.`);
  }
}

main();
