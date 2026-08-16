// Small, fixed email allowlist -- Houston + up to a couple of friends, per
// the spec's user count. No self-serve signup: this is checked before a
// magic link is ever sent (app/login/actions.ts) and again on every
// request (lib/supabase/middleware.ts), so a session reached some other
// way (or an email removed after the fact) doesn't stay trusted.

function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAllowedEmails().includes(email.trim().toLowerCase());
}
