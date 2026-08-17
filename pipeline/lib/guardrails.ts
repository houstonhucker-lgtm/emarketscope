// Monthly spend guardrail (Phase 7). Checked once at the start of every
// script that's about to make a billed Claude call, before that call
// happens -- weekly/backfill/monthly/quarterly/scope-proposal all call
// this right after creating their pipeline_runs row.
//
// MONTHLY_SPEND_LIMIT_USD unset entirely means no ceiling -- same
// graceful-fallback posture as email/IMAP elsewhere in this repo: a
// guardrail nobody set up doesn't block anything, it just isn't enforced
// yet. That's the ONLY case that fails open, though. A value that's set
// but garbled (typo, truncated .env, wrong type) fails *closed* -- unlike
// every other optional config in this repo, this one exists specifically
// to prevent runaway spend, so a value that's present but unparseable is
// treated as "something is wrong," not "treat it as absent." This is a
// soft, cooperative check (each script has to call it), not a hard
// billing cutoff -- the real backstop is still the hard spend limit set
// in the Anthropic console per the README's Setup step.

import { getMonthToDateSpendUsd } from "./supabase.js";

export interface SpendGuardrailResult {
  allowed: boolean;
  limitUsd: number | null;
  monthToDateUsd: number;
  // Present only when MONTHLY_SPEND_LIMIT_USD was set but couldn't be
  // parsed as a valid positive number -- distinguishes "blocked because
  // over budget" from "blocked because the config itself is broken."
  configError?: string;
}

function parseLimit(): { limitUsd: number | null; configError?: string } {
  const raw = process.env.MONTHLY_SPEND_LIMIT_USD;
  if (raw === undefined || raw === "") return { limitUsd: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      limitUsd: null,
      configError: `MONTHLY_SPEND_LIMIT_USD="${raw}" is not a valid positive number.`,
    };
  }
  return { limitUsd: parsed };
}

export async function checkMonthlySpendGuardrail(): Promise<SpendGuardrailResult> {
  const { limitUsd, configError } = parseLimit();
  if (configError) {
    // Fail closed without even spending a DB round trip on it -- a
    // malformed limit blocks regardless of actual month-to-date spend.
    return { allowed: false, limitUsd: null, monthToDateUsd: 0, configError };
  }
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
  if (result.configError) {
    return (
      `GUARDRAIL: ${result.configError} Failing closed (blocking this run's Claude call(s)) rather than ` +
      `treating a broken config as "no limit" -- that's exactly the ambiguous case this guardrail exists to ` +
      `catch, not silently ignore. Fix MONTHLY_SPEND_LIMIT_USD, or unset it entirely to disable the guardrail ` +
      `on purpose, then re-run.`
    );
  }
  return (
    `GUARDRAIL: month-to-date spend $${result.monthToDateUsd.toFixed(4)} has reached or exceeded ` +
    `MONTHLY_SPEND_LIMIT_USD=$${(result.limitUsd ?? 0).toFixed(2)}. Skipped this run's Claude call(s) ` +
    `to avoid exceeding the limit. Raise the limit or wait for next month to resume.`
  );
}
