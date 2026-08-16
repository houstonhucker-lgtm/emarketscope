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

import type { Pillar } from "./types";

export const PILLAR_COLOR_VAR: Record<Pillar, string> = {
  ux_feature: "var(--pillar-ux-feature)",
  signature_event: "var(--pillar-signature-event)",
  calendar: "var(--pillar-calendar)",
};
