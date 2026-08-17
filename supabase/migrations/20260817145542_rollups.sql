-- Phase 6: monthly/quarterly rollups. Spec's Cadence & output section
-- says weekly is "browsable in-app; not necessarily emailed" -- by
-- contrast, monthly/quarterly's primary delivery is email, but the UI's
-- Tabs list still includes dedicated Monthly and Quarterly tabs, so the
-- rollup needs to persist somewhere the web app can query, not just be
-- emailed and gone.
--
-- Doesn't duplicate item content -- the itemized sections (Key Dates, UX
-- & Feature Updates, Signature Events, Category Highlights) are
-- reconstructed by querying digest_items/calendar_entries for
-- [period_start, period_end) at render time, same query pipeline/email
-- and web/ both use. What this table stores is the two things that don't
-- already live elsewhere: the synthesized narrative (Claude's connect-
-- the-dots summary, not a re-listing) and, for quarterly only, the
-- investor/earnings signal items (not digest_items -- they don't carry a
-- pillar or category, they're a distinct fixed-shape section).

create table rollups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid references pipeline_runs(id),
  rollup_type text not null check (rollup_type in ('monthly', 'quarterly')),
  period_start date not null,
  period_end date not null,
  narrative text not null,
  -- array of {title, summary, source_url, source_name, retailer,
  -- published_date}; null for monthly, populated for quarterly.
  investor_signal jsonb,
  email_sent boolean not null default false,
  email_error text
);

create index rollups_type_period_idx on rollups (rollup_type, period_start desc);

alter table rollups enable row level security;

create policy "authenticated read rollups"
  on rollups for select
  to authenticated
  using (true);
