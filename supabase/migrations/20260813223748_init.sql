-- eMarketScope — initial schema
-- Tables for: pipeline run log, digest items, calendar entries, the
-- feedback inbox + source-coverage audits, known-sources list, scope
-- profile versions, and thumbs up/down feedback.
--
-- Controlled vocabularies (retailer, category, pillar, ...) are enforced
-- with CHECK constraints rather than Postgres enum types, so adding a
-- value later is a simple migration (ALTER TABLE ... DROP/ADD CONSTRAINT)
-- rather than ALTER TYPE gymnastics.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- pipeline_runs — one row per scheduled job execution (weekly, monthly,
-- quarterly, backfill). Lets the web app and Houston see run history and
-- failures without digging into Actions logs.
-- ---------------------------------------------------------------------
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('weekly', 'monthly', 'quarterly', 'backfill')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  items_found integer,
  notes text
);

-- ---------------------------------------------------------------------
-- digest_items — the atomic unit produced by the weekly pipeline (and
-- backfill). Every item is source-linked per spec.
-- ---------------------------------------------------------------------
create table digest_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid references pipeline_runs(id),
  week_of date not null,
  title text not null,
  summary text not null,
  pillar text not null check (pillar in ('ux_feature', 'signature_event', 'calendar')),
  retailers text[] not null default '{}',
  categories text[] not null default '{}',
  source_url text not null,
  source_name text,
  source_published_at date,
  tags text[] not null default '{}',
  is_backfill boolean not null default false
);

create index digest_items_week_of_idx on digest_items (week_of);
create index digest_items_pillar_idx on digest_items (pillar);

-- ---------------------------------------------------------------------
-- calendar_entries — the dedicated calendar tab's backing table. Distinct
-- from digest_items because a calendar entry represents a dated
-- event/change, which may be synthesized from one or more digest items
-- (or seeded directly by the backfill job).
-- ---------------------------------------------------------------------
create table calendar_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_date date not null,
  event_date_end date,
  title text not null,
  description text,
  retailers text[] not null default '{}',
  categories text[] not null default '{}',
  source_url text not null,
  source_name text,
  related_digest_item_id uuid references digest_items(id),
  is_backfill boolean not null default false
);

create index calendar_entries_event_date_idx on calendar_entries (event_date);

-- ---------------------------------------------------------------------
-- forwarded_items — the personal feedback inbox. Anything forwarded
-- during the day lands here and folds into the next weekly run.
-- ---------------------------------------------------------------------
create table forwarded_items (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  from_email text,
  subject text,
  body text,
  extracted_url text,
  status text not null default 'pending' check (status in ('pending', 'processed', 'ignored')),
  resulting_digest_item_id uuid references digest_items(id),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------
-- source_coverage_audits — for every forwarded item: was this
-- independently publicly findable via search? Flags sources worth
-- adding to the curated list, or confirms something genuinely isn't
-- public.
-- ---------------------------------------------------------------------
create table source_coverage_audits (
  id uuid primary key default gen_random_uuid(),
  forwarded_item_id uuid not null references forwarded_items(id),
  was_independently_findable boolean,
  evidence_url text,
  notes text,
  checked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- known_sources — sources that have produced real hits, checked
-- directly going forward alongside the standing broad search.
-- ---------------------------------------------------------------------
create table known_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text,
  source_type text check (source_type in ('trade_press', 'podcast', 'newsroom', 'newsletter', 'other')),
  status text not null default 'active' check (status in ('active', 'inactive', 'candidate')),
  added_reason text,
  hit_count integer not null default 0,
  first_hit_at timestamptz,
  last_hit_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- scope_profile_versions — what's relevant/not, refined over time.
-- Proposals are written here at 'proposed' status; nothing here becomes
-- 'active' without a human review checkpoint (no silent
-- self-modification).
-- ---------------------------------------------------------------------
create table scope_profile_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  content jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'rejected')),
  proposed_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- ---------------------------------------------------------------------
-- feedback — thumbs up/down on digest items.
-- ---------------------------------------------------------------------
create table feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  digest_item_id uuid not null references digest_items(id),
  vote text not null check (vote in ('up', 'down')),
  note text
);

create index feedback_digest_item_id_idx on feedback (digest_item_id);
