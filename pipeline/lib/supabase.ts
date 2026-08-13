// Supabase client for the pipeline side. Always uses the service role key —
// the pipeline is the only writer; web/ reads with the anon key and never
// touches this file.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import type {
  CalendarEntryInsert,
  DigestItemInsert,
  KnownSource,
  PipelineRun,
  RunStatus,
  RunType,
  ScopeProfileVersion,
} from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export async function getActiveScopeProfile(): Promise<ScopeProfileVersion> {
  const { data, error } = await supabase
    .from("scope_profile_versions")
    .select("*")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`Failed to load active scope profile: ${error.message}`);
  return data as ScopeProfileVersion;
}

export async function getActiveKnownSources(): Promise<KnownSource[]> {
  const { data, error } = await supabase
    .from("known_sources")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load known sources: ${error.message}`);
  return (data ?? []) as KnownSource[];
}

export async function createPipelineRun(runType: RunType): Promise<PipelineRun> {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({ run_type: runType, status: "running" })
    .select()
    .single();
  if (error) throw new Error(`Failed to create pipeline run: ${error.message}`);
  return data as PipelineRun;
}

export async function finishPipelineRun(
  id: string,
  status: RunStatus,
  itemsFound: number | null,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("pipeline_runs")
    .update({ status, items_found: itemsFound, notes, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to finalize pipeline run: ${error.message}`);
}

// Returns the inserted rows (with their generated ids) so callers can link
// calendar entries back to the digest item that produced them.
export async function insertDigestItems(
  items: DigestItemInsert[],
): Promise<{ id: string; source_url: string }[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase
    .from("digest_items")
    .insert(items)
    .select("id, source_url");
  if (error) throw new Error(`Failed to insert digest items: ${error.message}`);
  return data as { id: string; source_url: string }[];
}

export async function insertCalendarEntries(entries: CalendarEntryInsert[]): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await supabase.from("calendar_entries").insert(entries);
  if (error) throw new Error(`Failed to insert calendar entries: ${error.message}`);
}

// Existing source_urls for a given week, used by judge.ts to dedupe against
// items already stored (e.g. a re-run after a partial failure).
export async function getExistingSourceUrlsForWeek(weekOf: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("digest_items")
    .select("source_url")
    .eq("week_of", weekOf);
  if (error) throw new Error(`Failed to load existing digest items: ${error.message}`);
  return new Set((data ?? []).map((row) => row.source_url as string));
}

// Bumps hit_count/last_hit_at for known sources that produced at least one
// item this run. Matches by source_name (case-insensitive) — items whose
// source_name doesn't match a known source are left alone (they came from
// the standing broad search, not the curated list).
export async function recordKnownSourceHits(sourceNames: string[]): Promise<void> {
  const unique = [...new Set(sourceNames.filter(Boolean))];
  for (const name of unique) {
    const { data: existing, error: fetchError } = await supabase
      .from("known_sources")
      .select("id, hit_count, first_hit_at")
      .ilike("name", name)
      .maybeSingle();
    if (fetchError) {
      console.warn(`Could not look up known source "${name}": ${fetchError.message}`);
      continue;
    }
    if (!existing) continue; // not a curated source — fine, it's from broad search
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("known_sources")
      .update({
        hit_count: (existing.hit_count as number) + 1,
        last_hit_at: now,
        first_hit_at: existing.first_hit_at ?? now,
      })
      .eq("id", existing.id as string);
    if (updateError) {
      console.warn(`Could not update hit stats for "${name}": ${updateError.message}`);
    }
  }
}
