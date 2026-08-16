// Next.js 16 renamed Middleware to Proxy (same functionality, new file
// name/convention) -- see node_modules/next/dist/docs/01-app/01-getting-
// started/16-proxy.md. Runs on every request to refresh the Supabase
// session and gate unauthenticated/un-allowlisted access.

import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and image optimization files; run on everything
    // else, including auth routes (updateSession itself special-cases
    // /login and /auth so it doesn't redirect-loop).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
