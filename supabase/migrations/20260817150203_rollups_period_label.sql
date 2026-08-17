-- Stores the human-readable period label ("August 2026", "Q3 2026")
-- alongside period_start/period_end, so the web app doesn't need to
-- recompute month/quarter-from-date logic a second time in a second
-- language -- the pipeline (lib/dates.ts) already computes it once.
-- No backfill needed: the rollups table has no rows yet at this point.

alter table rollups add column period_label text not null default '';
alter table rollups alter column period_label drop default;
