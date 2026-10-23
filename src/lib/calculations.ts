import type { Cell, CellReading, PackReading, CellHealth, PackHealth, LifeStage } from "./types";

/** Assumed usable cycle life by chemistry, used to translate cycle count into % life used.
 *  These are conservative, published-range estimates — real numbers should come from
 *  the cell manufacturer's datasheet once available. */
const MAX_CYCLES_BY_CHEMISTRY: Record<string, number> = {
  "LFP (LiFePO4)": 3000,
  "NMC": 1200,
  "LTO": 6000,
};
const DEFAULT_MAX_CYCLES = 1500;

const DRIFT_FLAG_THRESHOLD_PCT = 6; // a cell 6%+ below its pack siblings is a real warning
export const REPLACE_FLAG_THRESHOLD_PCT = 20; // industry line used throughout this project

export function maxCyclesFor(chemistry: string): number {
  return MAX_CYCLES_BY_CHEMISTRY[chemistry] ?? DEFAULT_MAX_CYCLES;
}

/** A single cell's own remaining life, from its most recent reading.
 *  NOTE: mirrored in SQL as public.cell_soh() — keep the two identical. */
export function cellSohFromReading(reading: CellReading | null, chemistry: string): number {
  if (!reading) return 100; // no data yet — assume fresh, confidence score will reflect the gap
  const maxCycles = maxCyclesFor(chemistry);
  const cycleWear = Math.min(1, reading.cycle_count / maxCycles) * 100;
  // Elevated internal resistance ages a cell faster than cycle count alone predicts.
  const resistancePenalty = reading.resistance_mohm !== null && reading.resistance_mohm > 0
    ? Math.max(0, (reading.resistance_mohm - 30) / 4) // >30 mΩ is already elevated for a fresh cell
    : 0;
  const soh = 100 - cycleWear - resistancePenalty;
  return Math.max(0, Math.min(100, Math.round(soh * 10) / 10));
}

export function evaluateCellHealth(
  cell: Cell,
  readings: CellReading[],
  chemistry: string,
  packAvgSoh: number
): CellHealth {
  const latestReading = readings.length
    ? readings.reduce((a, b) => (a.recorded_at > b.recorded_at ? a : b))
    : null;

  const sohPct = cellSohFromReading(latestReading, chemistry);
  const lifeRemainingPct = sohPct;
  const driftFromPackPct = Math.max(0, packAvgSoh - sohPct);

  let flagged = false;
  let flagReason: string | null = null;

  if (sohPct <= REPLACE_FLAG_THRESHOLD_PCT) {
    flagged = true;
    flagReason = `At or below ${REPLACE_FLAG_THRESHOLD_PCT}% life — replace`;
  } else if (driftFromPackPct >= DRIFT_FLAG_THRESHOLD_PCT) {
    flagged = true;
    flagReason = `Drifting ${driftFromPackPct.toFixed(1)}% below pack average — watch closely`;
  }

  return { cellId: cell.id, latestReading, sohPct, lifeRemainingPct, driftFromPackPct, flagged, flagReason };
}

export function stageForSoh(sohPct: number): LifeStage {
  if (sohPct >= 80) return "healthy";
  if (sohPct >= 60) return "second-life";
  return "retire";
}

/** How complete and recent the evidence behind this passport is — a thin passport
 *  should say so plainly rather than imply certainty it doesn't have. */
export function computeConfidence(
  cells: Cell[],
  readingsByCell: Record<string, CellReading[]>
): number {
  if (cells.length === 0) return 0;
  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  let score = 0;
  for (const cell of cells) {
    const readings = readingsByCell[cell.id] ?? [];
    if (readings.length === 0) continue;
    const latest = readings.reduce((a, b) => (a.recorded_at > b.recorded_at ? a : b));
    const ageMs = now - new Date(latest.recorded_at).getTime();
    const recencyScore = ageMs <= oneYearMs ? 1 : Math.max(0, 1 - (ageMs - oneYearMs) / oneYearMs);
    const depthScore = Math.min(1, readings.length / 3);
    score += (recencyScore * 0.6 + depthScore * 0.4);
  }
  return Math.round((score / cells.length) * 100);
}

export function computeFairPriceBand(
  capacityAh: number,
  nominalVoltage: number,
  sohPct: number
): { low: number; high: number } {
  const kwh = (capacityAh * nominalVoltage) / 1000;
  const pricePerKwhNew = 9000; // indicative INR/kWh for a new comparable pack — for demo purposes only
  const base = kwh * pricePerKwhNew * (sohPct / 100);
  return {
    low: Math.round((base * 0.85) / 100) * 100,
    high: Math.round((base * 1.1) / 100) * 100,
  };
}

export function evaluatePackHealth(
  cells: Cell[],
  readingsByCell: Record<string, CellReading[]>,
  chemistry: string,
  capacityAh: number,
  nominalVoltage: number,
  latestPackReading: PackReading | null
): PackHealth {
  const roughSohs = cells.map((c) =>
    cellSohFromReading(
      (readingsByCell[c.id] ?? []).reduce(
        (a, b) => (!a || a.recorded_at < b.recorded_at ? b : a),
        undefined as CellReading | undefined
      ) ?? null,
      chemistry
    )
  );
  const packAvgSoh = roughSohs.length ? roughSohs.reduce((a, b) => a + b, 0) / roughSohs.length : 100;

  const cellHealths = cells.map((c) => evaluateCellHealth(c, readingsByCell[c.id] ?? [], chemistry, packAvgSoh));

  const weakestCell = cellHealths.length
    ? cellHealths.reduce((a, b) => (a.sohPct <= b.sohPct ? a : b))
    : null;

  // Pack health is judged by its weakest cell, not the average — a chain is only
  // as strong as its weakest link.
  const sohPct = weakestCell ? weakestCell.sohPct : 100;
  const stage = stageForSoh(sohPct);
  const confidencePct = computeConfidence(cells, readingsByCell);
  const { low, high } = computeFairPriceBand(capacityAh, nominalVoltage, sohPct);

  return {
    sohPct,
    socPct: latestPackReading?.state_of_charge_pct ?? null,
    stage,
    weakestCell,
    cellHealths,
    confidencePct,
    fairPriceLow: low,
    fairPriceHigh: high,
  };
}

