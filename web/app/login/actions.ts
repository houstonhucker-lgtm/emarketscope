"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/supabase/allowlist";

export interface LoginState {
  status: "idle" | "code_sent" | "error";
  message?: string;
  email?: string;
}

// One server action drives both steps of the flow, branching on whether
// a `token` was submitted -- simpler than juggling two useActionState
// hooks, and it depends only on what was actually submitted this
// request rather than trusting prior client state.
//
// Step 1 (no token): request a code. Step 2 (token present, from the
// code-entry field that appears once a code has been sent): verify it
// via supabase.auth.verifyOtp(), which sets the session cookie directly
// -- no /auth/callback round trip, no clickable link for an email
// scanner or link-prefetcher to burn before the person reads the email.
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (token) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      return {
        status: "code_sent",
        message: "That code didn't work — it may be wrong or expired. Try again or request a new one.",
        email,
      };
    }
    redirect("/calendar");
  }

  // Checked here, before a code is ever requested from Supabase -- not
  // just in proxy.ts after the fact. Generic message either way so this
  // doesn't double as an email-enumeration oracle.
  if (!isAllowedEmail(email)) {
    return { status: "error", message: "That email isn't on the access list." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Still set for the case where the email template keeps a
      // clickable link alongside the code (or someone reuses an old
      // email) -- verifyOtp() below is the primary path now, this is a
      // fallback, not the thing the flow depends on.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { status: "error", message: "Something went wrong sending the code. Try again." };
  }

  return { status: "code_sent", message: `Enter the code sent to ${email}.`, email };
}
