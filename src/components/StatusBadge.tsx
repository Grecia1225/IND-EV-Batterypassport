import type { LifeStage } from "../lib/types";
import { stageLabel } from "../lib/calculations";

const STAGE_STYLES: Record<LifeStage, string> = {
  healthy: "bg-[var(--color-status-good-dim)] text-[var(--color-status-good)] border-[var(--color-status-good)]/30",
  "second-life": "bg-[var(--color-status-warn-dim)] text-[var(--color-status-warn)] border-[var(--color-status-warn)]/30",
  retire: "bg-[var(--color-status-bad-dim)] text-[var(--color-status-bad)] border-[var(--color-status-bad)]/30",
};

const STAGE_DOT: Record<LifeStage, string> = {
  healthy: "bg-[var(--color-status-good)]",
  "second-life": "bg-[var(--color-status-warn)]",
  retire: "bg-[var(--color-status-bad)]",
};

export function StatusBadge({ stage }: { stage: LifeStage }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${STAGE_STYLES[stage]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[stage]}`} />
      {stageLabel(stage)}
    </span>
  );
}