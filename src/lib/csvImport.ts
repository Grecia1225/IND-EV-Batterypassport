/** Flexible tester-CSV importer.
 *  Testers name their columns differently ("Voltage (V)", "IR", "Cycles", "Cell #"...).
 *  We normalise headers, map aliases, resolve cells by ID OR by position, validate every
 *  row with the same limits the database enforces, and pre-check ordering — so the user
 *  sees every problem BEFORE anything is saved. The database remains the final authority. */

export interface PackCell { id: string; position_in_pack: number | null }

export interface ParsedCsvRow {
  line: number;                // 1-based data row (header excluded)
  cell_id: string | null;
  voltage_v: number | null;
  resistance_mohm: number | null;
  temperature_c: number | null;
  cycle_count: number | null;
  recorded_at: string | null;  // ISO, or null = "now" at save time
  errors: string[];
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  mapping: Record<string, string>;   // our field -> the CSV header that was used
  unusedHeaders: string[];
  missingRequired: string[];
}

type Field = "cell_id" | "position" | "voltage_v" | "resistance_mohm" | "temperature_c" | "cycle_count" | "recorded_at";

const ALIASES: Record<Field, string[]> = {
  cell_id: ["cell_id", "cellid", "cell", "cell_serial", "serial", "cell_no", "cell_number", "id"],
  position: ["position", "pos", "slot", "index", "channel", "ch"],
  voltage_v: ["voltage_v", "voltage", "volt", "volts", "v", "vcell", "cell_voltage", "cell_v", "ocv"],
  resistance_mohm: ["resistance_mohm", "resistance", "ir", "dcir", "acir", "internal_resistance", "mohm", "milliohm", "r"],
  temperature_c: ["temperature_c", "temperature", "temp", "temp_c", "t", "celsius"],
  cycle_count: ["cycle_count", "cycles", "cycle", "cycle_no", "cycles_count", "cycle_counts"],
  recorded_at: ["recorded_at", "date", "timestamp", "time", "datetime", "tested_at", "test_date", "measured_at"],
};

