import { PILLAR_COLOR_VAR } from "@/lib/colors";
import { PILLAR_LABELS, type Pillar } from "@/lib/types";

// The one axis that's true hue-color-coded (validated 3-slot palette —
// see lib/colors.ts). A color dot carries the hue; the label stays in
// normal ink (never white-on-fill, which would need a separate contrast
// check per color and risks failing for the lighter slots) — matches the
// dataviz skill's rule that text wears text tokens, never the series
// color, and that identity is never color-alone.
export default function PillarBadge({ pillar }: { pillar: Pillar }) {
  const color = PILLAR_COLOR_VAR[pillar];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {PILLAR_LABELS[pillar]}
    </span>
  );
}
