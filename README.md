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
- [ ] 7. Guardrails & polish

Not yet exercised for real: inbox ingestion (`FEEDBACK_INBOX_APP_PASSWORD`
not generated yet) and Resend email delivery (not configured yet — every
email so far has correctly fallen back to a local file per the graceful-
fallback design).

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
   limit in the [Anthropic console](https://console.anthropic.com/).
