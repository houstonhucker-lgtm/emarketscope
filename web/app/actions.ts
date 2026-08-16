"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Insert-only: the feedback table has no per-user identity column (fine
// for a 1-3 person app; see supabase/migrations init.sql), so this
// accumulates votes rather than toggling/upserting a single user's vote.
export async function submitFeedback(digestItemId: string, vote: "up" | "down") {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({ digest_item_id: digestItemId, vote });
  if (error) {
    return { ok: false, message: error.message };
  }
  revalidatePath("/weekly");
  revalidatePath("/monthly");
  revalidatePath("/quarterly");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function submitForward(url: string, note: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("forwarded_items").insert({
    extracted_url: url || null,
    body: note || null,
    status: "pending",
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  revalidatePath("/capture");
  return { ok: true };
}