export function stageLabel(stage: LifeStage): string {
  switch (stage) {
    case "healthy": return "Healthy";
    case "second-life": return "Second-life";
    case "retire": return "Retire";
  }
}

/** Marketplace clearance (browser preview). The SERVER decides for real:
 *  public.battery_clearance() mirrors this and is what create_listing() enforces. */
export function checkMarketplaceClearance(pack: PackHealth): { passed: boolean; reason: string } {
  if (pack.stage === "retire") {
    return { passed: false, reason: "Weakest cell is below the 60% storage threshold — not eligible for resale." };
  }
  if (pack.confidencePct < 30) {
    return { passed: false, reason: "Not enough recent readings on record to certify this listing." };
  }
  return { passed: true, reason: "Meets resale health and evidence requirements." };
}

export interface DegradationForecast {
  trendPoints: { dateMs: number; sohPct: number }[];
  slopePctPerDay: number | null;
  monthsTo80: number | null;
  monthsTo60: number | null;
  note: string;
}

/** Straight-line projection of the weakest cell's own reading history. */
export function computeDegradationForecast(
  weakestCellId: string | null,
  readingsByCell: Record<string, CellReading[]>,
  chemistry: string
): DegradationForecast {
  if (!weakestCellId) {
    return { trendPoints: [], slopePctPerDay: null, monthsTo80: null, monthsTo60: null, note: "No cell data yet." };
  }
  const readings = [...(readingsByCell[weakestCellId] ?? [])].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const trendPoints = readings.map((r) => ({
    dateMs: new Date(r.recorded_at).getTime(),
    sohPct: cellSohFromReading(r, chemistry),
  }));
  if (readings.length < 2) {
    return { trendPoints, slopePctPerDay: null, monthsTo80: null, monthsTo60: null,
      note: "Needs at least two readings over time to project a trend." };
  }

  const t0 = trendPoints[0].dateMs;
  const xs = trendPoints.map((p) => (p.dateMs - t0) / (1000 * 60 * 60 * 24));
  const ys = trendPoints.map((p) => p.sohPct);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const latestSoh = ys[ys.length - 1];
  const latestX = xs[xs.length - 1];

  function daysToReach(target: number): number | null {
    if (slope >= 0) return null;
    const daysFromNow = (target - intercept) / slope - latestX;
    return daysFromNow > 0 ? daysFromNow : 0;
  }
  const daysTo80 = latestSoh > 80 ? daysToReach(80) : 0;
  const daysTo60 = latestSoh > 60 ? daysToReach(60) : 0;
  const note = slope >= 0
    ? "Readings show no clear decline yet — too early or too stable to project."
    : `Trending down roughly ${Math.abs(slope * 30).toFixed(1)}% per month based on its own history.`;

  return {
    trendPoints, slopePctPerDay: slope,
    monthsTo80: daysTo80 !== null ? Math.round((daysTo80 / 30) * 10) / 10 : null,
    monthsTo60: daysTo60 !== null ? Math.round((daysTo60 / 30) * 10) / 10 : null,
    note,
  };
}

export interface RoutingRecommendation {
  title: string;
  description: string;
  actionItems: string[];
}

export function computeRoutingRecommendation(pack: PackHealth): RoutingRecommendation {
  const flaggedCells = pack.cellHealths.filter((c) => c.flagged);
  const totalCells = pack.cellHealths.length;

  if (pack.stage === "healthy") {
    if (flaggedCells.length === 0) {
      return { title: "Continue in vehicle use",
        description: "Every cell is within a healthy range. No action needed beyond routine monitoring.",
        actionItems: ["Log a new reading at the next scheduled service."] };
    }
    return { title: "Repair candidate",
      description: `${flaggedCells.length} of ${totalCells} cells are flagged while the rest are healthy — replacing just the flagged cells is likely cheaper than retiring the whole pack.`,
      actionItems: flaggedCells.map((c) => `Replace ${c.cellId} (${c.flagReason ?? "flagged"})`) };
  }
  if (pack.stage === "second-life") {
    return { title: "Route to second-life storage",
      description: "This pack is no longer suitable for vehicle use but still has real capacity left — a good candidate for solar or home battery storage rather than scrapping.",
      actionItems: [
        "List for second-life storage buyers, not vehicle resale.",
        flaggedCells.length > 0
          ? `Note ${flaggedCells.length} weak cell(s) to the buyer: ${flaggedCells.map((c) => c.cellId).join(", ")}`
          : "No individually flagged cells — pack-level capacity is simply below the vehicle-use line.",
      ] };
  }
  return { title: "Route to recycling",
    description: "The weakest cell is below the second-life storage threshold — further use of this pack risks unreliable performance.",
    actionItems: [
      "Send to a certified recycler rather than reselling.",
      "Check individual cells before recycling — some may still be viable for reuse in a different pack (see cell lifeline).",
    ] };
}
