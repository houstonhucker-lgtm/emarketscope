# pipeline/

Plain TypeScript scripts invoked on a schedule by GitHub Actions — no
always-on server. Each subfolder is a distinct job; nothing here reads
from or is called by `web/`. The web app only reads from Supabase.

- `weekly/` — Phase 2. Core loop: search public sources with Claude,
  judge relevance against the scope profile, write items to Supabase.
- `backfill/` — Phase 3. One-time ~2-year historical backfill, reuses
  `weekly/search.ts` and `weekly/judge.ts` with a wider date range and a
  lighter detail bar.
- `monthly/synthesize.ts` — Phase 6. Previous calendar month's
  digest_items -> a synthesized narrative (Claude, no web search — reasons
  only over already-collected items) + the same itemized email sections
  as everywhere else. Sends the email and persists a `rollups` row so the
  web app's Monthly tab has something to read, not just "check your
  email."
- `quarterly/synthesize.ts` — Phase 6. Same shape over the previous
  quarter, plus the one section monthly never gets: Investor & Earnings
  Signal, from a dedicated web-search call against Walmart/Amazon/Target
  shareholder letters and earnings call commentary (genuinely new
  content, unlike the rest of the rollup).
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
