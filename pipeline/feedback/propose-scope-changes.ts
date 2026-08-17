// Review-checkpoint tool: manually run every 1-2 months (per spec), NOT
// on the weekly cron. Gathers accumulated feedback evidence and asks
// Claude to draft a proposed scope profile revision — written as a new
// scope_profile_versions row with status='proposed', never activated
// automatically. Promoting a proposal to active is a separate, deliberate
// step (see the SQL note at the end of this file's output).
//
// Invoked manually via `npm run propose-scope-changes`.

import {
  createPipelineRun,
  finishPipelineRun,
  getActiveScopeProfile,
  getAllFeedbackWithItems,
  getAllSourceCoverageAudits,
  getCandidateKnownSources,
  getNextScopeProfileVersion,
  insertProposedScopeProfile,
} from "../lib/supabase.js";
import { proposeScopeChanges } from "../lib/claude.js";
import { checkMonthlySpendGuardrail, guardrailNote } from "../lib/guardrails.js";

function buildEvidenceSummary(
  feedback: Awaited<ReturnType<typeof getAllFeedbackWithItems>>,
  audits: Awaited<ReturnType<typeof getAllSourceCoverageAudits>>,
  candidateSources: Awaited<ReturnType<typeof getCandidateKnownSources>>,
): string {
  const parts: string[] = [];

  // --- Feedback, broken down by pillar and category ---
  const withItem = feedback.filter((f) => f.digest_item !== null);
  parts.push(`### Feedback (${feedback.length} total vote(s), ${withItem.length} linked to a live digest item)`);
  if (withItem.length === 0) {
    parts.push("No feedback recorded yet.");
  } else {
    const byPillar = new Map<string, { up: number; down: number }>();
    const byCategory = new Map<string, { up: number; down: number }>();
    for (const f of withItem) {
      const item = f.digest_item!;
      const pillarCounts = byPillar.get(item.pillar) ?? { up: 0, down: 0 };
      pillarCounts[f.vote]++;
      byPillar.set(item.pillar, pillarCounts);
      for (const cat of item.categories) {
        const catCounts = byCategory.get(cat) ?? { up: 0, down: 0 };
        catCounts[f.vote]++;
        byCategory.set(cat, catCounts);
      }
    }
    parts.push("By pillar:");
    for (const [pillar, counts] of byPillar) {
      parts.push(`- ${pillar}: ${counts.up} up, ${counts.down} down`);
    }
    parts.push("By category:");
    for (const [cat, counts] of byCategory) {
      parts.push(`- ${cat}: ${counts.up} up, ${counts.down} down`);
    }
    const downWithNotes = withItem.filter((f) => f.vote === "down" && f.note);
    if (downWithNotes.length > 0) {
      parts.push("Thumbs-down notes:");
      for (const f of downWithNotes) {
        parts.push(`- "${f.digest_item!.title}": ${f.note}`);
      }
    }
  }

  // --- Source-coverage audits ---
  parts.push(`\n### Source-coverage audits (${audits.length} total)`);
  if (audits.length === 0) {
    parts.push("No audits run yet.");
  } else {
    const findable = audits.filter((a) => a.was_independently_findable === true).length;
    const notFindable = audits.filter((a) => a.was_independently_findable === false).length;
    parts.push(`${findable} independently findable, ${notFindable} not findable.`);
  }

  // --- Candidate known sources ---
  parts.push(`\n### Candidate known sources (${candidateSources.length}, awaiting promotion to active)`);
  if (candidateSources.length === 0) {
    parts.push("None flagged yet.");
  } else {
    for (const s of candidateSources) {
      parts.push(`- ${s.name} (${s.url ?? "no url"}) — hit_count=${s.hit_count} — ${s.added_reason ?? ""}`);
    }
  }

  return parts.join("\n");
}

async function main() {
  console.log("Gathering evidence for scope profile review...");

  const run = await createPipelineRun("scope_proposal");
  console.log(`pipeline_runs.id = ${run.id}`);

  const guardrail = await checkMonthlySpendGuardrail();
  if (!guardrail.allowed) {
    const note = guardrailNote(guardrail);
    console.error(note);
    await finishPipelineRun(run.id, "failed", { notes: note });
    process.exitCode = 1;
    return;
  }

  try {
    const [activeProfile, feedback, audits, candidateSources] = await Promise.all([
      getActiveScopeProfile(),
      getAllFeedbackWithItems(),
      getAllSourceCoverageAudits(),
      getCandidateKnownSources(),
    ]);

    const evidenceSummary = buildEvidenceSummary(feedback, audits, candidateSources);
    console.log(`\n${evidenceSummary}\n`);

    console.log("Asking Claude to draft a proposal...");
    const { proposal, usage } = await proposeScopeChanges(activeProfile.content, evidenceSummary);

    console.log(
      `Usage: ${usage.api_calls} API call(s), ${usage.input_tokens} input tokens, ` +
        `${usage.output_tokens} output tokens. Estimated cost: $${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis}).`,
    );

    if (!proposal) {
      const notes = "No proposal produced (refusal or empty response). Nothing written.";
      console.error(notes);
      await finishPipelineRun(run.id, "failed", { notes, estimatedCostUsd: usage.estimated_cost_usd });
      process.exitCode = 1;
      return;
    }

    const nextVersion = await getNextScopeProfileVersion();
    await insertProposedScopeProfile(nextVersion, proposal.profile, proposal.change_summary);

    console.log(`\nProposal written as scope_profile_versions v${nextVersion} (status=proposed).`);
    console.log(`Change summary:\n${proposal.change_summary}`);
    console.log(
      `\nThis is NOT active yet -- review it, then promote it deliberately:\n` +
        `  update scope_profile_versions set status = 'active' where version = ${nextVersion};`,
    );

    const notes =
      `proposed_version=${nextVersion} | api_calls=${usage.api_calls} input_tokens=${usage.input_tokens} ` +
      `output_tokens=${usage.output_tokens} est_cost_usd=${usage.estimated_cost_usd.toFixed(4)} (${usage.pricing_basis})`;
    await finishPipelineRun(run.id, "success", { itemsFound: 1, notes, estimatedCostUsd: usage.estimated_cost_usd });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Scope proposal failed: ${message}`);
    await finishPipelineRun(run.id, "failed", { notes: message });
    process.exitCode = 1;
  }
}

main();
