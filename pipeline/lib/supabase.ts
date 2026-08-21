// Supabase client for the pipeline side. Always uses the service role key —
// the pipeline is the only writer; web/ reads with the anon key and never
// touches this file.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import type {
  CalendarEntryInsert,
  CalendarEntryRow,
  DigestItemInsert,
  DigestItemRow,
  EarningsDateInsert,
  EarningsDateRow,
  ForwardedItem,
  KnownSource,
  PipelineRun,
  Retailer,
  RollupInsert,
  RunStatus,
  RunType,
  ScopeProfile,
  ScopeProfileVersion,
  SourceCoverageAuditInsert,
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

export interface FinishPipelineRunOptions {
  itemsFound?: number | null;
  notes?: string | null;
  estimatedCostUsd?: number | null;
}

export async function finishPipelineRun(
  id: string,
  status: RunStatus,
  options: FinishPipelineRunOptions = {},
): Promise<void> {
  const { itemsFound = null, notes = null, estimatedCostUsd = null } = options;
  const { error } = await supabase
    .from("pipeline_runs")
    .update({
      status,
      items_found: itemsFound,
      notes,
      estimated_cost_usd: estimatedCostUsd,
      finished_at: new Date().toISOString(),
    })
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

// All existing source_urls, regardless of week — used by the backfill job
// instead of getExistingSourceUrlsForWeek since a backfill run spans many
// weeks/chunks and needs to dedupe against everything already stored
// (including items written by earlier chunks in the same backfill run).
export async function getAllExistingSourceUrls(): Promise<Set<string>> {
  const { data, error } = await supabase.from("digest_items").select("source_url");
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

export async function getPendingForwardedItems(limit: number): Promise<ForwardedItem[]> {
  const { data, error } = await supabase
    .from("forwarded_items")
    .select("*")
    .eq("status", "pending")
    .order("received_at", { ascending: true })
    .limit(limit)
    .returns<ForwardedItem[]>();
  if (error) throw new Error(`Failed to load pending forwarded items: ${error.message}`);
  return data ?? [];
}

export async function insertSourceCoverageAudit(audit: SourceCoverageAuditInsert): Promise<void> {
  const { error } = await supabase.from("source_coverage_audits").insert(audit);
  if (error) throw new Error(`Failed to insert source coverage audit: ${error.message}`);
}

export async function markForwardedItemProcessed(
  id: string,
  resultingDigestItemId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("forwarded_items")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      resulting_digest_item_id: resultingDigestItemId,
    })
    .eq("id", id);
  if (error) throw new Error(`Failed to mark forwarded item processed: ${error.message}`);
}

// Flags a source as a known-sources candidate for human review — never
// 'active' directly (that would be the pipeline silently expanding its
// own source list, which the spec's "no silent self-modification" rule
// is explicitly about). No-ops if a source with this name already exists
// in any status, so a source that produces multiple independent hits
// doesn't create duplicate candidate rows.
export async function flagCandidateKnownSource(
  name: string,
  url: string | null,
  addedReason: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("known_sources")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (fetchError) {
    console.warn(`Could not check for existing known source "${name}": ${fetchError.message}`);
    return;
  }
  if (existing) return;

  const { error: insertError } = await supabase.from("known_sources").insert({
    name,
    url,
    source_type: "other",
    status: "candidate",
    added_reason: addedReason,
  });
  if (insertError) {
    console.warn(`Could not flag candidate known source "${name}": ${insertError.message}`);
  }
}

// --- Review-checkpoint evidence gathering (propose-scope-changes.ts) ---

export interface FeedbackWithItem {
  vote: "up" | "down";
  note: string | null;
  digest_item: {
    title: string;
    pillar: string;
    categories: string[];
    retailers: string[];
  } | null;
}

export async function getAllFeedbackWithItems(): Promise<FeedbackWithItem[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("vote, note, digest_item:digest_items(title, pillar, categories, retailers)");
  if (error) throw new Error(`Failed to load feedback: ${error.message}`);
  return (data ?? []) as unknown as FeedbackWithItem[];
}

export interface SourceCoverageAuditRow {
  was_independently_findable: boolean | null;
  evidence_url: string | null;
  notes: string | null;
  checked_at: string;
}

export async function getAllSourceCoverageAudits(): Promise<SourceCoverageAuditRow[]> {
  const { data, error } = await supabase
    .from("source_coverage_audits")
    .select("was_independently_findable, evidence_url, notes, checked_at");
  if (error) throw new Error(`Failed to load source coverage audits: ${error.message}`);
  return data ?? [];
}

export async function getCandidateKnownSources(): Promise<KnownSource[]> {
  const { data, error } = await supabase
    .from("known_sources")
    .select("*")
    .eq("status", "candidate")
    .order("hit_count", { ascending: false })
    .returns<KnownSource[]>();
  if (error) throw new Error(`Failed to load candidate known sources: ${error.message}`);
  return data ?? [];
}

export async function getNextScopeProfileVersion(): Promise<number> {
  const { data, error } = await supabase
    .from("scope_profile_versions")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`Failed to load latest scope profile version: ${error.message}`);
  return (data?.version as number) + 1;
}

