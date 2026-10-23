import type { Battery, Cell, CellReading, PackReading, UsageEvent } from "../lib/types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const demoBatteries: Battery[] = [
  {
    id: "DBP-4471",
    maker: "Amaron Volt",
    model: "AV-60-30",
    place_of_manufacture: "Chennai, India",
    manufacture_date: "2023-02-14",
    chemistry: "LFP (LiFePO4)",
    cell_count: 4,
    nominal_voltage: 60,
    capacity_ah: 30,
    owner_name: "Ravi Kumar",
    vehicle_type: "E-rickshaw",
    odometer_km: 41200,
    registered_at: "2023-02-20T10:00:00Z",
    is_retro_registration: false,
  },
  {
    id: "DBP-9038",
    maker: "Exide NXT",
    model: "NX-48-24",
    place_of_manufacture: "Bengaluru, India",
    manufacture_date: "2022-06-01",
    chemistry: "NMC",
    cell_count: 4,
    nominal_voltage: 48,
    capacity_ah: 24,
    owner_name: "Sunrise Fleet Services",
    vehicle_type: "E-loader",
    odometer_km: 68500,
    registered_at: "2022-06-10T10:00:00Z",
    is_retro_registration: false,
  },
  {
    id: "DBP-7796-7ZZ",
    maker: "Amaron Volt",
    model: "AV-60-30",
    place_of_manufacture: "Chennai, India",
    manufacture_date: "2024-11-01",
    chemistry: "LFP (LiFePO4)",
    cell_count: 4,
    nominal_voltage: 60,
    capacity_ah: 30,
    owner_name: "Ravi Kumar",
    vehicle_type: "E-rickshaw",
    odometer_km: 3100,
    registered_at: daysAgo(20),
    is_retro_registration: true,
    retro_note: "This battery was already in use before registration. Tracked history starts from the date above — earlier usage was not recorded.",
  },
];

// DBP-4471: 4 cells, one (CELL-1004) is clearly weak and drifting — this is what
// makes the "judged by weakest cell" logic visible in the demo.
export const demoCells: Cell[] = [
  { id: "CELL-1001", current_battery_id: "DBP-4471", position_in_pack: 1, manufacture_date: "2023-02-01", original_battery_id: "DBP-4471" },
  { id: "CELL-1002", current_battery_id: "DBP-4471", position_in_pack: 2, manufacture_date: "2023-02-01", original_battery_id: "DBP-4471" },
  { id: "CELL-1003", current_battery_id: "DBP-4471", position_in_pack: 3, manufacture_date: "2023-02-01", original_battery_id: "DBP-4471" },
  { id: "CELL-1004", current_battery_id: "DBP-4471", position_in_pack: 4, manufacture_date: "2023-02-01", original_battery_id: "DBP-4471" },

  { id: "CELL-2001", current_battery_id: "DBP-9038", position_in_pack: 1, manufacture_date: "2022-05-15", original_battery_id: "DBP-9038" },
  { id: "CELL-2002", current_battery_id: "DBP-9038", position_in_pack: 2, manufacture_date: "2022-05-15", original_battery_id: "DBP-9038" },
  { id: "CELL-2003", current_battery_id: "DBP-9038", position_in_pack: 3, manufacture_date: "2022-05-15", original_battery_id: "DBP-9038" },
  { id: "CELL-2004", current_battery_id: "DBP-9038", position_in_pack: 4, manufacture_date: "2022-05-15", original_battery_id: "DBP-9038" },

  // CELL-1002 was pulled from DBP-4471 and reused here — its original_battery_id
  // stays DBP-4471, proving its identity is independent of its current pack.
  { id: "CELL-3001", current_battery_id: "DBP-7796-7ZZ", position_in_pack: 1, manufacture_date: "2024-10-15", original_battery_id: "DBP-7796-7ZZ" },
  { id: "CELL-1002-REUSED-REF", current_battery_id: "DBP-7796-7ZZ", position_in_pack: 2, manufacture_date: "2023-02-01", original_battery_id: "DBP-4471" },
  { id: "CELL-3003", current_battery_id: "DBP-7796-7ZZ", position_in_pack: 3, manufacture_date: "2024-10-15", original_battery_id: "DBP-7796-7ZZ" },
  { id: "CELL-3004", current_battery_id: "DBP-7796-7ZZ", position_in_pack: 4, manufacture_date: "2024-10-15", original_battery_id: "DBP-7796-7ZZ" },
];

