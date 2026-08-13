// Weekly search step: delegates to lib/claude.ts's single search+judge
// call (see that file's header comment for why search and judgment are
// combined into one Claude call rather than two).

import { searchAndJudge } from "../lib/claude.js";
import type { CandidateItem, KnownSource, ScopeProfile } from "../lib/types.js";

export async function search(
  scopeProfile: ScopeProfile,
  knownSources: KnownSource[],
  weekOf: string,
): Promise<CandidateItem[]> {
  return searchAndJudge(scopeProfile, knownSources, weekOf);
}
