import { useState } from "react";
import { isBluetoothSupported, readJbdBms, readStandardBatteryLevel } from "../lib/bluetooth";
import { buildSimulatedJbdFrames, parseJbdFrame, parseJbdBasicInfo, parseJbdCellVoltages, mapJbdToReadings, type BmsMapped, type JbdBasicInfo } from "../lib/bms/jbd";
import { addCellReading, addPackReading, fetchCellsForBattery, fetchReadingsForCell } from "../lib/dataAccess";

interface Decoded { label: string; simulated: boolean; basic: JbdBasicInfo; volts: number[] }

export function BluetoothConnectPanel({ packId, onSaved }: { packId: string; onSaved?: () => void }) {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [mapped, setMapped] = useState<BmsMapped | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error" | "info"; text: string } | null>(null);

  async function lastCycles(cells: { id: string }[]) {
    const out: Record<string, number | undefined> = {};
    for (const c of cells) { const rs = await fetchReadingsForCell(c.id); out[c.id] = rs.length ? rs[rs.length - 1].cycle_count : undefined; }
    return out;
  }
  async function prepare(d: Decoded) {
    const cells = await fetchCellsForBattery(packId);
    setDecoded(d);
    setMapped(mapJbdToReadings({ batteryId: packId, basic: d.basic, cellVoltagesV: d.volts, cells, lastCycleByCell: await lastCycles(cells) }));
  }
  function needPack() { if (!packId) { setMsg({ type: "error", text: "Choose a pack first (above)." }); return true; } return false; }

  async function readReal() {
    if (needPack()) return;
    setBusy(true); setMsg({ type: "info", text: "Choose your BMS in the browser's Bluetooth window…" });
    try { const r = await readJbdBms(); await prepare({ label: r.deviceName, simulated: false, basic: r.basic, volts: r.cellVoltagesV }); setMsg(null); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "Bluetooth read failed or was cancelled." }); }
    setBusy(false);
  }
  async function simulate() {
    if (needPack()) return;
    setBusy(true); setMsg(null);
    try {
      const cells = await fetchCellsForBattery(packId);
      const last = await lastCycles(cells);
      const cycles = Math.max(0, ...Object.values(last).map((v) => v ?? 0)) + 5;
      const f = buildSimulatedJbdFrames(cells.length || 4, { cycles });
      await prepare({ label: "SIMULATED BMS", simulated: true,
        basic: parseJbdBasicInfo(parseJbdFrame(f.basic).data), volts: parseJbdCellVoltages(parseJbdFrame(f.cells).data) });
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "Simulation failed" }); }
    setBusy(false);
  }
  async function generic() {
    setBusy(true);
    try { const r = await readStandardBatteryLevel();
      setMsg({ type: "info", text: r.batteryLevelPct !== null ? `"${r.deviceName}" reports ${r.batteryLevelPct}% (the device's own battery — this is NOT pack data and is not saved).` : `"${r.deviceName}" connected but exposes no battery level.` });
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "Bluetooth failed or was cancelled." }); }
    setBusy(false);
  }
  async function save() {
    if (!mapped || !decoded || decoded.simulated) return;
    setBusy(true);
    const errors: string[] = []; let saved = 0;
    const p = await addPackReading({ battery_id: packId, state_of_charge_pct: mapped.pack.state_of_charge_pct, temps: mapped.pack.temps, source: "bms_jbd" });
    if (p.error) errors.push(`pack reading: ${p.error}`);
    for (const c of mapped.cells) {
      const r = await addCellReading({ cell_id: c.cell_id, battery_id: packId, voltage_v: c.voltage_v, resistance_mohm: null, temperature_c: c.temperature_c, cycle_count: c.cycle_count, source: "bms_jbd" });
      if (r.error) errors.push(`${c.cell_id}: ${r.error}`); else saved++;
    }
    setBusy(false);
    setMsg(errors.length ? { type: "error", text: `Saved ${saved} cell reading(s). Problems: ${errors.join("; ")}` } : { type: "ok", text: `Saved the pack reading and ${saved} cell reading(s) from the BMS.` });
    if (!errors.length) { setDecoded(null); setMapped(null); onSaved?.(); }
  }

  const btn = "rounded-lg border border-[var(--color-accent-500)]/40 text-[var(--color-accent-400)] hover:bg-[var(--color-accent-500)]/10 text-sm px-3 py-2 disabled:opacity-50";
  return (
    <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-5 space-y-3">
      <h2 className="text-sm font-medium text-[var(--color-ink-100)]">Read from a BMS over Bluetooth</h2>
      <p className="text-xs text-[var(--color-ink-500)] leading-relaxed">
        Supports JBD / Xiaoxiang smart-BMS boards (a common aftermarket board in LFP packs; the protocol is public). Each BMS family needs its own small adapter —
        other brands are added the same way once their protocol is available. <b>Experimental: the decoder is tested against protocol sample frames, not yet against a physical BMS.</b>
      </p>
      <div className="flex flex-wrap gap-2">
        {isBluetoothSupported && <button disabled={busy} onClick={readReal} className={btn}>Read real BMS (JBD)</button>}
        <button disabled={busy} onClick={simulate} className={btn}>Simulate a BMS (preview only)</button>
        {isBluetoothSupported && <button disabled={busy} onClick={generic} className={btn}>Generic device battery %</button>}
      </div>
      {!isBluetoothSupported && <p className="text-xs text-[var(--color-status-warn)]">Web Bluetooth isn't available in this browser (use Chrome/Edge on desktop or Android, over HTTPS or localhost). The simulation still works.</p>}
      {decoded && mapped && (
        <div className="rounded-lg border border-[var(--color-graphite-700)] p-3 space-y-2 text-xs">
          <p className={decoded.simulated ? "text-[var(--color-status-warn)] font-medium" : "text-[var(--color-ink-100)] font-medium"}>
            {decoded.simulated ? "SIMULATED data — shows how a real BMS read is decoded and mapped to this pack. It is never saved." : `Read from "${decoded.label}"`}
          </p>
          <p className="font-mono text-[var(--color-ink-300)]">
            {decoded.basic.packVoltageV} V · {decoded.basic.currentA} A · SoC {decoded.basic.soc}% · {decoded.basic.cycles} cycles · temps {decoded.basic.temperaturesC.join(", ") || "—"} °C
          </p>
          <p className="font-mono text-[var(--color-ink-500)]">cells: {decoded.volts.map((v) => v.toFixed(3)).join("  ")}</p>
          <p className="text-[var(--color-ink-300)]">Will save: 1 pack reading + {mapped.cells.length} cell reading(s) (voltage, cycles, temperature; no per-cell resistance).</p>
          {mapped.warnings.map((w, i) => <p key={i} className="text-[var(--color-status-warn)]">• {w}</p>)}
          {!decoded.simulated && <button disabled={busy || mapped.cells.length === 0} onClick={save} className={btn}>Save to this pack</button>}
        </div>
      )}
      {msg && <p className={`text-xs ${msg.type === "error" ? "text-[var(--color-status-bad)]" : msg.type === "ok" ? "text-[var(--color-status-good)]" : "text-[var(--color-ink-500)]"}`}>{msg.text}</p>}
    </div>
  );
}
