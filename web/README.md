# web/

Phase 4. Small read-mostly web app, deployed separately from `pipeline/`
(e.g. Vercel). Reads from Supabase directly — never calls the Claude API,
so API keys and cost stay entirely on the Actions/pipeline side.

Tabs: Weekly, Monthly, Quarterly, Calendar (dedicated, expected to be the
most-used tab), Capture/feedback.

Every item everywhere is a clickable link back to its source.

Includes a proper `manifest.webmanifest` + `apple-touch-icon` /
`apple-mobile-web-app-*` meta tags so it can be added to a phone home
screen as a standalone app, not just viewed as a responsive page.
