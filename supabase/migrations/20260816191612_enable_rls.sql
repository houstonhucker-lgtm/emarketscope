-- Enables RLS on every table. Until now nothing had RLS enabled, which
-- means the anon key had unrestricted read/write access to all data via
-- Supabase's REST API regardless of any application-level auth check --
-- the web app's login screen would have been decorative without this.
-- The pipeline's service role key bypasses RLS by design and is
-- unaffected by any policy here.
--
-- Split by what the web app (Phase 4) actually needs:
--   - digest_items, calendar_entries: read-only for authenticated users
--   - feedback: read + insert for authenticated users (thumbs up/down)
--   - forwarded_items: read + insert for authenticated users (Capture
--     tab, Phase 5) -- insert allowed since forwarding is the point, but
--     see note below on why this isn't abusable
--   - pipeline_runs, scope_profile_versions, known_sources,
--     source_coverage_audits: no policies at all -- pipeline-internal,
--     never exposed to the web app; only the service role can touch them

alter table digest_items enable row level security;
alter table calendar_entries enable row level security;
alter table feedback enable row level security;
alter table forwarded_items enable row level security;
alter table pipeline_runs enable row level security;
alter table scope_profile_versions enable row level security;
alter table known_sources enable row level security;
alter table source_coverage_audits enable row level security;

create policy "authenticated read digest_items"
  on digest_items for select
  to authenticated
  using (true);

create policy "authenticated read calendar_entries"
  on calendar_entries for select
  to authenticated
  using (true);

create policy "authenticated read feedback"
  on feedback for select
  to authenticated
  using (true);

create policy "authenticated insert feedback"
  on feedback for insert
  to authenticated
  with check (true);

create policy "authenticated read forwarded_items"
  on forwarded_items for select
  to authenticated
  using (true);

-- Insert-only for the Capture tab (Phase 5) -- a logged-in user can add a
-- forwarded item but can't read/modify others' or mark them processed;
-- that stays pipeline-only via the service role. Not abusable beyond
-- "an authenticated user can queue junk for the next pipeline run to
-- process", which is the same trust level as forwarding email today.
create policy "authenticated insert forwarded_items"
  on forwarded_items for insert
  to authenticated
  with check (true);

-- No policies on pipeline_runs, scope_profile_versions, known_sources,
-- source_coverage_audits: RLS enabled with zero policies means even
-- `authenticated` gets nothing -- intentional, these are pipeline-
-- internal and were never meant to be web-app-visible.
