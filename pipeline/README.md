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
- `feedback/` — Phase 5.
  - `ingest-inbox.ts` — polls emarketscope@gmail.com via IMAP, inserts
    unseen messages into `forwarded_items`. Graceful fallback (skips, does
    not fail the run) when `FEEDBACK_INBOX_ADDRESS`/`FEEDBACK_INBOX_APP_PASSWORD`
    are unset.
  - `source-audit.ts` — for pending `forwarded_items` (from email or the
    Capture tab's web form), runs the source-coverage audit: was this
    independently publicly findable via search? Flags candidate known
    sources, never auto-activates them.
  - `propose-scope-changes.ts` — **manually run** (`npm run
    propose-scope-changes`) at the review checkpoint, not on the weekly
    cron. Drafts a proposed scope profile revision from accumulated
    feedback/audit evidence, written as a new `scope_profile_versions` row
    with `status='proposed'` — never auto-activated (no silent
    self-modification, per spec).
  - Both `ingest-inbox.ts` and `source-audit.ts` run as steps inside
    `weekly/run.ts`, best-effort — this is how forwarding something
    "folds into the next run" with no separate script to remember.
- `email/` — Phase 3 (backfill summary) and Phase 6 (monthly/quarterly).
  Resend wrapper, shared by both.
- `lib/` — shared Claude client, Supabase client, shared types.
- `prompts/` — prompt text kept as separate files (not inline strings) so
  Claude's search/judgment behavior can be reviewed and diffed over time,
  especially at the 1–2 month review checkpoint.
