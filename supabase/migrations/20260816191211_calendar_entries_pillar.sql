-- Adds pillar to calendar_entries, needed for the Calendar tab's
-- color-code-and-filter-by-type UI (Phase 4). related_digest_item_id
-- already carries pillar indirectly via a join to digest_items, but the
-- calendar tab is "expected to be referenced most frequently of anything
-- in the app" and calendar_entries.related_digest_item_id is nullable —
-- denormalizing pillar directly onto calendar_entries avoids requiring a
-- join (and a non-null related item) just to color-code and filter.

alter table calendar_entries add column pillar text;

-- Backfill existing rows (56 as of this migration, all created with a
-- related_digest_item_id) from their linked digest_items row.
update calendar_entries ce
set pillar = di.pillar
from digest_items di
where ce.related_digest_item_id = di.id
  and ce.pillar is null;

alter table calendar_entries
  alter column pillar set not null,
  add constraint calendar_entries_pillar_check
    check (pillar in ('ux_feature', 'signature_event', 'calendar'));

create index calendar_entries_pillar_idx on calendar_entries (pillar);
