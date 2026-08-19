// Exchanges the magic-link code for a session, then redirects. proxy.ts
// re-checks the allowlist on the very next request, so a code minted for
// an email that's no longer allowed still doesn't get in.
//
// TEMPORARY: logs every hit and surfaces the real failure reason via a
// `reason` query param, instead of only the generic auth_failed message
// -- added while debugging a report that this route never appears in
// Vercel's request logs at all despite Supabase's own logs showing a
// successful OTP verification. If the next attempt shows no
// "[auth/callback] hit" log line either, that confirms the request never
// reaches this route in the first place (check Supabase's Redirect URLs
// allowlist for the exact deployed .../auth/callback URL) rather than
// anything failing inside it. Revert alongside the matching temporary
// bit in app/login/page.tsx once resolved.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/calendar";

  console.log(`[auth/callback] hit: code=${code ? "present" : "MISSING"} next=${next} origin=${origin}`);

  if (!code) {
    console.error("[auth/callback] no code param on request");
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed&reason=${encodeURIComponent("no code param on callback request")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error(`[auth/callback] exchangeCodeForSession failed: ${error.message}`);
    return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${encodeURIComponent(error.message)}`);
  }

  console.log(`[auth/callback] exchange succeeded, redirecting to ${next}`);
  return NextResponse.redirect(`${origin}${next}`);
}
