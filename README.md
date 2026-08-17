# eMarketScope

Personal tool that tracks Walmart.com, Amazon.com, and Target.com —
category UX/feature changes, signature events, and a calendar tying dates
to what actually changed — so Houston doesn't have to check multiple
retailers and trade sources manually every week.

Full spec: [`docs/SPEC.md`](docs/SPEC.md).

## Status

Build in progress. Phases:

- [x] 0. Scaffolding
- [x] 1. Data layer (Supabase schema)
- [x] 2. Weekly pipeline
- [x] 3. Historical backfill (~2 years, seeds the calendar)
- [x] 4. Web app (Weekly / Monthly / Quarterly / Calendar / Capture tabs,
      real auth, installable to phone home screen)
- [x] 5. Feedback loop (inbox ingestion, source-coverage audit,
      scope-profile review-checkpoint proposal)
- [x] 6. Monthly & quarterly rollups (synthesized narrative + email via
      Resend + persisted for the web app's tabs)
- [x] 7. Guardrails & polish (structured cost tracking, a monthly spend
      guardrail, `cost-report`, failure-notification emails on every
      scheduled workflow, RLS re-audited across all 9 tables, this
      runbook)

Not yet exercised for real, both on Houston's own to-do list rather than
code work: inbox ingestion (`FEEDBACK_INBOX_APP_PASSWORD` not generated
yet), real login testing (`ALLOWED_EMAILS` still placeholder), and Resend
email delivery (account not created yet — see Setup's credentials
checklist; every email so far has correctly fallen back to a local file
per the graceful-fallback design, most recently a real failure-alert
email exercising that same path).

## Structure

- `pipeline/` — scheduled scripts run by GitHub Actions (search, judge,
  write, synthesize, backfill, feedback ingestion, email)
- `supabase/` — Postgres schema as migrations
- `web/` — small read-mostly web app, deployed separately, reads from
  Supabase only
- `docs/` — spec and reference docs

## Setup

1. Copy `.env.example` to `.env` and fill in Supabase + Anthropic + Resend
   keys.
2. Before Phase 2 runs any real Claude API calls: set a hard monthly spend
   limit in the [Anthropic console](https://console.anthropic.com/). This
   is the real backstop; `MONTHLY_SPEND_LIMIT_USD` (below) is a
   cooperative guardrail inside the pipeline itself, not a substitute.

### Credentials checklist

| Var | Where it's used | Required? |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | every pipeline script | Yes |
| `ANTHROPIC_API_KEY` | every script that calls Claude | Yes (except `notify-failure`, `cost-report`) |
| `RESEND_API_KEY`, `DIGEST_EMAIL_TO`, `DIGEST_EMAIL_FROM` | any email send (digests + failure alerts) | No — falls back to a local `.email-fallback/*.html` file when unset |
| `FEEDBACK_INBOX_ADDRESS`, `FEEDBACK_INBOX_APP_PASSWORD` | weekly's inbox-ingestion step | No — inbox polling is skipped when unset |
| `MONTHLY_SPEND_LIMIT_USD` | the spend guardrail, checked before any billed Claude call | No — no ceiling enforced when unset |
| `ALLOWED_EMAILS` (web/) | login allowlist | Yes, for the web app |

Same vars, twice: once in `.env` for local runs, once as GitHub repo
secrets (Settings → Secrets and variables → Actions) for the scheduled
workflows in `.github/workflows/`.

## Runbook

**Manual triggers** — every scheduled script also runs on demand, two
ways:
- Locally: `npm run weekly` / `backfill` / `monthly` / `quarterly` /
  `propose-scope-changes` / `cost-report` / `notify-failure -- <run_type>`
  (needs `.env` populated).
- From GitHub: Actions tab → pick the workflow (`weekly-run`,
  `monthly-run`, `quarterly-run`) → "Run workflow" (`workflow_dispatch`).
  `backfill` and `propose-scope-changes` are launch-time/manual-only
  tools, not on any cron, so they only run locally.

**Checking logs** — two complementary views, not one:
- GitHub Actions → the workflow run's own step output, for what actually
  happened this run (console output, stack traces).
- `pipeline_runs` table, for structured history across runs —
  `npm run cost-report` gives spend totals by type and by month;
  `select * from pipeline_runs order by started_at desc limit 20;` gives
  raw status/notes. A `status='failed'` row's `notes` column is written
  by the script itself before it exits, so it's usually enough on its own
  without needing the Actions log too.

**Adding a known source** — insert directly, deliberately:
```sql
insert into known_sources (name, url, source_type, status, added_reason)
values ('Some Trade Press Outlet', 'https://example.com', 'trade_press', 'active', 'why you''re adding it');
```
Sources the pipeline notices on its own (via forwarded-item audits) show
up automatically as `status='candidate'` instead — review those with
`select * from known_sources where status = 'candidate';` and promote
with `update known_sources set status = 'active' where id = '<id>';`.
Nothing is ever auto-promoted to `active` — that's a deliberate,
human-reviewed step by design (same "no silent self-modification" rule
that governs scope proposals below).

**Promoting a scope proposal** — `npm run propose-scope-changes` (run
every 1-2 months per the spec, not on any cron) only ever writes
`status='proposed'` rows; it never activates anything itself. Review the
proposal's `change_summary` and `content`, then:
```sql
update scope_profile_versions set status = 'active', reviewed_at = now() where version = <N>;
```
`getActiveScopeProfile()` always picks the highest-`version` row with
`status = 'active'`, so there's no need to touch the previous active
row — it's just superseded, not deleted.

**Troubleshooting**
- *A scheduled run shows red in Actions* — check for a failure-alert
  email first (or `.email-fallback/` locally if Resend isn't
  configured); it's built from the same `pipeline_runs.notes` the
  Actions log has, but doesn't require digging through step output.
- *A run failed with a `GUARDRAIL:` note* — month-to-date spend
  (`npm run cost-report`) has reached `MONTHLY_SPEND_LIMIT_USD`. Raise
  the limit or wait for next month; nothing was left partially spent —
  the check runs before any billed call.
- *Email isn't arriving* — check `.email-fallback/*.html` first (if a
  file landed there, the render worked fine and this is purely a
  delivery/credentials problem, not a content bug); then confirm
  `RESEND_API_KEY`/`DIGEST_EMAIL_TO`/`DIGEST_EMAIL_FROM` are set in both
  `.env` and the relevant GitHub secret.
- *Inbox ingestion isn't picking anything up* — confirm
  `FEEDBACK_INBOX_APP_PASSWORD` is a Gmail **app password** (requires
  2-Step Verification enabled first), not the account password.
- *Backfill died partway through* — safe to re-run scoped to just the
  missing window (`BACKFILL_MONTHS`/`BACKFILL_MONTHS_PER_CHUNK`); it
  dedupes against everything already in `digest_items` by `source_url`,
  so re-running never double-writes.