export function normalizeHeader(h: string): string {
  return (h ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")      // drop units like "(V)" "(mΩ)" "(°C)"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/ /g, "_");
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (s === "") return null;
  if (!s.includes(".") && (s.match(/,/g) ?? []).length === 1) s = s.replace(",", "."); // 3,25 -> 3.25
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

/** Accepts ISO (2025-01-31, 2025-01-31T10:00:00Z) and Indian-style DD/MM/YYYY or DD-MM-YYYY. */
export function parseDate(raw: string | undefined): string | null | "invalid" {
  if (raw === undefined || raw.trim() === "") return null;
  const s = raw.trim();
  let d: Date | null = null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  if (!d && (m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  if (!d && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) d = new Date(s.replace(" ", "T"));
  if (!d || Number.isNaN(d.getTime())) return "invalid";
  // reject impossible dates like 31/02/2025 that Date.UTC would silently roll over
  const dm = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dm && (d.getUTCDate() !== +dm[1] || d.getUTCMonth() !== +dm[2] - 1)) return "invalid";
  return d.toISOString();
}

export function parseReadingsCsv(
  records: Record<string, string>[],
  headers: string[],
  packCells: PackCell[],
  now: Date = new Date()
): CsvParseResult {
  // 1. map our fields to the CSV's headers
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  (Object.keys(ALIASES) as Field[]).forEach((field) => {
    const hit = normalized.find((h) => !used.has(h.raw) && ALIASES[field].includes(h.norm));
    if (hit) { mapping[field] = hit.raw; used.add(hit.raw); }
  });

  const missingRequired: string[] = [];
  if (!mapping.cell_id && !mapping.position) missingRequired.push("cell ID (or position)");
  if (!mapping.voltage_v) missingRequired.push("voltage");
  if (!mapping.cycle_count) missingRequired.push("cycle count");

  const byId = new Map(packCells.map((c) => [c.id.toUpperCase(), c]));
  const byPos = new Map(packCells.filter((c) => c.position_in_pack !== null).map((c) => [c.position_in_pack as number, c]));
  const get = (rec: Record<string, string>, field: Field) => (mapping[field] ? rec[mapping[field]] : undefined);

  // 2. validate each row
  const rows: ParsedCsvRow[] = records.map((rec, i) => {
    const errors: string[] = [];
    let cell_id: string | null = null;

    const rawCell = (get(rec, "cell_id") ?? "").trim();
    const rawPos = (get(rec, "position") ?? "").trim();
    const asPosition = rawPos !== "" ? rawPos : /^\d+$/.test(rawCell) ? rawCell : "";
    if (rawCell !== "" && !/^\d+$/.test(rawCell)) {
      const c = byId.get(rawCell.toUpperCase());
      if (c) cell_id = c.id; else errors.push(`Cell "${rawCell}" is not in the selected pack`);
    } else if (asPosition !== "") {
      const c = byPos.get(Number(asPosition));
      if (c) cell_id = c.id; else errors.push(`No cell at position ${asPosition} in the selected pack`);
    } else errors.push("Missing cell ID / position");

    const v = parseNumber(get(rec, "voltage_v"));
    if (v === null) errors.push("Missing voltage"); else if (Number.isNaN(v)) errors.push("Voltage is not a number");
    else if (v <= 0 || v > 6) errors.push(`Voltage ${v} V is outside 0–6 V`);

    const r = parseNumber(get(rec, "resistance_mohm"));
    if (r !== null && Number.isNaN(r)) errors.push("Resistance is not a number");
    else if (r !== null && (r < 0 || r > 1000)) errors.push(`Resistance ${r} mΩ is outside 0–1000`);

    const t = parseNumber(get(rec, "temperature_c"));
    if (t !== null && Number.isNaN(t)) errors.push("Temperature is not a number");
    else if (t !== null && (t < -60 || t > 200)) errors.push(`Temperature ${t} °C is outside -60–200`);

    const c = parseNumber(get(rec, "cycle_count"));
    if (c === null) errors.push("Missing cycle count");
    else if (Number.isNaN(c)) errors.push("Cycle count is not a number");
    else if (!Number.isInteger(c) || c < 0 || c > 1_000_000) errors.push(`Cycle count ${c} must be a whole number ≥ 0`);

    const when = parseDate(get(rec, "recorded_at"));
    if (when === "invalid") errors.push("Unrecognised date (use YYYY-MM-DD or DD/MM/YYYY)");
    else if (when && new Date(when).getTime() > now.getTime() + 5 * 60_000) errors.push("Date is in the future");

    const ok = (x: number | null) => (x !== null && !Number.isNaN(x) ? x : null);
    return {
      line: i + 1, cell_id,
      voltage_v: ok(v), resistance_mohm: ok(r), temperature_c: ok(t), cycle_count: ok(c),
      recorded_at: when === "invalid" ? null : when, errors,
    };
  });

  // 3. ordering pre-check (the database enforces the same rule)
  const sorted = sortForImport(rows.filter((x) => x.errors.length === 0));
  const lastCycle = new Map<string, { cycle: number; at: number | null; line: number }>();
  for (const row of sorted) {
    const prev = lastCycle.get(row.cell_id!);
    if (prev && row.cycle_count! < prev.cycle) {
      row.errors.push(`Cycle count ${row.cycle_count} is lower than ${prev.cycle} on row ${prev.line} for the same cell`);
    } else {
      lastCycle.set(row.cell_id!, { cycle: row.cycle_count!, at: row.recorded_at ? Date.parse(row.recorded_at) : null, line: row.line });
    }
  }

  const unusedHeaders = headers.filter((h) => !used.has(h));
  return { rows, mapping, unusedHeaders, missingRequired };
}

/** Insert order the database will accept: per cell, oldest first; undated rows last, by cycle count. */
export function sortForImport<T extends { cell_id: string | null; recorded_at: string | null; cycle_count: number | null; line: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.cell_id !== b.cell_id) return (a.cell_id ?? "").localeCompare(b.cell_id ?? "");
    const ta = a.recorded_at ? Date.parse(a.recorded_at) : Number.POSITIVE_INFINITY;
    const tb = b.recorded_at ? Date.parse(b.recorded_at) : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ca = a.cycle_count ?? 0, cb = b.cycle_count ?? 0;
    return ca !== cb ? ca - cb : a.line - b.line;
  });
}
