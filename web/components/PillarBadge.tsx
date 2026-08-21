import { PILLAR_COLOR_VAR, isHueCodedPillar } from "@/lib/colors";
import { PILLAR_LABELS, type Pillar } from "@/lib/types";

// The one axis that's true hue-color-coded (validated 3-slot palette —
// see lib/colors.ts). A color dot carries the hue; the label stays in
// normal ink (never white-on-fill, which would need a separate contrast
// check per color and risks failing for the lighter slots) — matches the
// dataviz skill's rule that text wears text tokens, never the series
// color, and that identity is never color-alone.
//
// investor_earnings can't take a 4th hue (see lib/colors.ts) — its dot
// is outlined/unfilled instead, same simpler treatment as Category's
// badges, since this dot is always paired with the label right next to
// it and doesn't have the Calendar grid's "disappears next to color"
// problem.
export default function PillarBadge({ pillar }: { pillar: Pillar }) {
  const hueCoded = isHueCodedPillar(pillar);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
      {hueCoded ? (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: PILLAR_COLOR_VAR[pillar] }}
        />
      ) : (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full border border-neutral-400 dark:border-neutral-500"
        />
      )}
      {PILLAR_LABELS[pillar]}
    </span>
  );
}
