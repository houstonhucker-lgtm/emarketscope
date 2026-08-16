-- eMarketScope — initial data
-- Bootstraps scope_profile_versions (v1, active — the founding profile
-- from the spec, not a feedback-driven proposal) and known_sources (the
-- v1 curated list from the spec).
--
-- The scope_profile_versions insert uses `on conflict ... do update` (not
-- do nothing) so re-running this file after a spec revision actually
-- corrects v1's content instead of silently no-op'ing — this is a human-
-- directed correction to the seed data itself, not the automated
-- feedback-driven proposal flow the "no silent self-modification" rule
-- in the spec is about (that flow doesn't exist until Phase 5).
-- known_sources stays on conflict do nothing: hit_count/last_hit_at
-- evolve via the running pipeline and shouldn't be reset by reseeding.

insert into scope_profile_versions (version, content, status, proposed_reason, reviewed_at)
values (
  1,
  '{
    "retailers": {
      "walmart": {"tier": "core", "note": "core, weekly attention"},
      "amazon": {"tier": "core", "note": "core, weekly attention"},
      "target": {"tier": "light", "note": "major launches and event-period behavior only"}
    },
    "categories": {
      "household_essentials": {
        "label": "Household Essentials (HHE)",
        "subcategories": {
          "home_care": ["laundry care", "air care", "dish care", "all purpose cleaners", "bath and toilet/drain", "pest control", "mops & brooms/quick-clean (Swiffer-type products)"],
          "paper_disposable_table_top": ["bath tissue", "paper towels", "facial tissue", "disposable table top", "waste management"]
        }
      },
      "personal_care": {
        "label": "Personal Care",
        "subcategories": {
          "general": ["deodorants", "grooming/beard care", "oral care", "women''s hygiene/incontinence", "bath & body", "sexual wellness", "sunscreen"]
        },
        "note": "sunscreen here overlaps with beauty''s ''suncare & tanning'' entry -- open question whether this is intentional dual-coverage or the same category listed twice; both kept in for now pending confirmation with Houston"
      },
      "baby_care": {
        "label": "Baby Care",
        "subcategories": {
          "general": ["diapers", "wipes", "broader baby category"]
        },
        "priority": "diapers and wipes are the heaviest focus; the broader baby category is relevant at some level but secondary to those two"
      },
      "health": {
        "label": "Health & Wellness",
        "subcategories": {
          "otc_solutions": ["respiratory wellness", "digestive wellness"]
        },
        "note": "OTC solutions specifically -- respiratory and digestive wellness, not health & wellness broadly"
      },
      "beauty": {
        "label": "Beauty",
        "subcategories": {
          "general": ["premium beauty", "makeup", "hair care", "skincare", "fragrance", "nail care", "suncare & tanning"]
        },
        "priority": "hair care is the primary focus within beauty; skincare is secondary focus",
        "note": "suncare & tanning here overlaps with personal_care''s ''sunscreen'' entry -- open question whether this is intentional dual-coverage or the same category listed twice; both kept in for now pending confirmation with Houston"
      }
    },
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
  'v1 scope profile, revised to anchor categories to concrete subcategories/products (not bare department names) per spec update -- sharpens search/judge matching across every pillar, not just UI filter labels.',
  now()
)
on conflict (version) do update set
  content = excluded.content,
  proposed_reason = excluded.proposed_reason;

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
