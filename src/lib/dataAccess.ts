import { supabase } from "./supabase";
import type { Battery, Cell, CellReading, CellFlagEvent, TechnicianStats } from "./types";

// ---------------------------------------------------------------------------------------
// Types used only by the data layer
// ---------------------------------------------------------------------------------------
export type ReadingSource = "manual" | "csv_upload" | "bms_jbd" | "ble_battery_service";

export interface IntegrityReport { ok: boolean; readings_checked: number; events_checked: number; first_problem: string | null }
export interface ClearanceResult { passed: boolean; reason: string; soh: number; stage: "healthy" | "second-life" | "retire"; confidence: number }
export interface CellProvenanceEntry {
  id: string; cell_id: string; battery_id: string; position_in_pack: number | null;
  moved_in_at: string; moved_out_at: string | null; note: string | null;
}
export interface PendingTechnician { id: string; email: string; created_at: string }

type PgError = { message: string } | null;

/** PostgREST returns at most 1000 rows per request; this walks through every page. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PgError }>): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------------------
// Registration (one atomic server call: battery + cells + provenance, all-or-nothing)
// ---------------------------------------------------------------------------------------
export interface RegisterBatteryInput {
  maker: string; model: string; place_of_manufacture: string; manufacture_date: string;
  chemistry: string; cell_count: number; nominal_voltage: number; capacity_ah: number;
  owner_name: string; vehicle_type: string; is_retro_registration: boolean;
  /** ignored — the server uses the signed-in user. Kept so existing pages compile unchanged. */
  userId?: string;
  photo_url?: string | null;
}
export interface CellInput { reused: boolean; existingCellId?: string; manufactureDate?: string }

export async function registerBattery(
  input: RegisterBatteryInput,
  cellInputs: CellInput[]
): Promise<{ batteryId: string | null; error: string | null }> {
  const payload = {
    maker: input.maker, model: input.model, place_of_manufacture: input.place_of_manufacture,
    manufacture_date: input.manufacture_date, chemistry: input.chemistry, cell_count: input.cell_count,
    nominal_voltage: input.nominal_voltage, capacity_ah: input.capacity_ah, owner_name: input.owner_name,
    vehicle_type: input.vehicle_type, is_retro_registration: input.is_retro_registration,
    photo_url: input.photo_url ?? null,
    cells: cellInputs.map((c) =>
      c.reused
        ? { reused: true, existing_cell_id: c.existingCellId }
        : { reused: false, manufacture_date: c.manufactureDate ?? null }
    ),
  };
  const { data, error } = await supabase.rpc("register_battery", { payload });
  if (error) return { batteryId: null, error: error.message };
  return { batteryId: data as string, error: null };
}

export async function findCellById(cellId: string): Promise<Cell | null> {
  const { data } = await supabase.from("cells").select("*").eq("id", cellId).maybeSingle();
  return (data as Cell) ?? null;
}