export const demoReadings: CellReading[] = [
  // --- DBP-4471, four half-yearly readings each ---
  ...["CELL-1001", "CELL-1002", "CELL-1003"].flatMap((cellId, ci) => [
    { id: `${cellId}-r1`, cell_id: cellId, battery_id: "DBP-4471", recorded_at: daysAgo(700), voltage_v: 3.28, resistance_mohm: 22 + ci, temperature_c: 31, cycle_count: 40, source: "manual" as const },
    { id: `${cellId}-r2`, cell_id: cellId, battery_id: "DBP-4471", recorded_at: daysAgo(520), voltage_v: 3.26, resistance_mohm: 24 + ci, temperature_c: 33, cycle_count: 260, source: "manual" as const },
    { id: `${cellId}-r3`, cell_id: cellId, battery_id: "DBP-4471", recorded_at: daysAgo(340), voltage_v: 3.24, resistance_mohm: 27 + ci, temperature_c: 34, cycle_count: 520, source: "manual" as const },
    { id: `${cellId}-r4`, cell_id: cellId, battery_id: "DBP-4471", recorded_at: daysAgo(160), voltage_v: 3.22, resistance_mohm: 29 + ci, temperature_c: 35, cycle_count: 780, source: "manual" as const },
  ]),
  // CELL-1004 — the deliberately weak cell: higher resistance, more cycles
  { id: "CELL-1004-r1", cell_id: "CELL-1004", battery_id: "DBP-4471", recorded_at: daysAgo(700), voltage_v: 3.25, resistance_mohm: 26, temperature_c: 33, cycle_count: 40, source: "manual" },
  { id: "CELL-1004-r2", cell_id: "CELL-1004", battery_id: "DBP-4471", recorded_at: daysAgo(520), voltage_v: 3.19, resistance_mohm: 34, temperature_c: 38, cycle_count: 310, source: "manual" },
  { id: "CELL-1004-r3", cell_id: "CELL-1004", battery_id: "DBP-4471", recorded_at: daysAgo(340), voltage_v: 3.11, resistance_mohm: 46, temperature_c: 42, cycle_count: 640, source: "manual" },
  { id: "CELL-1004-r4", cell_id: "CELL-1004", battery_id: "DBP-4471", recorded_at: daysAgo(160), voltage_v: 3.02, resistance_mohm: 58, temperature_c: 46, cycle_count: 980, source: "manual" },

  // --- DBP-9038, NMC pack, aging faster overall (fewer max cycles) ---
  ...["CELL-2001", "CELL-2002", "CELL-2003", "CELL-2004"].flatMap((cellId, ci) => [
    { id: `${cellId}-r1`, cell_id: cellId, battery_id: "DBP-9038", recorded_at: daysAgo(900), voltage_v: 3.65, resistance_mohm: 28 + ci, temperature_c: 30, cycle_count: 90, source: "manual" as const },
    { id: `${cellId}-r2`, cell_id: cellId, battery_id: "DBP-9038", recorded_at: daysAgo(600), voltage_v: 3.58, resistance_mohm: 33 + ci * 2, temperature_c: 33, cycle_count: 420, source: "manual" as const },
    { id: `${cellId}-r3`, cell_id: cellId, battery_id: "DBP-9038", recorded_at: daysAgo(300), voltage_v: 3.5, resistance_mohm: 40 + ci * 2, temperature_c: 36, cycle_count: 780, source: "manual" as const },
  ]),

  // --- DBP-7796-7ZZ: brand-new cells, plus CELL-1002-REUSED-REF carrying over ---
  // The 3 earlier readings for this cell were originally logged under DBP-4471
  // (reusing CELL-1002's actual reading history), plus one fresh reading in the new pack.
  { id: "CELL-1002-r1", cell_id: "CELL-1002-REUSED-REF", battery_id: "DBP-4471", recorded_at: daysAgo(700), voltage_v: 3.28, resistance_mohm: 23, temperature_c: 31, cycle_count: 40, source: "manual" },
  { id: "CELL-1002-r2", cell_id: "CELL-1002-REUSED-REF", battery_id: "DBP-4471", recorded_at: daysAgo(520), voltage_v: 3.26, resistance_mohm: 25, temperature_c: 33, cycle_count: 260, source: "manual" },
  { id: "CELL-1002-r3", cell_id: "CELL-1002-REUSED-REF", battery_id: "DBP-4471", recorded_at: daysAgo(340), voltage_v: 3.24, resistance_mohm: 28, temperature_c: 34, cycle_count: 520, source: "manual" },
  { id: "CELL-1002-r4-new-pack", cell_id: "CELL-1002-REUSED-REF", battery_id: "DBP-7796-7ZZ", recorded_at: daysAgo(15), voltage_v: 3.23, resistance_mohm: 30, temperature_c: 32, cycle_count: 540, source: "manual" },

  { id: "CELL-3001-r1", cell_id: "CELL-3001", battery_id: "DBP-7796-7ZZ", recorded_at: daysAgo(15), voltage_v: 3.31, resistance_mohm: 21, temperature_c: 30, cycle_count: 8, source: "manual" },
  { id: "CELL-3003-r1", cell_id: "CELL-3003", battery_id: "DBP-7796-7ZZ", recorded_at: daysAgo(15), voltage_v: 3.3, resistance_mohm: 22, temperature_c: 30, cycle_count: 8, source: "manual" },
  { id: "CELL-3004-r1", cell_id: "CELL-3004", battery_id: "DBP-7796-7ZZ", recorded_at: daysAgo(15), voltage_v: 3.31, resistance_mohm: 21, temperature_c: 30, cycle_count: 8, source: "manual" },
];

