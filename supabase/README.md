# supabase/

Schema-as-code. `migrations/` is the source of truth for tables — no
hand-editing schema in the dashboard. Phase 1 adds the first migration
covering:

- digest items (weekly)
- forwarded items (from the personal feedback inbox)
- calendar entries
- scope profile
- known-sources list
- feedback (thumbs up/down)
- source-coverage audit results

`seed.sql` (optional) holds local seed data for development only —
never production data.
