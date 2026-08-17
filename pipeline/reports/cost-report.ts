// Human-readable spend visibility (Phase 7). Not scheduled -- run manually
// via `npm run cost-report` whenever you want a real number instead of
// eyeballing pipeline_runs.notes one row at a time.
//
// Reads pipeline_runs directly (same precedent as ingest-inbox.ts) rather
// than adding another single-purpose helper to lib/supabase.ts.

import { supabase } from "../lib/supabase.js";
import type { RunType } from "../lib/types.js";

interface CostRow {
  run_type: RunType;
  status: "running" | "success" | "failed";
  started_at: string;
  estimated_cost_usd: number | null;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

async function main() {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("run_type, status, started_at, estimated_cost_usd")
    .order("started_at", { ascending: true })
    .returns<CostRow[]>();
  if (error) throw new Error(`Failed to load pipeline_runs: ${error.message}`);
  const rows = data ?? [];

  const untracked = rows.filter((r) => r.estimated_cost_usd === null);
  const tracked = rows.filter((r) => r.estimated_cost_usd !== null) as (CostRow & { estimated_cost_usd: number })[];

  console.log(`\n=== eMarketScope cost report ===`);
  console.log(`${rows.length} total pipeline_runs row(s); ${tracked.length} with tracked cost, ${untracked.length} untracked (pre-date the estimated_cost_usd column or a guardrail-blocked run).\n`);

  // --- All-time, by run_type ---
  const byType = new Map<string, number>();
  let allTimeTotal = 0;
  for (const r of tracked) {
    byType.set(r.run_type, (byType.get(r.run_type) ?? 0) + r.estimated_cost_usd);
    allTimeTotal += r.estimated_cost_usd;
  }
  console.log(`--- All-time total: ${formatUsd(allTimeTotal)} ---`);
  for (const [type, cost] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(16)} ${formatUsd(cost)}`);
  }

  // --- Current month, by run_type ---
  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const thisMonth = tracked.filter((r) => monthKey(r.started_at) === currentMonthKey);
  const thisMonthTotal = thisMonth.reduce((sum, r) => sum + r.estimated_cost_usd, 0);
  const byTypeThisMonth = new Map<string, number>();
  for (const r of thisMonth) {
    byTypeThisMonth.set(r.run_type, (byTypeThisMonth.get(r.run_type) ?? 0) + r.estimated_cost_usd);
  }
  console.log(`\n--- Month-to-date (${currentMonthKey}): ${formatUsd(thisMonthTotal)} ---`);
  for (const [type, cost] of [...byTypeThisMonth.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(16)} ${formatUsd(cost)}`);
  }
  const limitEnv = process.env.MONTHLY_SPEND_LIMIT_USD;
  if (limitEnv && Number.isFinite(Number(limitEnv)) && Number(limitEnv) > 0) {
    const limit = Number(limitEnv);
    console.log(`  guardrail limit: ${formatUsd(limit)} (${((thisMonthTotal / limit) * 100).toFixed(1)}% used)`);
  } else {
    console.log(`  guardrail limit: not configured (MONTHLY_SPEND_LIMIT_USD unset) -- no ceiling enforced.`);
  }

  // --- Last 10 months trend ---
  const byMonth = new Map<string, number>();
  for (const r of tracked) {
    const key = monthKey(r.started_at);
    byMonth.set(key, (byMonth.get(key) ?? 0) + r.estimated_cost_usd);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  if (months.length > 0) {
    console.log(`\n--- Last ${months.length} month(s) ---`);
    for (const [m, cost] of months) {
      console.log(`  ${m}  ${formatUsd(cost)}`);
    }
  }

  // --- Failed/guardrail-blocked runs (cost null, worth a human glance) ---
  const failed = rows.filter((r) => r.status === "failed");
  if (failed.length > 0) {
    console.log(`\n--- Failed run(s): ${failed.length} (see pipeline_runs.notes for detail) ---`);
    for (const r of failed) {
      console.log(`  ${r.started_at}  ${r.run_type}`);
    }
  }

  console.log("");
}

main();
