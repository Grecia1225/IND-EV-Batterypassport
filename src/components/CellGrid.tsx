import type { CellHealth } from "../lib/types";

function colorFor(sohPct: number, flagged: boolean): string {
  if (flagged) return "bg-[var(--color-status-bad-dim)] border-[var(--color-status-bad)] text-[var(--color-status-bad)]";
  if (sohPct >= 80) return "bg-[var(--color-status-good-dim)] border-[var(--color-status-good)] text-[var(--color-status-good)]";
  return "bg-[var(--color-status-warn-dim)] border-[var(--color-status-warn)] text-[var(--color-status-warn)]";
}

export function CellGrid({
  cellHealths,
  selectedCellId,
  onSelect,
}: {
  cellHealths: CellHealth[];
  selectedCellId: string | null;
  onSelect: (cellId: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
      {cellHealths.map((cell, i) => {
        const isSelected = cell.cellId === selectedCellId;
        return (
          <button
            key={cell.cellId}
            onClick={() => onSelect(cell.cellId)}
            className={`relative aspect-square rounded-lg border-2 flex flex-col items-center justify-center font-mono transition
              ${colorFor(cell.sohPct, cell.flagged)}
              ${isSelected ? "ring-2 ring-[var(--color-accent-400)] ring-offset-2 ring-offset-[var(--color-graphite-950)]" : ""}
            `}
            title={`Cell ${i + 1} — ${cell.sohPct}% life`}
          >
            <span className="text-[10px] text-[var(--color-ink-500)] absolute top-1 left-1.5">{i + 1}</span>
            <span className="text-sm font-semibold">{Math.round(cell.sohPct)}%</span>
            {cell.flagged && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[var(--color-status-bad)] border border-[var(--color-graphite-950)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}