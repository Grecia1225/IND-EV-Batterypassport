import { fetchFleetData } from "./dataAccess";
import { evaluatePackHealth } from "./calculations";
import type { Battery, Cell, PackHealth, PackReading } from "./types";

export interface FleetRow { battery: Battery; cells: Cell[]; health: PackHealth }

/** Loads batteries + health in a handful of queries (not one per battery), including the latest SoC. */
export async function loadFleet(opts?: { batteryIds?: string[] }): Promise<FleetRow[]> {
  const d = await fetchFleetData(opts?.batteryIds);
  const byBattery: Record<string, Cell[]> = {};
  for (const c of d.cells) (byBattery[c.current_battery_id] ??= []).push(c);
  return d.batteries.map((battery) => {
    const cells = byBattery[battery.id] ?? [];
    const health = evaluatePackHealth(cells, d.readingsByCell, battery.chemistry, battery.capacity_ah,
      battery.nominal_voltage, (d.latestPackByBattery[battery.id] ?? null) as PackReading | null);
    return { battery, cells, health };
  });
}