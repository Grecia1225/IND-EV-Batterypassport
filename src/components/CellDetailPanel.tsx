import type { Cell, CellHealth, CellReading } from "../lib/types";
import type { CellProvenanceEntry } from "../lib/dataAccess";

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-[var(--color-graphite-700)] last:border-0">
      <span className="text-sm text-[var(--color-ink-500)]">{label}</span>
      <span className="font-mono text-sm text-[var(--color-ink-100)]">{value}</span>
    </div>
  );
}
const day = (s: string) => new Date(s).toLocaleDateString();

export function CellDetailPanel({ cell, health, positionLabel, priorPackReadings, provenance }: {
  cell: Cell; health: CellHealth; positionLabel: string;
  priorPackReadings: { batteryId: string; readings: CellReading[] } | null;
  provenance?: CellProvenanceEntry[];
}) {
  const r = health.latestReading;
  const wasReused = cell.original_battery_id !== cell.current_battery_id;
  return (
    <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-[var(--color-ink-500)]">{positionLabel}</p>
          <p className="font-mono text-base text-[var(--color-ink-100)]">{cell.id}</p>
        </div>
        {health.flagged && (
          <span className="text-xs font-medium text-[var(--color-status-bad)] bg-[var(--color-status-bad-dim)] border border-[var(--color-status-bad)]/30 rounded-full px-2.5 py-1">
            {health.flagReason}
          </span>
        )}
      </div>
      <div className="mb-4">
        <DataRow label="Life remaining" value={`${health.lifeRemainingPct}%`} />
        <DataRow label="Voltage" value={r ? `${r.voltage_v.toFixed(2)} V` : "No reading yet"} />
        <DataRow label="Internal resistance" value={r && r.resistance_mohm !== null ? `${r.resistance_mohm} mΩ` : "—"} />
        <DataRow label="Temperature" value={r && r.temperature_c !== null ? `${r.temperature_c}°C` : "—"} />
        <DataRow label="Cycle count" value={r ? `${r.cycle_count}` : "—"} />
        <DataRow label="Last recorded" value={r ? day(r.recorded_at) : "—"} />
        <DataRow label="Source" value={r ? r.source.replace("_", " ") : "—"} />
      </div>

      {provenance && provenance.length > 0 && (
        <div className="rounded-lg border border-[var(--color-graphite-700)] p-3 mb-3">
          <p className="text-xs font-medium text-[var(--color-ink-300)] mb-2">Cell journey ({provenance.length} pack{provenance.length > 1 ? "s" : ""})</p>
          <ol className="space-y-1.5">
            {provenance.map((p) => (
              <li key={p.id} className="text-xs flex justify-between gap-3">
                <span className="font-mono text-[var(--color-ink-100)]">{p.battery_id}{p.position_in_pack ? ` · slot ${p.position_in_pack}` : ""}</span>
                <span className="text-[var(--color-ink-500)] text-right">
                  {day(p.moved_in_at)} → {p.moved_out_at ? day(p.moved_out_at) : <span className="text-[var(--color-status-good)]">now</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {wasReused && (
        <div className="rounded-lg border border-[var(--color-accent-500)]/30 bg-[var(--color-accent-500)]/5 p-3">
          <p className="text-xs font-medium text-[var(--color-accent-400)] mb-1">Reused cell — lifeline carried over</p>
          <p className="text-xs text-[var(--color-ink-300)] leading-relaxed">
            Originally from pack <span className="font-mono">{cell.original_battery_id}</span>. Its earlier readings stayed with it.
          </p>
          {priorPackReadings && priorPackReadings.readings.length > 0 && (
            <div className="mt-2 space-y-1">
              {[...priorPackReadings.readings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).map((reading) => (
                <div key={reading.id} className="flex justify-between text-xs font-mono text-[var(--color-ink-500)]">
                  <span>{day(reading.recorded_at)}</span>
                  <span>{reading.cycle_count} cycles{reading.resistance_mohm !== null ? ` · ${reading.resistance_mohm} mΩ` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
