// Exchanges a magic-link code for a session, then redirects. Kept as a
// fallback path now that supabase.auth.verifyOtp() (see app/login/
// actions.ts) is the primary sign-in flow -- emailRedirectTo is still
// set on signInWithOtp, so this still needs to work for anyone who
// clicks a link rather than typing the code, or for an old email still
// sitting in an inbox. proxy.ts re-checks the allowlist on the very next
// request either way, so a code minted for an email that's no longer
// allowed still doesn't get in.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/calendar";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
