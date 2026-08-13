# eMarketScope — project spec

## What this is

A personal tool that keeps Houston on top of what's happening on Walmart.com,
Amazon.com, and Target.com — signature events, UX/feature changes, and the
digital shelf experience for his categories — without manually checking
multiple retailers and industry sources every day.

Built for Houston and one or two close friends who need the same
information. Not a company-wide tool. Not built on P&G systems.

## Why this exists

Houston is expected to be the go-to expert on Walmart.com, Amazon.com, and
Target.com, on top of business analysis, one-off requests, and general org
overhead. The goal isn't to be first to catch every hidden UI test — it's to
make sure that when something relevant is happening or has been discussed
anywhere publicly, he's already aware of it.

## Who / what it tracks

**Retailers**
- Walmart & Amazon — core, weekly attention
- Target — lighter touch: major launches and event-period behavior only

**Categories**
Household essentials, health, beauty, personal care, baby care

## The three pillars

1. **Category UX & feature changes** — how these categories show up to
   consumers, and meaningful UX/feature changes (e.g. Walmart testing
   count/variant selectors on search results pages, not just PDPs, where
   they used to only appear)
2. **Signature events** — structure and comparison across Walmart, Amazon,
   and Target for events like Prime Day, beauty days, back to school,
   October deal days
3. **Calendar** — the throughline tying dates to what actually changed; gets
   its own dedicated, frequently-used tab in the UI

## Sources (v1)

Public sources only:
- Trade press: Modern Retail, Retail Dive, Chain Store Age, Marketplace Pulse
- Podcasts with transcripts: The CPG Guys, third-party-seller-focused podcasts
- Official retailer newsrooms / investor relations
- Niche seller newsletters

**Explicitly out of scope for v1:**
- Scraping or screenshotting the retailer sites directly (deferred —
  revisit after a couple months of real usage data)
- Item-level price/promo tracking (Houston has access via Circana/Numerator
  through P&G but can't use licensed data on a personal project)
- Native mobile app monitoring (device farms, emulators, etc.)

## Cadence & output

- **Weekly** — pipeline runs weekly, collects and logs items. Browsable
  in-app; not necessarily emailed.
- **Monthly** — synthesized rollup, delivered by email
- **Quarterly** — deeper rollup, delivered by email, incorporating
  shareholder letters and earnings call commentary from Walmart, Amazon,
  and Target (predictable, scheduled, and reliably public)
- **Historical backfill** — one-time job at launch: roughly 2 years back for
  event dates and major UX press releases, to seed the calendar with
  history. Doesn't need to be as detailed as ongoing tracking.

## Feedback & adaptive search

- Dedicated personal email inbox to forward anything found during the day —
  no laptop ritual required, folds into the next run
- Thumbs up / thumbs down on digest items
- Every forwarded item gets checked: was this independently publicly
  findable via search? (source-coverage audit — flags sources worth adding
  to the curated list, or confirms something genuinely isn't public)
- Feedback accumulates into two things, not just one:
  - A **scope profile** — what's relevant/not, refined over time
  - A **known-sources list** — sources that have produced real hits get
    checked directly going forward, not just relied on via generic search
- A standing generic/broad search always runs too, alongside the
  known-sources list, so the system doesn't ossify around only what it
  already knows
- No silent self-modification — the system proposes scope changes at the
  review checkpoint rather than rewriting its own criteria unilaterally

## Review checkpoint

Regroup after roughly 1-2 months of real usage. Use accumulated feedback
(including the source-coverage audit results) to decide, with actual
evidence, whether the harder "look at the site directly" layer is worth
building next.

## UI

Simple web app — not native. This is read-mostly content plus a thumbs
up/down, which doesn't need app store distribution for 1-3 users.
Mobile-friendly, can be added to the phone home screen.

Tabs:
- Weekly
- Monthly
- Quarterly
- **Calendar** (separate, dedicated — expected to be referenced most
  frequently of anything in the app)
- Capture / feedback

Every single item, everywhere in the app, is sourced with a clickable link
back to where it came from.

## Technical stack

- **GitHub** — code + GitHub Actions for the weekly scheduled trigger
- **Supabase** (Postgres) — stores digest items, forwarded items, calendar
  entries, the scope profile, the known-sources list, and feedback
- **Claude API** — does the searching, judgment, and writing within each run
- **Email service** (e.g. Resend) — delivers the monthly/quarterly emails
- **Web app** — hosted free (e.g. Vercel or Cloudflare Pages), reads from
  Supabase

## Cost

- Infrastructure (GitHub Actions, Supabase, email, hosting) — free at this
  scale on free tiers
- Claude API usage — estimated $5-15/month based on weekly search +
  synthesis volume
- A hard monthly spend limit should be set in the Anthropic console from
  day one, so cost can't run away unexpectedly

## Users

Houston, plus one or two close friends. Personal project, run entirely
outside P&G's systems.

## Setup reference

- Project name: **eMarketScope**
- GitHub repo: `emarketscope` (private)
- Supabase project: `emarketscope` (separate from any other personal Supabase
  projects, e.g. Fairways)
- Local folder: `~/dev/emarketscope` — sibling to `~/dev/fairways`, not
  nested inside it
