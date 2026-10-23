import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabase";
import { fetchAllBatteries, fetchCellsForBattery, fetchReadingsForCell } from "../lib/dataAccess";
import { demoBatteries, demoCells, demoReadings } from "../data/demoData";
import { evaluatePackHealth, checkMarketplaceClearance } from "../lib/calculations";
import { StatusBadge } from "../components/StatusBadge";
import type { Battery, CellReading, PackHealth } from "../lib/types";

interface Loaded {
  battery: Battery;
  health: PackHealth;
}

async function loadBattery(id: string): Promise<Loaded | null> {
  if (isSupabaseConfigured) {
    const all = await fetchAllBatteries();
    const battery = all.find((b) => b.id === id);
    if (battery) {
      const cells = await fetchCellsForBattery(id);
      const readingsByCell: Record<string, CellReading[]> = {};
      for (const c of cells) readingsByCell[c.id] = await fetchReadingsForCell(c.id);
      const health = evaluatePackHealth(cells, readingsByCell, battery.chemistry, battery.capacity_ah, battery.nominal_voltage, null);
      return { battery, health };
    }
  }
  const demoB = demoBatteries.find((b) => b.id === id);
  if (demoB) {
    const cells = demoCells.filter((c) => c.current_battery_id === demoB.id);
    const readingsByCell: Record<string, CellReading[]> = {};
    for (const c of cells) readingsByCell[c.id] = demoReadings.filter((r) => r.cell_id === c.id);
    const health = evaluatePackHealth(cells, readingsByCell, demoB.chemistry, demoB.capacity_ah, demoB.nominal_voltage, null);
    return { battery: demoB, health };
  }
  return null;
}

function Row({ label, left, right, highlightBetter }: { label: string; left: string; right: string; highlightBetter?: "left" | "right" | null }) {
  return (
    <tr className="border-t border-[var(--color-graphite-800)]">
      <td className="px-3 py-2 text-xs text-[var(--color-ink-500)]">{label}</td>
      <td className={`px-3 py-2 text-sm font-mono ${highlightBetter === "left" ? "text-[var(--color-status-good)]" : "text-[var(--color-ink-100)]"}`}>{left}</td>
      <td className={`px-3 py-2 text-sm font-mono ${highlightBetter === "right" ? "text-[var(--color-status-good)]" : "text-[var(--color-ink-100)]"}`}>{right}</td>
    </tr>
  );
}

export function Compare() {
  const [allBatteries, setAllBatteries] = useState<Battery[]>([]);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [loadedA, setLoadedA] = useState<Loaded | null>(null);
  const [loadedB, setLoadedB] = useState<Loaded | null>(null);

  useEffect(() => {
    (async () => {
      if (isSupabaseConfigured) setAllBatteries(await fetchAllBatteries());
      else setAllBatteries(demoBatteries);
    })();
  }, []);

  useEffect(() => {
    if (idA) loadBattery(idA).then(setLoadedA);
    else setLoadedA(null);
  }, [idA]);

  useEffect(() => {
    if (idB) loadBattery(idB).then(setLoadedB);
    else setLoadedB(null);
  }, [idB]);

  const clearanceA = loadedA ? checkMarketplaceClearance(loadedA.health) : null;
  const clearanceB = loadedB ? checkMarketplaceClearance(loadedB.health) : null;

  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Compare two batteries</h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-1">
            Useful when deciding between two second-hand packs.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <select value={idA} onChange={(e) => setIdA(e.target.value)}
            className="rounded-lg bg-[var(--color-graphite-900)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)]">
            <option value="">Select battery A…</option>
            {allBatteries.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.maker} {b.model}</option>)}
          </select>
          <select value={idB} onChange={(e) => setIdB(e.target.value)}
            className="rounded-lg bg-[var(--color-graphite-900)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)]">
            <option value="">Select battery B…</option>
            {allBatteries.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.maker} {b.model}</option>)}
          </select>
        </div>

        {loadedA && loadedB && (
          <div className="rounded-xl border border-[var(--color-graphite-700)] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--color-graphite-900)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-[var(--color-ink-700)]"> </th>
                  <th className="px-3 py-2 text-left">
                    <p className="text-sm font-semibold text-[var(--color-ink-100)]">{loadedA.battery.id}</p>
                    <StatusBadge stage={loadedA.health.stage} />
                  </th>
                  <th className="px-3 py-2 text-left">
                    <p className="text-sm font-semibold text-[var(--color-ink-100)]">{loadedB.battery.id}</p>
                    <StatusBadge stage={loadedB.health.stage} />
                  </th>
                </tr>
              </thead>
              <tbody>
                <Row label="Maker / Model" left={`${loadedA.battery.maker} ${loadedA.battery.model}`} right={`${loadedB.battery.maker} ${loadedB.battery.model}`} />
                <Row label="Chemistry" left={loadedA.battery.chemistry} right={loadedB.battery.chemistry} />
                <Row
                  label="State of Health"
                  left={`${Math.round(loadedA.health.sohPct)}%`}
                  right={`${Math.round(loadedB.health.sohPct)}%`}
                  highlightBetter={loadedA.health.sohPct === loadedB.health.sohPct ? null : loadedA.health.sohPct > loadedB.health.sohPct ? "left" : "right"}
                />
                <Row
                  label="Confidence"
                  left={`${loadedA.health.confidencePct}%`}
                  right={`${loadedB.health.confidencePct}%`}
                  highlightBetter={loadedA.health.confidencePct === loadedB.health.confidencePct ? null : loadedA.health.confidencePct > loadedB.health.confidencePct ? "left" : "right"}
                />
                <Row
                  label="Flagged cells"
                  left={`${loadedA.health.cellHealths.filter((c) => c.flagged).length} of ${loadedA.health.cellHealths.length}`}
                  right={`${loadedB.health.cellHealths.filter((c) => c.flagged).length} of ${loadedB.health.cellHealths.length}`}
                />
                <Row
                  label="Fair price"
                  left={`₹${loadedA.health.fairPriceLow.toLocaleString("en-IN")}–${loadedA.health.fairPriceHigh.toLocaleString("en-IN")}`}
                  right={`₹${loadedB.health.fairPriceLow.toLocaleString("en-IN")}–${loadedB.health.fairPriceHigh.toLocaleString("en-IN")}`}
                />
                <Row
                  label="Marketplace clearance"
                  left={clearanceA?.passed ? "Cleared" : "Not cleared"}
                  right={clearanceB?.passed ? "Cleared" : "Not cleared"}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}