export async function insertProposedScopeProfile(
  version: number,
  content: ScopeProfile,
  proposedReason: string,
): Promise<void> {
  const { error } = await supabase.from("scope_profile_versions").insert({
    version,
    content,
    status: "proposed",
    proposed_reason: proposedReason,
  });
  if (error) throw new Error(`Failed to insert proposed scope profile: ${error.message}`);
}

// --- Monthly/quarterly rollups ---

// [periodStart, periodEnd) by week_of -- a reasonable approximation for a
// personal-scale tool; a week straddling the boundary lands wherever its
// Monday falls, same grouping weekly/page.tsx already uses.
export async function getDigestItemsInRange(periodStart: string, periodEnd: string): Promise<DigestItemRow[]> {
  const { data, error } = await supabase
    .from("digest_items")
    .select("*")
    .eq("is_backfill", false)
    .gte("week_of", periodStart)
    .lt("week_of", periodEnd)
    .order("week_of", { ascending: true })
    .returns<DigestItemRow[]>();
  if (error) throw new Error(`Failed to load digest items in range: ${error.message}`);
  return data ?? [];
}

export async function getCalendarEntriesInRange(
  periodStart: string,
  periodEnd: string,
): Promise<CalendarEntryRow[]> {
  const { data, error } = await supabase
    .from("calendar_entries")
    .select("*")
    .eq("is_backfill", false)
    .gte("event_date", periodStart)
    .lt("event_date", periodEnd)
    .order("event_date", { ascending: true })
    .returns<CalendarEntryRow[]>();
  if (error) throw new Error(`Failed to load calendar entries in range: ${error.message}`);
  return data ?? [];
}

export async function insertRollup(rollup: RollupInsert): Promise<void> {
  const { error } = await supabase.from("rollups").insert(rollup);
  if (error) throw new Error(`Failed to insert rollup: ${error.message}`);
}

// --- Spend guardrail (Phase 7) ---

// Sums estimated_cost_usd across every run_type since the 1st of the
// current UTC month, including the in-progress row for whatever script
// is calling this (it's the caller's job to check this *before* creating
// its own run, or to account for that). Small personal-scale table, so a
// client-side reduce is simpler and less version-fragile than relying on
// a PostgREST aggregate query shape.
export async function getMonthToDateSpendUsd(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("estimated_cost_usd")
    .gte("started_at", monthStart);
  if (error) throw new Error(`Failed to load month-to-date spend: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + ((row.estimated_cost_usd as number | null) ?? 0), 0);
}

// --- Earnings dates (date-driven investor-signal checks) ---

export async function getLatestEarningsDate(retailer: Retailer): Promise<EarningsDateRow | null> {
  const { data, error } = await supabase
    .from("earnings_dates")
    .select("*")
    .eq("retailer", retailer)
    .order("expected_report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load latest earnings date for ${retailer}: ${error.message}`);
  return data as EarningsDateRow | null;
}

export async function insertEarningsDate(row: EarningsDateInsert): Promise<EarningsDateRow> {
  const { data, error } = await supabase.from("earnings_dates").insert(row).select().single();
  if (error) throw new Error(`Failed to insert earnings date: ${error.message}`);
  return data as EarningsDateRow;
}

export async function markEarningsDateChecked(id: string): Promise<void> {
  const { error } = await supabase
    .from("earnings_dates")
    .update({ checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to mark earnings date checked: ${error.message}`);
}

// Refines a still-estimated row in place once a real announced date is
// found (or just touches updated_at to record a discovery attempt that
// found nothing yet, throttling how often the next attempt fires).
export async function updateEarningsDate(
  id: string,
  fields: { expected_report_date?: string; fiscal_period_label?: string; confirmed?: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("earnings_dates")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to update earnings date: ${error.message}`);
}

// --- Retroactive rollups backfill (pipeline/backfill/rollups.ts) ---

// Every week_of that has at least one backfilled item -- used to derive
// which real months/quarters actually have data, rather than looping
// over the whole 2-year window and hitting mostly-empty periods.
export async function getAllBackfillWeekOfs(): Promise<string[]> {
  const { data, error } = await supabase.from("digest_items").select("week_of").eq("is_backfill", true);
  if (error) throw new Error(`Failed to load backfill week_of values: ${error.message}`);
  return (data ?? []).map((row) => row.week_of as string);
}

// Deliberately the inverse of getDigestItemsInRange (is_backfill=true,
// not false) -- the live monthly/quarterly jobs correctly exclude
// backfill items (that's the whole point of the is_backfill flag: old
// items never look like "this month's news"), but this script's entire
// job is retroactively synthesizing over exactly that backfilled data.
export async function getBackfillDigestItemsInRange(
  periodStart: string,
  periodEnd: string,
): Promise<DigestItemRow[]> {
  const { data, error } = await supabase
    .from("digest_items")
    .select("*")
    .eq("is_backfill", true)
    .gte("week_of", periodStart)
    .lt("week_of", periodEnd)
    .order("week_of", { ascending: true })
    .returns<DigestItemRow[]>();
  if (error) throw new Error(`Failed to load backfill digest items in range: ${error.message}`);
  return data ?? [];
}

export async function rollupExists(rollupType: "monthly" | "quarterly", periodLabel: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("rollups")
    .select("id")
    .eq("rollup_type", rollupType)
    .eq("period_label", periodLabel)
    .limit(1);
  if (error) throw new Error(`Failed to check existing rollup: ${error.message}`);
  return (data ?? []).length > 0;
}
