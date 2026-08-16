# web/

Next.js 16 (App Router) app, deployed separately from `pipeline/` (Vercel).
Reads from Supabase directly with the anon key — never calls the Claude
API, so API keys and cost stay entirely on the Actions/pipeline side.

## Auth

Real authentication, not an unguessable URL: Supabase Auth magic-link
(passwordless email) + a small hardcoded email allowlist
(`ALLOWED_EMAILS`, comma-separated — no self-serve signup). Enforced twice:

- Before a magic link is ever sent (`app/login/actions.ts`)
- On every request, re-checked against a live session
  (`lib/supabase/middleware.ts`) — a session for an email later removed
  from the allowlist gets signed out, not trusted indefinitely

This only works because RLS is enabled on every table
(`supabase/migrations/*_enable_rls.sql`) — the anon key has zero access
without an authenticated session; auth on the Next.js side would otherwise
be decorative since the anon key is public-ish and Supabase's REST API
sits behind it regardless of what the app's UI does.

`proxy.ts` (Next.js 16 renamed Middleware to Proxy) refreshes the session
and does the redirect gating on every request.

## Tabs

Weekly, Monthly, Quarterly, Calendar (dedicated — expected to be the
most-used tab, and the default landing route), Capture. Every item
everywhere is a clickable link back to its source
(`components/ItemCard.tsx`), with thumbs up/down feedback
(`components/FeedbackButtons.tsx`).

Monthly/Quarterly are placeholder shells until Phase 6's synthesis job
exists — there's no rollup data to show yet.

## Calendar color-coding

Two independent filter axes per spec: **type** (pillar) and **category**.
Only *type* is true hue-color-coded — validated with the dataviz skill's
palette validator as a 3-slot categorical palette (all-pairs CVD/normal-
vision checks pass in both light and dark). *Category* (5 values)
deliberately is **not** hue-coded: validating 5 simultaneous slots from
the same reference palette hard-FAILs the normal-vision floor, and the
skill is explicit that visible text labels don't excuse that particular
failure. Category is shown as neutral outlined badges with the name
always spelled out instead — fully filterable, just not claiming a false
level of colorblind-safe visual distinction. See `lib/colors.ts` for the
full reasoning and the validator numbers.

## PWA

`public/manifest.webmanifest` + `public/apple-touch-icon.png` +
`appleWebApp` metadata in `app/layout.tsx`, so it installs to a phone home
screen as a standalone app. Icons are placeholder flat-color PNGs
(`public/icons/`, `public/apple-touch-icon.png`) — swap for a real
mark/logo whenever one exists; nothing else needs to change.

## Local dev

```sh
cp .env.example .env.local   # fill in Supabase URL/anon key + ALLOWED_EMAILS
npm install
npm run dev
```
