# pipeline/

Plain TypeScript scripts invoked on a schedule by GitHub Actions — no
always-on server. Each subfolder is a distinct job; nothing here reads
from or is called by `web/`. The web app only reads from Supabase.

- `weekly/` — Phase 2. Core loop: search public sources with Claude,
  judge relevance against the scope profile, write items to Supabase.
- `backfill/` — Phase 3. One-time ~2-year historical backfill, reuses
  `weekly/search.ts` and `weekly/judge.ts` with a wider date range and a
  lighter detail bar.
- `monthly/` — Phase 6. Synthesizes the month's weekly items into a rollup.
- `quarterly/` — Phase 6. Deeper rollup; also ingests shareholder letters
  and earnings call commentary from Walmart, Amazon, and Target.
- `feedback/` — Phase 5. Forwarded-inbox ingestion + source-coverage audit
  (was this independently publicly findable via search?).
- `email/` — Phase 6. Resend wrapper used by monthly/quarterly delivery.
- `lib/` — shared Claude client, Supabase client, shared types.
- `prompts/` — prompt text kept as separate files (not inline strings) so
  Claude's search/judgment behavior can be reviewed and diffed over time,
  especially at the 1–2 month review checkpoint.
