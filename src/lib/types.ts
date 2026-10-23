export interface Battery {
  id: string;
  maker: string;
  model: string;
  place_of_manufacture: string;
  manufacture_date: string;
  chemistry: string;
  cell_count: number;
  nominal_voltage: number;
  capacity_ah: number;
  owner_name: string;
  vehicle_type: string;
  odometer_km: number;
  registered_at: string;
  is_retro_registration: boolean;
  retro_note?: string;
  photo_url?: string | null;
  created_by?: string | null;
}

export interface Cell {
  id: string;
  current_battery_id: string;
  position_in_pack: number;
  manufacture_date: string;
  original_battery_id: string;
}

export type ReadingSource = "manual" | "csv_upload" | "bms_jbd" | "ble_battery_service";

export interface CellReading {
  id: string;
  cell_id: string;
  battery_id: string;
  recorded_at: string;
  voltage_v: number;
  /** null when the source can't measure it (e.g. a BMS reports voltage but not per-cell resistance) */
  resistance_mohm: number | null;
  temperature_c: number | null;
  cycle_count: number;
  source: ReadingSource;
}

export interface PackReading {
  id: string;
  battery_id: string;
  recorded_at: string;
  temp_sensor_1: number | null;
  temp_sensor_2: number | null;
  temp_sensor_3: number | null;
  temp_sensor_4: number | null;
  temp_sensor_5: number | null;
  temp_sensor_6: number | null;
  state_of_charge_pct: number | null;
}

export interface UsageEvent {
  id: string;
  battery_id: string;
  event_type: string;
  event_at: string;
  detail: string;
  previous_event_id: string | null;
}

export interface CellFlagEvent {
  id: string;
  cell_id: string;
  battery_id: string;
  flagged_at: string;
  reason: string;
  soh_pct: number | null;
}

export interface CellProvenanceEntry {
  id: string;
  cell_id: string;
  battery_id: string;
  position_in_pack: number | null;
  moved_in_at: string;
  moved_out_at: string | null;
  note: string | null;
}

export interface TechnicianStats {
  technician_id: string;
  readings_logged: number;
  csv_readings: number;
  first_reading_at: string;
  last_reading_at: string;
}

export interface TechnicianStat {
  technician_id: string;
  display_name: string;
  readings_logged: number;
  csv_readings: number;
  bms_readings: number;
  first_reading_at: string;
  last_reading_at: string;
}

export interface IntegrityReport {
  ok: boolean;
  readings_checked: number;
  events_checked: number;
  first_problem: string | null;
}

export interface CellWithHistory extends Cell {
  readings: CellReading[];
  priorPackHistory?: { battery_id: string; readings: CellReading[] }[];
}

export type LifeStage = "healthy" | "second-life" | "retire";

export interface ClearanceResult {
  passed: boolean;
  reason: string;
  soh: number;
  stage: LifeStage;
  confidence: number;
}

export interface CellHealth {
  cellId: string;
  latestReading: CellReading | null;
  sohPct: number;
  lifeRemainingPct: number;
  driftFromPackPct: number;
  flagged: boolean;
  flagReason: string | null;
}

export interface PackHealth {
  sohPct: number;
  socPct: number | null;
  stage: LifeStage;
  weakestCell: CellHealth | null;
  cellHealths: CellHealth[];
  confidencePct: number;
  fairPriceLow: number;
  fairPriceHigh: number;
}