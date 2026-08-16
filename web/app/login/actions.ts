"use server";

import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/supabase/allowlist";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

export async function sendMagicLink(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  // Checked here, before a magic link is ever requested from Supabase --
  // not just in proxy.ts after the fact. Generic message either way so
  // this doesn't double as an email-enumeration oracle.
  if (!isAllowedEmail(email)) {
    return { status: "error", message: "That email isn't on the access list." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { status: "error", message: "Something went wrong sending the link. Try again." };
  }

  return { status: "sent", message: `Check ${email} for a sign-in link.` };
}
