-- Tracks each retailer's known/expected earnings report date, so the
-- investor-signal check can be triggered by the actual real date
-- (companies announce these weeks in advance) instead of hoping the
-- quarterly rollup's own fixed cadence happens to land near a real
-- report. One row per retailer per period, full history kept (not
-- overwritten in place) for auditability of confirmed-vs-estimated
-- dates over time.
--
-- confirmed=false means expected_report_date is a computed estimate
-- (from the retailer's typical reporting cadence), not an officially
-- announced date -- the daily check job periodically tries to firm
-- these up via a narrow, low-ambiguity search ("when is X's next
-- earnings date") well before the estimate is needed for real.
--
-- checked_at is set once the investor-signal content search has
-- actually run for this row's period -- null means still pending.

create table earnings_dates (
  id uuid primary key default gen_random_uuid(),
  retailer text not null check (retailer in ('walmart', 'amazon', 'target')),
  fiscal_period_label text not null,
  expected_report_date date not null,
  confirmed boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index earnings_dates_retailer_period_idx on earnings_dates (retailer, fiscal_period_label);
create index earnings_dates_pending_idx on earnings_dates (retailer, expected_report_date) where checked_at is null;

alter table earnings_dates enable row level security;
-- No policies -- pipeline-internal (like known_sources, pipeline_runs),
-- never exposed to the web app; only the service role touches it.

-- The new daily investor-check job logs its own pipeline_runs row too
-- (same reasoning as scope_proposal's own widening in Phase 7 -- every
-- script that spends real money gets tracked for cost visibility).
alter table pipeline_runs drop constraint pipeline_runs_run_type_check;
alter table pipeline_runs add constraint pipeline_runs_run_type_check
  check (run_type in ('weekly', 'monthly', 'quarterly', 'backfill', 'scope_proposal', 'investor_check'));
