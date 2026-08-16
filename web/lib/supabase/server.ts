// Server-side Supabase client for Server Components, Server Actions, and
// Route Handlers. Uses the current getAll/setAll cookie API (the
// deprecated get/set/remove methods miss refresh-token edge cases).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component (not a Server Action or Route
            // Handler) — cookies() is read-only there. Safe to ignore as
            // long as proxy.ts refreshes the session on every request.
          }
        },
      },
    },
  );
}
