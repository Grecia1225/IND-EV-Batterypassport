/** Adapter for JBD ("Jiabaida" / Xiaoxiang) smart BMS boards over Bluetooth LE.
 *  This board family is very common in aftermarket LFP packs, and its serial protocol is
 *  publicly documented. Other BMS brands need their own adapter that produces the SAME
 *  standard output (see mapJbdToReadings) — the rest of the app never sees raw BMS bytes.
 *
 *  Frame:  DD <cmd|0xA5 for requests> <status|cmd> <len> <data...> <chk hi> <chk lo> 77
 *  Checksum = 0x10000 - sum(bytes from the 3rd byte up to the last data byte). */

export const JBD_SERVICE = "0000ff00-0000-1000-8000-00805f9b34fb";
export const JBD_NOTIFY = "0000ff01-0000-1000-8000-00805f9b34fb";
export const JBD_WRITE = "0000ff02-0000-1000-8000-00805f9b34fb";

export const JBD_CMD_BASIC = 0x03;
export const JBD_CMD_CELLS = 0x04;

function checksumOver(bytes: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum += bytes[i];
  return (0x10000 - (sum & 0xffff)) & 0xffff;
}

/** Request frame, e.g. basic info = DD A5 03 00 FF FD 77. */
export function buildJbdRequest(command: number): Uint8Array {
  const chk = checksumOver([command, 0x00]);
  return Uint8Array.from([0xdd, 0xa5, command, 0x00, chk >> 8, chk & 0xff, 0x77]);
}

/** Response frame builder (used by tests, and handy for simulators). */
export function buildJbdResponse(command: number, data: ArrayLike<number>, status = 0): Uint8Array {
  const body = [status, data.length, ...Array.from(data as ArrayLike<number> as number[])];
  const chk = checksumOver(body);
  return Uint8Array.from([0xdd, command, ...body, chk >> 8, chk & 0xff, 0x77]);
}

export interface JbdFrame { command: number; status: number; data: Uint8Array }

export function parseJbdFrame(frame: Uint8Array): JbdFrame {
  if (frame.length < 7) throw new Error("BMS frame too short");
  if (frame[0] !== 0xdd) throw new Error("BMS frame does not start with 0xDD");
  if (frame[frame.length - 1] !== 0x77) throw new Error("BMS frame does not end with 0x77");
  const len = frame[3];
  if (frame.length !== len + 7) throw new Error(`BMS frame length mismatch (expected ${len + 7}, got ${frame.length})`);
  const expected = checksumOver(frame.subarray(2, 4 + len));
  const actual = (frame[4 + len] << 8) | frame[5 + len];
  if (expected !== actual) throw new Error("BMS frame checksum mismatch");
  const status = frame[2];
  if (status !== 0) throw new Error(`BMS reported an error (status 0x${status.toString(16)})`);
  return { command: frame[1], status, data: frame.slice(4, 4 + len) };
}

/** BLE notifications arrive in ~20-byte chunks; this stitches them back into whole frames
 *  and re-syncs if it sees garbage. */
export class JbdFrameAssembler {
  private buf: number[] = [];
  push(chunk: Uint8Array): Uint8Array[] {
    this.buf.push(...Array.from(chunk));
    const out: Uint8Array[] = [];
    for (;;) {
      const start = this.buf.indexOf(0xdd);
      if (start === -1) { this.buf = []; break; }
      if (start > 0) this.buf.splice(0, start);
      if (this.buf.length < 4) break;
      const total = this.buf[3] + 7;
      if (this.buf.length < total) break;
      if (this.buf[total - 1] !== 0x77) { this.buf.shift(); continue; } // false start byte: resync
      out.push(Uint8Array.from(this.buf.slice(0, total)));
      this.buf.splice(0, total);
    }
    return out;
  }
}

export interface JbdBasicInfo {
  packVoltageV: number;
  currentA: number;            // + charging, - discharging
  remainingAh: number;
  nominalAh: number;
  cycles: number;
  productionDate: string;      // YYYY-MM-DD
  balanceMask: number;
  protectionMask: number;
  protectionActive: boolean;
  softwareVersion: number;
  soc: number;                 // %
  fetStatus: number;
  cellCount: number;
  temperaturesC: number[];
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

export function parseJbdBasicInfo(data: Uint8Array): JbdBasicInfo {
  if (data.length < 23) throw new Error("BMS basic-info payload too short");
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ntc = dv.getUint8(22);
  if (data.length < 23 + 2 * ntc) throw new Error("BMS basic-info payload truncated");
  const d = dv.getUint16(10);
  const temperaturesC: number[] = [];
  for (let i = 0; i < ntc; i++) temperaturesC.push(round((dv.getUint16(23 + 2 * i) - 2731) / 10, 1)); // 0.1 K units
  const protectionMask = dv.getUint16(16);
  return {
    packVoltageV: round(dv.getUint16(0) / 100, 2),
    currentA: round(dv.getInt16(2) / 100, 2),
    remainingAh: round(dv.getUint16(4) / 100, 2),
    nominalAh: round(dv.getUint16(6) / 100, 2),
    cycles: dv.getUint16(8),
    productionDate: `${2000 + (d >> 9)}-${String((d >> 5) & 0x0f).padStart(2, "0")}-${String(d & 0x1f).padStart(2, "0")}`,
    balanceMask: dv.getUint16(12) | (dv.getUint16(14) << 16),
    protectionMask,
    protectionActive: protectionMask !== 0,
    softwareVersion: dv.getUint8(18),
    soc: dv.getUint8(19),
    fetStatus: dv.getUint8(20),
    cellCount: dv.getUint8(21),
    temperaturesC,
  };
}

export function parseJbdCellVoltages(data: Uint8Array): number[] {
  if (data.length % 2 !== 0) throw new Error("BMS cell-voltage payload has an odd length");
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 2) out.push(dv.getUint16(i) / 1000); // mV -> V
  return out;
}

