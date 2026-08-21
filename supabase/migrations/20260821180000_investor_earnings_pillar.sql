-- Adds 'investor_earnings' as a 4th pillar value, per the updated spec's
-- requirement that quarterly's investor/earnings findings become real
-- dated, sourced digest_items + calendar_entries -- not just narrative
-- prose in the rollups.investor_signal JSONB column. Widens both
-- pillar CHECK constraints (constraint names verified live against
-- pg_constraint before writing this, same as the Phase 7 cost-tracking
-- migration's own note on why that matters).

alter table digest_items drop constraint digest_items_pillar_check;
alter table digest_items add constraint digest_items_pillar_check
  check (pillar in ('ux_feature', 'signature_event', 'calendar', 'investor_earnings'));

alter table calendar_entries drop constraint calendar_entries_pillar_check;
alter table calendar_entries add constraint calendar_entries_pillar_check
  check (pillar in ('ux_feature', 'signature_event', 'calendar', 'investor_earnings'));