// ---------------------------------------------------------------------------------------
// Readings (the DATABASE enforces: rising cycle count, time order, current pack, ranges)
// ---------------------------------------------------------------------------------------
export async function addCellReading(reading: {
  cell_id: string; battery_id: string; voltage_v: number;
  resistance_mohm: number | null; temperature_c: number | null; cycle_count: number;
  source: ReadingSource;
  recorded_by?: string;      // ignored by the server (it stamps the real user); kept for old callers
  recorded_at?: string;      // optional ISO time, for importing history oldest-first
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("cell_readings").insert(reading);
  return { error: error?.message ?? null };
}

export async function addPackReading(r: {
  battery_id: string; state_of_charge_pct: number | null; temps: (number | null)[];
  source?: "manual" | "bms_jbd" | "ble_battery_service";
}): Promise<{ error: string | null }> {
  const t = (i: number) => r.temps[i] ?? null;
  const { error } = await supabase.from("pack_readings").insert({
    battery_id: r.battery_id, state_of_charge_pct: r.state_of_charge_pct, source: r.source ?? "manual",
    temp_sensor_1: t(0), temp_sensor_2: t(1), temp_sensor_3: t(2), temp_sensor_4: t(3), temp_sensor_5: t(4), temp_sensor_6: t(5),
  });
  return { error: error?.message ?? null };
}

/** Flag events are now created BY THE DATABASE the moment a reading pushes a cell under the
 *  replace line, for every path (manual, CSV, Bluetooth). Kept as a no-op so old pages still compile. */
export async function logFlagEvent(..._args: unknown[]): Promise<{ error: string | null }> {
  return { error: null };
}

// ---------------------------------------------------------------------------------------
// Reads (public — a passport is public by design)
// ---------------------------------------------------------------------------------------
export async function fetchAllBatteries(): Promise<Battery[]> {
  return fetchAll<Battery>((from, to) =>
    supabase.from("batteries").select("*").order("registered_at", { ascending: false }).order("id").range(from, to));
}
export async function fetchBatteryById(batteryId: string): Promise<Battery | null> {
  const { data } = await supabase.from("batteries").select("*").eq("id", batteryId).maybeSingle();
  return (data as Battery) ?? null;
}
export async function fetchCellsForBattery(batteryId: string): Promise<Cell[]> {
  const { data } = await supabase.from("cells").select("*").eq("current_battery_id", batteryId).order("position_in_pack");
  return (data as Cell[]) ?? [];
}
export async function fetchReadingsForCell(cellId: string): Promise<CellReading[]> {
  return fetchAll<CellReading>((from, to) =>
    supabase.from("cell_readings").select("*").eq("cell_id", cellId).order("chain_pos").range(from, to));
}
export async function fetchLatestPackReading(batteryId: string) {
  const { data } = await supabase.from("pack_readings").select("*").eq("battery_id", batteryId)
    .order("recorded_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}
export async function fetchUsageHistory(batteryId: string) {
  const { data } = await supabase.from("usage_history").select("*").eq("battery_id", batteryId).order("chain_pos");
  return data ?? [];
}
export async function fetchCellProvenance(cellId: string): Promise<CellProvenanceEntry[]> {
  const { data } = await supabase.from("cell_pack_history").select("*").eq("cell_id", cellId)
    .order("moved_in_at").order("id");
  return (data as CellProvenanceEntry[]) ?? [];
}
export async function fetchFlagEvents(batteryId?: string): Promise<CellFlagEvent[]> {
  let q = supabase.from("cell_flag_events").select("*").order("flagged_at", { ascending: false });
  if (batteryId) q = q.eq("battery_id", batteryId);
  const { data } = await q;
  return (data as CellFlagEvent[]) ?? [];
}
export async function fetchActiveListings() {
  const { data } = await supabase.from("marketplace_listings").select("*, batteries(*)").eq("status", "active");
  return data ?? [];
}

/** Everything the fleet views need, in a handful of queries instead of one-per-battery. */
export async function fetchFleetData(batteryIds?: string[]) {
  const idChunks = batteryIds ? chunk(batteryIds, 100) : [undefined];
  const batteries: Battery[] = [];
  const cells: Cell[] = [];
  const packReadings: Record<string, any>[] = [];
  for (const ids of idChunks) {
    batteries.push(...await fetchAll<Battery>((from, to) => {
      let q = supabase.from("batteries").select("*").order("registered_at", { ascending: false }).order("id");
      if (ids) q = q.in("id", ids);
      return q.range(from, to);
    }));
  }
  const bIds = batteries.map((b) => b.id);
  for (const ids of chunk(bIds, 100)) {
    cells.push(...await fetchAll<Cell>((from, to) =>
      supabase.from("cells").select("*").in("current_battery_id", ids).order("id").range(from, to)));
    packReadings.push(...await fetchAll<Record<string, any>>((from, to) =>
      supabase.from("pack_readings").select("*").in("battery_id", ids).order("recorded_at", { ascending: false }).order("id").range(from, to)));
  }
  const readings: CellReading[] = [];
  for (const ids of chunk(cells.map((c) => c.id), 100)) {
    readings.push(...await fetchAll<CellReading>((from, to) =>
      supabase.from("cell_readings").select("*").in("cell_id", ids).order("cell_id").order("chain_pos").range(from, to)));
  }
  const readingsByCell: Record<string, CellReading[]> = {};
  for (const r of readings) (readingsByCell[r.cell_id] ??= []).push(r);
  const latestPackByBattery: Record<string, Record<string, any>> = {};
  for (const p of packReadings) if (!latestPackByBattery[p.battery_id]) latestPackByBattery[p.battery_id] = p;
  return { batteries, cells, readingsByCell, latestPackByBattery };
}

// ---------------------------------------------------------------------------------------
// Server-side checks
// ---------------------------------------------------------------------------------------
export async function verifyBatteryIntegrity(batteryId: string): Promise<IntegrityReport | null> {
  const { data, error } = await supabase.rpc("verify_battery_integrity", { p_battery_id: batteryId });
  if (error || !data || !data[0]) return null;
  return data[0] as IntegrityReport;
}
export async function fetchBatteryClearance(batteryId: string): Promise<ClearanceResult | null> {
  const { data, error } = await supabase.rpc("battery_clearance", { p_battery_id: batteryId });
  if (error || !data || !data[0]) return null;
  return data[0] as ClearanceResult;
}

// ---------------------------------------------------------------------------------------
// Ownership + marketplace (server-enforced)
// ---------------------------------------------------------------------------------------
export async function transferOwnership(batteryId: string, newOwnerName: string): Promise<{ error: string | null }>;
/** legacy signature used by the current Passport page — the extra arguments are ignored */
export async function transferOwnership(batteryId: string, previousOwnerName: string, newOwnerName: string, userId: string): Promise<{ error: string | null }>;
export async function transferOwnership(batteryId: string, a: string, b?: string, _userId?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("transfer_ownership", { p_battery_id: batteryId, p_new_owner: b ?? a });
  return { error: error?.message ?? null };
}

export async function createListing(batteryId: string, askingPrice: number): Promise<{ error: string | null }>;
/** legacy signature used by the current Marketplace page — the server re-checks clearance itself */
export async function createListing(batteryId: string, sellerId: string, askingPrice: number, clearancePassed: boolean, clearanceReason: string): Promise<{ error: string | null }>;
export async function createListing(batteryId: string, a: string | number, b?: number, _passed?: boolean, _reason?: string): Promise<{ error: string | null }> {
  const price = typeof a === "number" ? a : (b as number);
  const { error } = await supabase.rpc("create_listing", { p_battery_id: batteryId, p_price: price });
  return { error: error?.message ?? null };
}

export async function withdrawListing(listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("withdraw_listing", { p_listing_id: listingId });
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------------------
export async function uploadBatteryPhoto(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { url: null, error: "Photo must be a JPEG, PNG or WebP image." };
  if (file.size > 5 * 1024 * 1024) return { url: null, error: "Photo must be under 5 MB." };
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("battery-photos").upload(path, file);
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from("battery-photos").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ---------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------
/** Same shape the Activity page already expects. `email` holds a masked name unless you are admin. */
export async function fetchTechnicianStats(): Promise<(TechnicianStats & { email: string | null })[]> {
  const { data, error } = await supabase.rpc("technician_stats_list");
  if (error || !data) return [];
  return (data as any[]).map((s) => ({
    technician_id: s.technician_id, email: s.display_name, readings_logged: Number(s.readings_logged),
    csv_readings: Number(s.csv_readings), first_reading_at: s.first_reading_at, last_reading_at: s.last_reading_at,
  }));
}
export async function fetchPendingTechnicians(): Promise<PendingTechnician[]> {
  const { data, error } = await supabase.rpc("list_pending_technicians");
  if (error || !data) return [];
  return data as PendingTechnician[];
}
export async function approveTechnician(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("approve_technician", { target: userId });
  return { error: error?.message ?? null };
}