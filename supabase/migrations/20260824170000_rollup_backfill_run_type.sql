-- One more run_type for a one-time, distinct category of cost: the
-- retroactive rollups backfill (pipeline/backfill/rollups.ts), generating
-- monthly/quarterly narratives for already-backfilled historical months
-- and quarters. Kept separate from 'monthly'/'quarterly' for the same
-- reason 'backfill' is separate from 'weekly' -- mixing a one-time batch
-- cost into an ongoing job's bucket would skew what that job actually
-- costs per real run in cost-report.ts.

alter table pipeline_runs drop constraint pipeline_runs_run_type_check;
alter table pipeline_runs add constraint pipeline_runs_run_type_check
  check (run_type in ('weekly', 'monthly', 'quarterly', 'backfill', 'scope_proposal', 'investor_check', 'rollup_backfill'));
