import { useEffect, useState } from "react";
import Papa from "papaparse";
import { ApprovalGate } from "../components/ApprovalGate";
import { BluetoothConnectPanel } from "../components/BluetoothConnectPanel";
import { addCellReading, addPackReading, fetchAllBatteries, fetchCellsForBattery } from "../lib/dataAccess";
import { parseReadingsCsv, sortForImport, type CsvParseResult } from "../lib/csvImport";
import { useAuth } from "../lib/auth";
import type { Battery, Cell } from "../lib/types";

const input = "rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)]";
const primary = "rounded-lg bg-[var(--color-accent-500)] hover:bg-[var(--color-accent-600)] text-[var(--color-graphite-950)] font-medium text-sm px-4 py-2 disabled:opacity-50";
const card = "rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-5 space-y-3";
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function AddReadingInner() {
  const { user, role } = useAuth();
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [packId, setPackId] = useState("");
  const [cells, setCells] = useState<Cell[]>([]);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // manual cell reading
  const [cellId, setCellId] = useState(""); const [v, setV] = useState(""); const [res, setRes] = useState(""); const [temp, setTemp] = useState(""); const [cyc, setCyc] = useState("");
  // pack reading
  const [soc, setSoc] = useState(""); const [temps, setTemps] = useState<string[]>(["", "", "", "", "", ""]);
  // csv
  const [csv, setCsv] = useState<CsvParseResult | null>(null); const [csvName, setCsvName] = useState("");

  useEffect(() => { fetchAllBatteries().then((all) => setBatteries(all.filter((b) => role === "admin" || b.created_by === user?.id))); }, [role, user]);
  useEffect(() => { setCsv(null); setCellId(""); if (packId) fetchCellsForBattery(packId).then(setCells); else setCells([]); }, [packId]);

  async function saveManual(e: React.FormEvent) {
    e.preventDefault(); setStatus(null); setBusy(true);
    const r = await addCellReading({ cell_id: cellId, battery_id: packId, voltage_v: Number(v), resistance_mohm: num(res), temperature_c: num(temp), cycle_count: Number(cyc), source: "manual" });
    setBusy(false);
    if (r.error) setStatus({ type: "error", text: r.error });
    else { setStatus({ type: "success", text: `Reading saved for ${cellId}. If it pushed the cell under 20% life, a flag event was logged automatically.` }); setV(""); setRes(""); setTemp(""); setCyc(""); }
  }
  async function savePack(e: React.FormEvent) {
    e.preventDefault(); setStatus(null);
    const t = temps.map(num);
    if (num(soc) === null && t.every((x) => x === null)) { setStatus({ type: "error", text: "Enter the state of charge or at least one temperature." }); return; }
    setBusy(true);
    const r = await addPackReading({ battery_id: packId, state_of_charge_pct: num(soc), temps: t, source: "manual" });
    setBusy(false);
    if (r.error) setStatus({ type: "error", text: r.error }); else { setStatus({ type: "success", text: "Pack reading saved — the passport and dashboard now show this state of charge." }); setSoc(""); setTemps(["", "", "", "", "", ""]); }
  }
  function onCsv(file: File) {
    setCsvName(file.name); setStatus(null);
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true,
      complete: (r) => setCsv(parseReadingsCsv(r.data, r.meta.fields ?? [], cells)),
      error: () => setStatus({ type: "error", text: "Could not read that file." }) });
  }
  async function importCsv() {
    if (!csv) return;
    const ok = sortForImport(csv.rows.filter((r) => r.errors.length === 0));
    setBusy(true); let saved = 0; const failed: string[] = [];
    for (const r of ok) {
      const x = await addCellReading({ cell_id: r.cell_id!, battery_id: packId, voltage_v: r.voltage_v!, resistance_mohm: r.resistance_mohm, temperature_c: r.temperature_c,
        cycle_count: r.cycle_count!, source: "csv_upload", ...(r.recorded_at ? { recorded_at: r.recorded_at } : {}) });
      if (x.error) failed.push(`row ${r.line}: ${x.error}`); else saved++;
    }
    setBusy(false);
    setStatus({ type: failed.length ? "error" : "success", text: `${saved} reading(s) saved${csv.rows.length - ok.length ? `, ${csv.rows.length - ok.length} skipped (invalid)` : ""}.${failed.length ? " Rejected by the database — " + failed.slice(0, 5).join("; ") : ""}` });
    if (!failed.length) setCsv(null);
  }
  function template() {
    const rows = ["cell_id,voltage_v,resistance_mohm,temperature_c,cycle_count,recorded_at", ...cells.map((c) => `${c.id},,,,,`)];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = `${packId}-readings-template.csv`; a.click();
  }

  const validRows = csv?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Add readings</h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-1">Nothing is ever overwritten. The database refuses a falling cycle count, a reading dated before the last one, and a reading against the wrong pack.</p>
        </div>
        <div className={card}>
          <label className="block text-xs text-[var(--color-ink-500)]">Pack (your registrations)</label>
          <select value={packId} onChange={(e) => setPackId(e.target.value)} className={`${input} w-full`}>
            <option value="">Select a pack…</option>
            {batteries.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.maker} {b.model}</option>)}
          </select>
        </div>
        {status && <div className={`rounded-lg border p-3 text-xs ${status.type === "success" ? "border-[var(--color-status-good)]/30 bg-[var(--color-status-good-dim)] text-[var(--color-status-good)]" : "border-[var(--color-status-bad)]/30 bg-[var(--color-status-bad-dim)] text-[var(--color-status-bad)]"}`}>{status.text}</div>}
        {packId && (<>
          <BluetoothConnectPanel packId={packId} onSaved={() => setStatus({ type: "success", text: "BMS data saved." })} />

          <form onSubmit={savePack} className={card}>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)]">Pack reading: state of charge &amp; 6 temperature sensors</h2>
            <div className="grid grid-cols-3 gap-3">
              <input type="number" step="1" min="0" max="100" placeholder="State of charge %" value={soc} onChange={(e) => setSoc(e.target.value)} className={input} />
              {temps.map((t, i) => <input key={i} type="number" step="0.1" placeholder={`Sensor ${i + 1} °C`} value={t} onChange={(e) => setTemps((p) => p.map((x, j) => (j === i ? e.target.value : x)))} className={input} />)}
            </div>
            <button disabled={busy} className={primary}>Save pack reading</button>
          </form>

          <form onSubmit={saveManual} className={card}>
            <h2 className="text-sm font-medium text-[var(--color-ink-100)]">Cell reading (manual)</h2>
            <div className="grid grid-cols-2 gap-3">
              <select required value={cellId} onChange={(e) => setCellId(e.target.value)} className={`${input} col-span-2`}>
                <option value="">Select cell…</option>{cells.map((c) => <option key={c.id} value={c.id}>{c.id} (position {c.position_in_pack})</option>)}
              </select>
              <input required type="number" step="0.001" placeholder="Voltage (V)" value={v} onChange={(e) => setV(e.target.value)} className={input} />
              <input type="number" step="0.1" placeholder="Resistance (mΩ) — optional" value={res} onChange={(e) => setRes(e.target.value)} className={input} />
              <input type="number" step="0.1" placeholder="Temperature (°C) — optional" value={temp} onChange={(e) => setTemp(e.target.value)} className={input} />
              <input required type="number" step="1" min="0" placeholder="Cycle count" value={cyc} onChange={(e) => setCyc(e.target.value)} className={input} />
            </div>
            <button disabled={busy} className={primary}>Save reading</button>
          </form>

          <div className={card}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-[var(--color-ink-100)]">Import a tester file (CSV)</h2>
              <button onClick={template} className="text-xs text-[var(--color-accent-400)]">Download template for this pack</button>
            </div>
            <p className="text-xs text-[var(--color-ink-500)]">Column names are matched automatically (e.g. "Voltage (V)", "IR", "Cycles", "Cell #"). Cells can be identified by ID or by position. An optional date column (YYYY-MM-DD or DD/MM/YYYY) lets you import history.</p>
            <input type="file" accept=".csv,text/csv" className="text-xs text-[var(--color-ink-300)]" onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
            {csv && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--color-ink-300)]">{csvName}: {csv.rows.length} rows — <span className="text-[var(--color-status-good)]">{validRows} ready</span>{csv.rows.length - validRows > 0 && <>, <span className="text-[var(--color-status-bad)]">{csv.rows.length - validRows} with problems</span></>}</p>
                {csv.missingRequired.length > 0 && <p className="text-xs text-[var(--color-status-bad)]">Couldn't find a column for: {csv.missingRequired.join(", ")}.</p>}
                <p className="text-[10px] text-[var(--color-ink-500)]">Matched: {Object.entries(csv.mapping).map(([k, h]) => `${k} ← "${h}"`).join(" · ")}{csv.unusedHeaders.length ? ` · ignored: ${csv.unusedHeaders.join(", ")}` : ""}</p>
                <div className="overflow-x-auto rounded-lg border border-[var(--color-graphite-700)] max-h-64">
                  <table className="w-full text-xs"><thead className="bg-[var(--color-graphite-800)] text-[var(--color-ink-500)] sticky top-0"><tr>
                    {["Row", "Cell", "V", "Cycles", "Date", "Check"].map((h) => <th key={h} className="text-left px-2 py-1.5">{h}</th>)}</tr></thead>
                    <tbody className="font-mono text-[var(--color-ink-300)]">{csv.rows.slice(0, 50).map((r) => (
                      <tr key={r.line} className="border-t border-[var(--color-graphite-800)]">
                        <td className="px-2 py-1">{r.line}</td><td className="px-2 py-1">{r.cell_id ?? "—"}</td><td className="px-2 py-1">{r.voltage_v ?? "—"}</td>
                        <td className="px-2 py-1">{r.cycle_count ?? "—"}</td><td className="px-2 py-1">{r.recorded_at ? r.recorded_at.slice(0, 10) : "now"}</td>
                        <td className={`px-2 py-1 font-sans ${r.errors.length ? "text-[var(--color-status-bad)]" : "text-[var(--color-status-good)]"}`}>{r.errors.length ? r.errors.join("; ") : "OK"}</td>
                      </tr>))}</tbody></table>
                </div>
                {csv.rows.length > 50 && <p className="text-[10px] text-[var(--color-ink-700)]">Showing the first 50 rows; all valid rows are imported.</p>}
                <button disabled={busy || validRows === 0} onClick={importCsv} className={primary}>{busy ? "Importing…" : `Import ${validRows} valid row(s)`}</button>
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  );
}
export function AddReading() { return <ApprovalGate what="add readings"><AddReadingInner /></ApprovalGate>; }