export const demoPackReadings: PackReading[] = [
  { id: "pr-4471-1", battery_id: "DBP-4471", recorded_at: daysAgo(160), temp_sensor_1: 34, temp_sensor_2: 35, temp_sensor_3: 36, temp_sensor_4: 44, temp_sensor_5: 35, temp_sensor_6: 34, state_of_charge_pct: 62 },
  { id: "pr-9038-1", battery_id: "DBP-9038", recorded_at: daysAgo(300), temp_sensor_1: 35, temp_sensor_2: 36, temp_sensor_3: 35, temp_sensor_4: 37, temp_sensor_5: 36, temp_sensor_6: 35, state_of_charge_pct: 48 },
  { id: "pr-7796-1", battery_id: "DBP-7796-7ZZ", recorded_at: daysAgo(15), temp_sensor_1: 30, temp_sensor_2: 31, temp_sensor_3: 30, temp_sensor_4: 31, temp_sensor_5: 30, temp_sensor_6: 30, state_of_charge_pct: 71 },
];

export const demoUsageHistory: UsageEvent[] = [
  { id: "ev-4471-1", battery_id: "DBP-4471", event_type: "charge_cycle", event_at: daysAgo(700), detail: "Registered and put into service", previous_event_id: null },
  { id: "ev-4471-2", battery_id: "DBP-4471", event_type: "fast_charge", event_at: daysAgo(520), detail: "Fast-charge frequency logged: 3-4 times/week", previous_event_id: "ev-4471-1" },
  { id: "ev-4471-3", battery_id: "DBP-4471", event_type: "temperature_event", event_at: daysAgo(160), detail: "Sensor 4 recorded a sustained high-temperature event (44°C) — linked to Cell 4's accelerated wear", previous_event_id: "ev-4471-2" },
  { id: "ev-4471-4", battery_id: "DBP-4471", event_type: "ownership_change", event_at: daysAgo(15), detail: "Cell 1002 removed from this pack and reused in DBP-7796-7ZZ", previous_event_id: "ev-4471-3" },

  { id: "ev-9038-1", battery_id: "DBP-9038", event_type: "charge_cycle", event_at: daysAgo(900), detail: "Registered and put into service", previous_event_id: null },
  { id: "ev-9038-2", battery_id: "DBP-9038", event_type: "ownership_change", event_at: daysAgo(400), detail: "Transferred to Sunrise Fleet Services", previous_event_id: "ev-9038-1" },

  { id: "ev-7796-1", battery_id: "DBP-7796-7ZZ", event_type: "charge_cycle", event_at: daysAgo(20), detail: "Registered as already-in-use (retro-registration)", previous_event_id: null },
  { id: "ev-7796-2", battery_id: "DBP-7796-7ZZ", event_type: "ownership_change", event_at: daysAgo(15), detail: "Cell CELL-1002 reused from DBP-4471, full prior history attached", previous_event_id: "ev-7796-1" },
];