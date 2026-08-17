// Processes pending forwarded_items (from the inbox or the Capture tab's
// web form — same table, same status flow either way): for each, runs
// the source-coverage audit (was this independently publicly findable?),
// records the result, flags a candidate known source when the evidence
// came from somewhere not already in known_sources, and marks the item
// processed either way. Does NOT create a digest_item from a forwarded
// item directly — that's a narrower, factual coverage check, not a full
// scope-profile relevance judgment (see prompts/source-audit.md).
//
// Called as a step in weekly/run.ts (see that file), same as
// ingest-inbox.ts — this is how forwarding something "folds into the
// next run" per spec, for both the email and web-form paths.

import { auditForwardedItem, emptyUsage, mergeUsage, type RunUsage } from "../lib/claude.js";
import {
  flagCandidateKnownSource,
  getPendingForwardedItems,
  insertSourceCoverageAudit,
  markForwardedItemProcessed,
} from "../lib/supabase.js";

const MAX_ITEMS_PER_RUN = Number(process.env.FEEDBACK_AUDIT_MAX_ITEMS ?? 10);

export interface AuditRunResult {
  processed: number;
  findable: number;
  notFindable: number;
  candidatesFlagged: number;
  usage: RunUsage;
}

export async function runSourceAudits(): Promise<AuditRunResult> {
  const usage = emptyUsage();
  let processed = 0;
  let findable = 0;
  let notFindable = 0;
  let candidatesFlagged = 0;

  const pending = await getPendingForwardedItems(MAX_ITEMS_PER_RUN);
  if (pending.length === 0) {
    return { processed, findable, notFindable, candidatesFlagged, usage };
  }

  for (const item of pending) {
    const { result, usage: itemUsage } = await auditForwardedItem({
      subject: item.subject,
      body: item.body,
      extractedUrl: item.extracted_url,
    });
    mergeUsage(usage, itemUsage);

    if (!result) {
      // Refusal or empty response — leave pending, retried next run
      // rather than silently marked done with no real audit.
      console.warn(`Audit produced no result for forwarded_item ${item.id} — left pending.`);
      continue;
    }

    await insertSourceCoverageAudit({
      forwarded_item_id: item.id,
      was_independently_findable: result.was_independently_findable,
      evidence_url: result.evidence_url ?? null,
      notes: result.notes,
    });

    if (result.was_independently_findable) {
      findable++;
      if (result.evidence_source_name) {
        await flagCandidateKnownSource(
          result.evidence_source_name,
          result.evidence_url ?? null,
          `Source-coverage audit: independently surfaced forwarded_item ${item.id} (${result.notes})`,
        );
        candidatesFlagged++;
      }
    } else {
      notFindable++;
    }

    // No digest_item is created here (see header comment) — nothing to
    // link, but the item is fully reviewed either way.
    await markForwardedItemProcessed(item.id, null);
    processed++;
  }

  return { processed, findable, notFindable, candidatesFlagged, usage };
}
