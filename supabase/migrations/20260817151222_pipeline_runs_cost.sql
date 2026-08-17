-- Phase 7 guardrail: structured cost tracking. Every pipeline script has
-- logged real Claude API cost into pipeline_runs.notes as free text
-- since Phase 2 (e.g. "est_cost_usd=0.7809 (intro)") -- readable one run
-- at a time, but not summable/queryable without regex-parsing a text
-- column. A numeric column lets the monthly-budget guardrail (added in
-- this same migration's companion code change) and a human cost report
-- both just SUM() it directly.
--
-- Also widens run_type to include 'scope_proposal' -- propose-scope-
-- changes.ts (Phase 5) makes a real, billed Claude call but has never
-- logged a pipeline_runs row at all; this closes that gap so total
-- spend visibility is actually total.

alter table pipeline_runs add column estimated_cost_usd numeric;

alter table pipeline_runs drop constraint pipeline_runs_run_type_check;
alter table pipeline_runs add constraint pipeline_runs_run_type_check
  check (run_type in ('weekly', 'monthly', 'quarterly', 'backfill', 'scope_proposal'));

create index pipeline_runs_started_at_idx on pipeline_runs (started_at);
