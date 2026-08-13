# eMarketScope

Personal tool that tracks Walmart.com, Amazon.com, and Target.com —
category UX/feature changes, signature events, and a calendar tying dates
to what actually changed — so Houston doesn't have to check multiple
retailers and trade sources manually every week.

Full spec: [`docs/SPEC.md`](docs/SPEC.md).

## Status

Build in progress. Phases:

0. Scaffolding
1. Data layer (Supabase schema)
2. Weekly pipeline — **gated on setting a hard monthly spend limit in the
   Anthropic console first**
3. Historical backfill (~2 years, seeds the calendar)
4. Web app (Weekly / Monthly / Quarterly / Calendar / Capture tabs,
   installable to phone home screen)
5. Feedback loop (forwarded-inbox ingestion, source-coverage audit)
6. Monthly & quarterly rollups (email via Resend)
7. Guardrails & polish

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
