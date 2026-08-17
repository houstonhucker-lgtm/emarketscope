// Monthly spend guardrail (Phase 7). Checked once at the start of every
// script that's about to make a billed Claude call, before that call
// happens -- weekly/backfill/monthly/quarterly/scope-proposal all call
// this right after creating their pipeline_runs row.
//
// Unconfigured (MONTHLY_SPEND_LIMIT_USD unset, or not a valid positive
// number) means no ceiling -- same graceful-fallback posture as email/IMAP
// elsewhere in this repo: a guardrail that was never set up doesn't block
// anything, it just isn't enforced yet. This is a soft, cooperative check
// (each script has to call it), not a hard billing cutoff -- the real
// backstop is still the hard spend limit set in the Anthropic console
// per the README's Setup step.

import { getMonthToDateSpendUsd } from "./supabase.js";

export interface SpendGuardrailResult {
  allowed: boolean;
  limitUsd: number | null;
  monthToDateUsd: number;
}

function parseLimit(): number | null {
  const raw = process.env.MONTHLY_SPEND_LIMIT_USD;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `MONTHLY_SPEND_LIMIT_USD="${raw}" is not a valid positive number -- guardrail disabled for this run.`,
    );
    return null;
  }
  return parsed;
}

export async function checkMonthlySpendGuardrail(): Promise<SpendGuardrailResult> {
  const limitUsd = parseLimit();
  const monthToDateUsd = await getMonthToDateSpendUsd();
  return {
    allowed: limitUsd === null || monthToDateUsd < limitUsd,
    limitUsd,
    monthToDateUsd,
  };
}

// Formats the standard "why this run was blocked" note, shared across all
// call sites so pipeline_runs.notes reads consistently and is easy to
// grep for guardrail trips specifically.
export function guardrailNote(result: SpendGuardrailResult): string {
  return (
    `GUARDRAIL: month-to-date spend $${result.monthToDateUsd.toFixed(4)} has reached or exceeded ` +
    `MONTHLY_SPEND_LIMIT_USD=$${(result.limitUsd ?? 0).toFixed(2)}. Skipped this run's Claude call(s) ` +
    `to avoid exceeding the limit. Raise the limit or wait for next month to resume.`
  );
}
