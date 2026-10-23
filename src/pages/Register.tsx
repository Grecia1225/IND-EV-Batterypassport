import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { ApprovalGate } from "../components/ApprovalGate";
import { registerBattery, findCellById, uploadBatteryPhoto, type CellInput } from "../lib/dataAccess";
import type { Cell } from "../lib/types";

interface CellRow { reused: boolean; existingCellId: string; foundCell: Cell | null; searchError: string | null }
const blankCell = (): CellRow => ({ reused: false, existingCellId: "", foundCell: null, searchError: null });
/** Set VITE_PUBLIC_BASE_URL in .env to your deployed address so printed QR labels work for everyone. */
const baseUrl = () => ((import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) || window.location.origin).replace(/\/$/, "");

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-ink-500)] mb-1">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)] outline-none focus:border-[var(--color-accent-500)]" />
    </div>
  );
}

function RegisterForm() {
  const navigate = useNavigate();
  const [maker, setMaker] = useState(""); const [model, setModel] = useState(""); const [place, setPlace] = useState("");
  const [mfgDate, setMfgDate] = useState(""); const [chemistry, setChemistry] = useState("LFP (LiFePO4)");
  const [cellCount, setCellCount] = useState(4); const [voltage, setVoltage] = useState(48); const [capacity, setCapacity] = useState(24);
  const [owner, setOwner] = useState(""); const [vehicleType, setVehicleType] = useState("E-rickshaw"); const [isRetro, setIsRetro] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null); const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cellRows, setCellRows] = useState<CellRow[]>(Array.from({ length: 4 }, blankCell));
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null); const [qrUrl, setQrUrl] = useState<string | null>(null);

  const passportUrl = successId ? `${baseUrl()}/p/${successId}` : "";
  useEffect(() => {
    if (!successId) return;
    QRCode.toDataURL(passportUrl, { width: 360, margin: 2, errorCorrectionLevel: "M" }).then(setQrUrl).catch(() => setQrUrl(null));
  }, [successId, passportUrl]);

  function resizeCellRows(count: number) {
    const n = Math.min(500, Math.max(1, count));
    setCellCount(n);
    setCellRows((rows) => { const next = [...rows]; while (next.length < n) next.push(blankCell()); return next.slice(0, n); });
  }
  async function searchCell(index: number, cellId: string) {
    setCellRows((rows) => { const next = [...rows]; next[index] = { ...next[index], existingCellId: cellId, foundCell: null, searchError: null }; return next; });
    if (!cellId.trim()) return;
    const found = await findCellById(cellId.trim());
    setCellRows((rows) => { const next = [...rows]; next[index] = { ...next[index], foundCell: found, searchError: found ? null : "No cell found with that ID." }; return next; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (cellRows.some((r) => r.reused && !r.foundCell)) { setError("Every reused cell needs a valid, found cell ID before submitting."); return; }
    setSubmitting(true);
    let photoUrl: string | null = null;
    if (photoFile) {
      const up = await uploadBatteryPhoto(photoFile);
      if (up.error) { setSubmitting(false); setError(`Photo upload failed: ${up.error}`); return; }
      photoUrl = up.url;
    }
    const cellInputs: CellInput[] = cellRows.map((row) => ({
      reused: row.reused, existingCellId: row.reused ? row.foundCell!.id : undefined, manufactureDate: row.reused ? undefined : mfgDate,
    }));
    const result = await registerBattery({ maker, model, place_of_manufacture: place, manufacture_date: mfgDate, chemistry, cell_count: cellCount,
      nominal_voltage: voltage, capacity_ah: capacity, owner_name: owner, vehicle_type: vehicleType, is_retro_registration: isRetro, photo_url: photoUrl }, cellInputs);
    setSubmitting(false);
    if (result.error) setError(result.error); else setSuccessId(result.batteryId);
  }

  if (successId) {
    return (
      <div className="min-h-screen bg-[var(--color-graphite-950)] flex items-center justify-center px-6">
        <div className="max-w-sm w-full rounded-xl border border-[var(--color-status-good)]/30 bg-[var(--color-status-good-dim)] p-6 text-center">
          <p className="text-sm font-medium text-[var(--color-status-good)] mb-1 no-print">Registered successfully</p>
          <p className="font-mono text-lg text-[var(--color-ink-100)] mb-4">{successId}</p>
          {qrUrl ? <img className="mx-auto mb-4 rounded-lg bg-white p-3" width={200} height={200} alt={`QR code for ${successId}`} src={qrUrl} />
                 : <div className="mx-auto mb-4 h-[200px] w-[200px] rounded-lg bg-white/10" />}
          <p className="text-xs text-[var(--color-ink-500)] mb-4 break-all">{passportUrl}</p>
          <p className="text-[10px] text-[var(--color-ink-500)] mb-4 no-print">
            {passportUrl.includes("localhost") ? "This address only works on this computer. Set VITE_PUBLIC_BASE_URL to your deployed site before printing labels for real batteries." : "Print this label and fix it to the battery."}
          </p>
          <div className="flex gap-2 justify-center no-print">
            <button onClick={() => navigate(`/p/${successId}`)} className="rounded-lg bg-[var(--color-accent-500)] text-[var(--color-graphite-950)] text-sm font-medium px-4 py-2">View passport</button>
            <button onClick={() => window.print()} className="rounded-lg border border-[var(--color-graphite-700)] text-[var(--color-ink-300)] text-sm px-4 py-2">Print QR label</button>
          </div>
        </div>
      </div>
    );
  }

  const sel = "w-full rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)]";
  return (
    <div className="min-h-screen bg-[var(--color-graphite-950)] px-6 py-8">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-ink-100)]">Register a battery</h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-1">Every field here becomes part of the permanent passport record.</p>
        </div>
        <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Maker" value={maker} onChange={setMaker} required />
            <Field label="Model" value={model} onChange={setModel} required />
            <Field label="Place of manufacture" value={place} onChange={setPlace} required />
            <Field label="Manufacture date" type="date" value={mfgDate} onChange={setMfgDate} required />
            <div>
              <label className="block text-xs text-[var(--color-ink-500)] mb-1">Chemistry</label>
              <select value={chemistry} onChange={(e) => setChemistry(e.target.value)} className={sel}>
                <option>LFP (LiFePO4)</option><option>NMC</option><option>LTO</option>
              </select>
            </div>
            <Field label="Cell count" type="number" value={String(cellCount)} onChange={(v) => resizeCellRows(Number(v) || 1)} required />
            <Field label="Nominal voltage (V)" type="number" value={String(voltage)} onChange={(v) => setVoltage(Number(v))} required />
            <Field label="Capacity (Ah)" type="number" value={String(capacity)} onChange={(v) => setCapacity(Number(v))} required />
            <Field label="Owner name" value={owner} onChange={setOwner} required />
            <div>
              <label className="block text-xs text-[var(--color-ink-500)] mb-1">Vehicle type</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={sel}>
                <option>E-rickshaw</option><option>Two-wheeler</option><option>E-loader</option><option>Other</option>
              </select>
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--color-graphite-700)] p-3 cursor-pointer">
            <input type="checkbox" checked={isRetro} onChange={(e) => setIsRetro(e.target.checked)} className="mt-0.5" />
            <div>
              <p className="text-sm text-[var(--color-ink-100)]">This battery is already in use</p>
              <p className="text-xs text-[var(--color-ink-500)] mt-0.5">Tracked history starts from today. The passport will say honestly that earlier usage wasn't recorded.</p>
            </div>
          </label>
          <div className="rounded-lg border border-[var(--color-graphite-700)] p-3">
            <p className="text-sm text-[var(--color-ink-100)] mb-1">Photo evidence (optional)</p>
            <p className="text-xs text-[var(--color-ink-500)] mb-2">JPEG, PNG or WebP, up to 5 MB. A photo of the battery and serial number makes duplicate or fake listings harder.</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="text-xs text-[var(--color-ink-300)]"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setPhotoFile(f); setPhotoPreview(f ? URL.createObjectURL(f) : null); }} />
            {photoPreview && <img src={photoPreview} alt="Battery preview" className="mt-2 rounded-lg max-h-40 object-cover" />}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-graphite-700)] bg-[var(--color-graphite-900)] p-5">
          <h2 className="text-sm font-medium text-[var(--color-ink-100)] mb-1">Cells</h2>
          <p className="text-xs text-[var(--color-ink-500)] mb-4">Each cell gets its own permanent ID. To reuse a cell from a pack you registered, tick the box and enter its ID — its full history moves with it, and the old pack's timeline records that it left.</p>
          <div className="space-y-3">
            {cellRows.map((row, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-graphite-700)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-[var(--color-ink-500)]">Position {i + 1}</span>
                  <label className="flex items-center gap-2 text-xs text-[var(--color-ink-500)]">
                    <input type="checkbox" checked={row.reused} onChange={(e) => { const c = e.target.checked; setCellRows((rows) => { const n = [...rows]; n[i] = { ...blankCell(), reused: c }; return n; }); }} />
                    Reused from another pack
                  </label>
                </div>
                {row.reused && (
                  <div>
                    <input placeholder="Existing cell ID, e.g. CELL-1A2B3C" value={row.existingCellId} onChange={(e) => searchCell(i, e.target.value)}
                      className="w-full rounded-lg bg-[var(--color-graphite-800)] border border-[var(--color-graphite-700)] px-3 py-2 text-sm text-[var(--color-ink-100)] font-mono" />
                    {row.foundCell && <p className="text-xs text-[var(--color-status-good)] mt-1">Found — originally from {row.foundCell.original_battery_id}, currently in {row.foundCell.current_battery_id}. Its history will carry into this pack.</p>}
                    {row.searchError && <p className="text-xs text-[var(--color-status-bad)] mt-1">{row.searchError}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {error && <div className="rounded-lg border border-[var(--color-status-bad)]/30 bg-[var(--color-status-bad-dim)] p-3"><p className="text-xs text-[var(--color-status-bad)]">{error}</p></div>}
        <button type="submit" disabled={submitting} className="rounded-lg bg-[var(--color-accent-500)] hover:bg-[var(--color-accent-600)] text-[var(--color-graphite-950)] font-medium text-sm px-5 py-2.5 disabled:opacity-50">
          {submitting ? "Registering…" : "Register battery"}
        </button>
      </form>
    </div>
  );
}
export function Register() { return <ApprovalGate what="register a battery"><RegisterForm /></ApprovalGate>; }
