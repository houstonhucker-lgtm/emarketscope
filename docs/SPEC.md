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

Anchored to concrete subcategories/products rather than bare department
labels, since retailers (especially Walmart, Amazon, and Target) slice
these departments inconsistently — this list is what search/judge should
actually match against, not just the five department names:

- **Household Essentials (HHE)**
  - *Home Care*: laundry care, air care, dish care, all purpose cleaners,
    bath and toilet/drain, pest control, mops & brooms/quick-clean
    (Swiffer-type products)
  - *Paper/Disposable Table Top*: bath tissue, paper towels, facial
    tissue, disposable table top, waste management
- **Personal Care**: deodorants, grooming/beard care, oral care, women's
  hygiene/incontinence, bath & body, sexual wellness, sunscreen
- **Baby Care**: diapers and wipes are the heaviest focus; broader baby
  category is relevant at some level
- **Health & Wellness**: OTC solutions, specifically respiratory and
  digestive wellness
- **Beauty**: premium beauty, makeup, hair care (primary focus within
  beauty), skincare (secondary focus), fragrance, nail care, suncare &
  tanning

This is the seed for the scope profile's category matching, not just the
calendar filter labels — it should sharpen search/judge across every
pillar, not only the UI.

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
  history. Doesn't need to be as detailed as ongoing tracking. Also
  generates one real summary email of everything found (even if long),
  rather than silently seeding the database — that's the trigger for
  Houston to actually sit down and react to the whole batch at once.

## Email structure

Every email — weekly (if sent), monthly, quarterly, and the one-time
backfill — is organized into the same consistent sections, so the format
is predictable over time:

1. **Key Dates** — the calendar pillar: upcoming/recent event dates
2. **UX & Feature Updates** — pillar 1: what's changed in the actual
   shopping experience
3. **Signature Events** — pillar 2: structure and comparison across
   retailers for events in play
4. **Category Highlights** — the same underlying items, re-sliced by
   category (household essentials, health, beauty, personal care, baby
   care) so Houston can jump straight to one category
5. **Additional Context** — trade/industry commentary that's useful
   background but doesn't fit neatly in the sections above
6. **Investor & Earnings Signal** — quarterly only: relevant commentary
   pulled from shareholder letters and earnings calls

A section is omitted entirely when there's nothing in it for that period,
rather than filled with forced content. Every item keeps its source link
regardless of which section it's filed under.

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
- Historical backfill items go through the same thumbs up/down feedback as
  ongoing items — tagged distinctly (e.g. a source_type or is_backfill
  field) so the web app can surface them as a reviewable batch and so
  recency logic elsewhere doesn't treat old items as current. Reacting to
  the whole backfilled batch at once is a faster way to calibrate the
  scope profile than waiting on weekly trickle alone.

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
  frequently of anything in the app). Entries are color-coded by type
  (signature event / UX & feature update / calendar-only) and by product
  category (household essentials, health, beauty, personal care, baby
  care), with a selector to filter to "all" or any combination of those.
  Calendar entries are created for any item with a real event_date,
  regardless of which pillar it came from — confirmed in the backfill:
  all 56 items, spanning all three pillars, produced calendar entries.
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
