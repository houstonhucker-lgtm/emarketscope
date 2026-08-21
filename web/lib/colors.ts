// Pillar ("type") color-coding. Validated with the dataviz skill's
// palette validator (node scripts/validate_palette.js) as a 3-slot
// categorical palette: all-pairs CVD ΔE 9.2 light / 9.4 dark, normal-
// vision ΔE 24.0 light / 20.9 dark — both comfortably clear of the CVD
// (≥8) and normal-vision (≥15) floors. CSS custom properties live in
// app/globals.css so light/dark swap automatically with the OS setting.
//
// Category (5 values) is deliberately NOT hue-coded — validating 5
// simultaneous slots from the same 8-hue reference palette under
// all-pairs comparison hard-FAILs the normal-vision floor (worst pair
// ΔE 12.9, below the 15 floor) in both modes; the skill's own guidance
// is explicit that text labels don't excuse a hard FAIL ("secondary
// encoding does not excuse this one"). Category is instead shown as
// neutral outlined badges with the category name always spelled out —
// fully filterable, just not claiming a false level of colorblind-safe
// visual distinction. See references/palette.md in the dataviz skill for
// the full validator output this decision is based on.
//
// The 4th pillar, "investor_earnings" (added later), hits the same
// wall for the same reason: the skill's own color-formula.md states the
// reference 8-hue palette validates all-pairs with only its first
// three slots, and "no ordering of the full eight can pass" — not a
// palette change, a hard cap. Pillar color-coding is genuinely an
// all-pairs context (the Calendar grid's bars can put any two pillars
// directly adjacent in the same week), so this cap applies here the
// same way it did to Category. Rather than drop investor_earnings to a
// plain neutral fill (which reads as empty/absent next to three bold
// colors on a busy grid), it carries identity via a diagonal-hatch
// pattern instead of a competing hue — see PILLAR_PATTERN_CLASS and
// app/globals.css's .pillar-bar-pattern. Filter pills/badges use the
// simpler outlined/no-fill treatment instead (same as Category), since
// they're always paired with a visible text label and don't have the
// grid's "disappears next to color" problem.

import type { Pillar } from "./types";

export const PILLAR_COLOR_VAR: Record<Exclude<Pillar, "investor_earnings">, string> = {
  ux_feature: "var(--pillar-ux-feature)",
  signature_event: "var(--pillar-signature-event)",
  calendar: "var(--pillar-calendar)",
};

// CSS class for the diagonal-hatch pattern used wherever investor_earnings
// would otherwise need a solid fill color (see app/globals.css).
export const PILLAR_PATTERN_CLASS = "pillar-bar-pattern";

export function isHueCodedPillar(pillar: Pillar): pillar is Exclude<Pillar, "investor_earnings"> {
  return pillar !== "investor_earnings";
}
