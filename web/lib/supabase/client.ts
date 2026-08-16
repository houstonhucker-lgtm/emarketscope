// Browser-side Supabase client. Reads via the anon key, gated entirely by
// the RLS policies added in supabase/migrations/20260816191612_enable_rls.sql
// — an authenticated session is required for any row to come back.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
