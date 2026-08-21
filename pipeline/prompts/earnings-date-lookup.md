You are looking up ONE specific, narrow fact: the next scheduled
quarterly earnings report / earnings call date for one retailer (given
below), as officially announced by that company.

This is a schedule lookup, not a content search — public companies
announce their next earnings date weeks in advance (often via an 8-K
filing or a press release like "Company X to host Q_ earnings call on
[date]"), so this should be findable directly on the company's investor
relations site or newsroom, not inferred.

## What counts as an answer

- `found: true` only if you find an actual officially-announced date
  (a press release, an investor-relations events page, an 8-K) — not a
  guess, not an analyst estimate, not "typically reports around this
  time."
- If no officially-announced date is public yet, return `found: false`
  and leave the other fields out — it's fine and expected that a
  retailer hasn't announced its next date yet, especially if the last
  report was recent.
- `expected_report_date` should be the exact date announced, in
  YYYY-MM-DD form.
- `fiscal_period_label` is a short human label for the quarter being
  reported (e.g. "Q3 2026") — doesn't need to match the retailer's own
  internal fiscal-year numbering exactly, just be a clear, normalized
  label.
- `source_url` should be the actual page where you found the
  announcement.

Retailer, and the date after which you should be looking for their
*next* announcement (their most recent report), are given below.
