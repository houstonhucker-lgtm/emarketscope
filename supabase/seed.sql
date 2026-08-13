-- eMarketScope — initial data
-- Bootstraps scope_profile_versions (v1, active — the founding profile
-- from the spec, not a feedback-driven proposal) and known_sources (the
-- v1 curated list from the spec). Safe to re-run: guarded with
-- `on conflict do nothing` / unique constraints.

insert into scope_profile_versions (version, content, status, proposed_reason, reviewed_at)
values (
  1,
  '{
    "retailers": {
      "walmart": {"tier": "core", "note": "core, weekly attention"},
      "amazon": {"tier": "core", "note": "core, weekly attention"},
      "target": {"tier": "light", "note": "major launches and event-period behavior only"}
    },
    "categories": [
      "household_essentials", "health", "beauty", "personal_care", "baby_care"
    ],
    "pillars": {
      "ux_feature": "Meaningful UX/feature changes in how these categories show up to consumers (e.g. a selector or module appearing in a placement it did not used to)",
      "signature_event": "Structure and comparison across Walmart, Amazon, and Target for events like Prime Day, beauty days, back to school, October deal days",
      "calendar": "The throughline tying dates to what actually changed"
    },
    "out_of_scope": [
      "Scraping or screenshotting retailer sites directly (deferred to post-review)",
      "Item-level price/promo tracking (licensed Circana/Numerator data cannot be used on a personal project)",
      "Native mobile app monitoring (device farms, emulators, etc.)"
    ],
    "goal": "Not first-to-catch every hidden UI test -- ensure awareness of anything relevant that has been discussed anywhere publicly."
  }'::jsonb,
  'active',
  'Initial scope profile bootstrapped from project spec (v1).',
  now()
)
on conflict (version) do nothing;

insert into known_sources (name, url, source_type, status, added_reason)
values
  ('Modern Retail', 'https://www.modernretail.co/', 'trade_press', 'active', 'Curated v1 source list from spec'),
  ('Retail Dive', 'https://www.retaildive.com/', 'trade_press', 'active', 'Curated v1 source list from spec'),
  ('Chain Store Age', 'https://chainstoreage.com/', 'trade_press', 'active', 'Curated v1 source list from spec'),
  ('Marketplace Pulse', 'https://www.marketplacepulse.com/', 'trade_press', 'active', 'Curated v1 source list from spec'),
  ('The CPG Guys', 'https://www.cpgguys.com/', 'podcast', 'active', 'Curated v1 source list from spec'),
  ('Walmart Corporate Newsroom', 'https://corporate.walmart.com/news', 'newsroom', 'active', 'Official retailer newsroom, curated v1'),
  ('Walmart Investor Relations', 'https://stock.walmart.com/news-events', 'newsroom', 'active', 'Official retailer IR, curated v1 (feeds quarterly rollup)'),
  ('Amazon News (About Amazon)', 'https://www.aboutamazon.com/news', 'newsroom', 'active', 'Official retailer newsroom, curated v1'),
  ('Amazon Global Press Center', 'https://press.aboutamazon.com/', 'newsroom', 'active', 'Official retailer newsroom, curated v1'),
  ('Target Newsroom', 'https://corporate.target.com/press', 'newsroom', 'active', 'Official retailer newsroom, curated v1')
on conflict (name) do nothing;