// ---------------------------------------------------------------------------------------
// Standard output: what the rest of the app understands, whatever the BMS brand.
// ---------------------------------------------------------------------------------------
export interface MappableCell { id: string; position_in_pack: number | null; original_battery_id: string }

export interface BmsMapped {
  pack: { state_of_charge_pct: number; temps: (number | null)[]; source: "bms_jbd" };
  cells: { cell_id: string; voltage_v: number; temperature_c: number | null; cycle_count: number;
           resistance_mohm: null; source: "bms_jbd" }[];
  warnings: string[];
}

export function mapJbdToReadings(args: {
  batteryId: string;
  basic: JbdBasicInfo;
  cellVoltagesV: number[];
  cells: MappableCell[];
  lastCycleByCell: Record<string, number | undefined>;
}): BmsMapped {
  const { batteryId, basic, cellVoltagesV, cells, lastCycleByCell } = args;
  const warnings: string[] = [];
  const temps: (number | null)[] = Array.from({ length: 6 }, (_, i) => basic.temperaturesC[i] ?? null);
  const hottest = basic.temperaturesC.length ? Math.max(...basic.temperaturesC) : null;

  if (cellVoltagesV.length !== cells.length) {
    warnings.push(`BMS reports ${cellVoltagesV.length} cell group(s) but this pack has ${cells.length} cells registered — matching by position only.`);
  }
  let reused = 0;
  const out: BmsMapped["cells"] = [];
  const ordered = [...cells].sort((a, b) => (a.position_in_pack ?? 0) - (b.position_in_pack ?? 0));
  for (const cell of ordered) {
    const idx = (cell.position_in_pack ?? 0) - 1;
    if (idx < 0 || idx >= cellVoltagesV.length) { warnings.push(`No BMS voltage for ${cell.id} (position ${cell.position_in_pack}) — skipped.`); continue; }
    const v = cellVoltagesV[idx];
    if (!(v > 0 && v <= 6)) { warnings.push(`BMS reported ${v} V for ${cell.id} — skipped.`); continue; }
    const last = lastCycleByCell[cell.id];
    let cycles: number;
    if (cell.original_battery_id === batteryId) {
      cycles = basic.cycles;
      if (last !== undefined && cycles < last) {
        warnings.push(`BMS cycle count (${cycles}) is lower than the ${last} already recorded for ${cell.id} — skipped.`);
        continue;
      }
    } else {
      reused++;
      cycles = last ?? 0; // a pack-level counter says nothing about a cell's earlier life
    }
    out.push({ cell_id: cell.id, voltage_v: v, temperature_c: hottest, cycle_count: cycles, resistance_mohm: null, source: "bms_jbd" });
  }
  if (reused > 0) warnings.push(`${reused} reused cell(s): the BMS cycle counter belongs to this pack, so their earlier cycle counts were carried forward unchanged.`);
  if (basic.protectionActive) warnings.push(`The BMS has a protection flag active (mask 0x${basic.protectionMask.toString(16)}).`);
  return { pack: { state_of_charge_pct: basic.soc, temps, source: "bms_jbd" }, cells: out, warnings };
}

/** SIMULATED BMS frames for demos without hardware. They are real, checksum-valid JBD frames, so they travel through
 *  exactly the same parse -> map -> save path as a real BMS. Always label them as simulated in the UI. */
export function buildSimulatedJbdFrames(cellCount: number, opts: { cycles?: number; soc?: number } = {}) {
  const basic = new Uint8Array(27);
  const dv = new DataView(basic.buffer);
  dv.setUint16(0, Math.round(cellCount * 3.3 * 100));
  dv.setInt16(2, -1250);
  dv.setUint16(4, 1200); dv.setUint16(6, 2000);
  dv.setUint16(8, opts.cycles ?? 120);
  dv.setUint16(10, (24 << 9) | (1 << 5) | 15);
  basic[18] = 0x10; basic[19] = opts.soc ?? 68; basic[20] = 3; basic[21] = cellCount; basic[22] = 2;
  dv.setUint16(23, 2731 + 312); dv.setUint16(25, 2731 + 327);
  const volts = new Uint8Array(cellCount * 2);
  const vdv = new DataView(volts.buffer);
  for (let i = 0; i < cellCount; i++) vdv.setUint16(i * 2, 3290 + ((i * 7) % 20));
  return { basic: buildJbdResponse(JBD_CMD_BASIC, basic), cells: buildJbdResponse(JBD_CMD_CELLS, volts) };
}