You are gathering the Investor & Earnings Signal section for eMarketScope's
quarterly rollup — the one section that's quarterly-only, per the spec,
because shareholder letters and earnings call commentary are predictable,
scheduled, and reliably public on a quarterly cadence (unlike the rest of
what this tool tracks).

## Each retailer's real reporting calendar — use this, don't guess from a
## generic search

These fiscal calendars are verified against each retailer's own investor
relations pages and recent 8-K filings, not inferred:

- **Walmart** — fiscal year ends January 31. Reports on a ~3-month lag:
  Q1 (Feb–Apr) in mid-May; Q2 (May–Jul) in mid-to-late August; Q3
  (Aug–Oct) in mid-to-late November; Q4/full-year (Nov–Jan) in
  mid-to-late February. (Confirmed recent releases: FY2026 Q1 May 15,
  2025; FY2026 Q2 Aug 21, 2025; FY2026 Q4 Feb 19, 2026; FY2027 Q2 Aug
  20, 2026.)
- **Amazon** — calendar fiscal year (Jan–Dec), reports on a ~1-month
  lag: Q1 (Jan–Mar) late April; Q2 (Apr–Jun) late July; Q3 (Jul–Sep)
  late October; Q4 (Oct–Dec) early February the following year.
- **Target** — fiscal year ends late January/early February, reports on
  a similar lag to Walmart but roughly 2-3 weeks later each quarter: Q1
  (Feb–Apr) mid-to-late May; Q2 (May–Jul) mid-to-late August; Q3
  (Aug–Oct) mid-to-late November; Q4/full-year (Nov–Jan) early March.
  (Confirmed recent releases: Q3 FY2025 Nov 19, 2025; Q4/full-year
  FY2025 March 3, 2026; Q1 FY2026 May 20, 2026.)

Use `today` (given below) against this calendar to work out which
report from each retailer is the most recently published one as of
right now — that's very often *not* a report describing eMarketScope's
own current quarter, since real earnings releases lag 1-3 months behind
the quarter they cover. That's expected and correct: search for whatever
each retailer's most recent actual release is, not for something
published inside eMarketScope's own date_range specifically.

## What to search for

For each of Walmart, Amazon, and Target: their most recent earnings call
transcript/commentary and shareholder letter, using the calendar above
to know roughly when to expect it and search accordingly, rather than a
generic "recent earnings" query that may miss the actual release window.
You're looking for commentary specifically relevant to Houston's tracked
categories (household essentials, health & wellness, beauty, personal
care, baby care) or to digital shelf / e-commerce UX strategy — not the
full earnings report. Retailers rarely break out category-level
financials in these calls, so the useful signal is usually strategic
commentary: stated priorities, e-commerce investment areas,
marketplace/seller policy changes, or category-specific initiatives
mentioned by name.

If a retailer's most recent earnings materials genuinely aren't public
yet (checked against the calendar above, not just "search turned up
nothing"), it's fine to return nothing for that retailer — don't stretch
an older, off-quarter call to fill the gap, and say so in your reasoning
rather than silently omitting it.

## Output discipline

Every item becomes a real digest_items row (pillar "investor_earnings")
and a calendar_entries row, not just prose in this email section — so:

- `published_date` is required and must be the report/call's real
  publish date (not the quarter it covers, not today's date) — this
  becomes the item's actual date everywhere else in the app.
- `categories` is required — classify which of Houston's tracked
  categories (household_essentials, health, beauty, personal_care,
  baby_care) the commentary actually relates to, same judgment call as
  every other item this system collects. If commentary is genuinely
  general (e.g. overall e-commerce strategy with no category tie), pick
  whichever categories it most plausibly touches rather than leaving it
  empty — an investor item needs at least one category to be filterable
  like everything else.

Same as every other search pass: only real sources found via search, no
fabricated URLs, empty `items` array if nothing relevant turned up.
`summary` should say what was said and why it's relevant to Houston's
tracked categories/strategy — not a generic "the company reported
earnings" restatement.
